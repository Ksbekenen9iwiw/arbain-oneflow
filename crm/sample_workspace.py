from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date

from crm.access import active_sales, role_of, sample_requests_for
from crm.models import Customer, Order, SamplePolicy, SampleRequest
from crm.services.samples import recommend


def person(user):
    return {'id': user.pk, 'name': user.get_full_name() or user.username} if user else None


def _request_row(request, include_allocations=False):
    lines = []
    for line in request.lines.all():
        item = {
            'id': line.pk,
            'product': {'id': line.product_id, 'sku': line.product.sku, 'name': line.product.name, 'unit': line.product.unit},
            'quantity': line.quantity,
        }
        if include_allocations:
            item['allocations'] = [
                {'id': allocation.pk, 'batch_id': allocation.batch_id, 'batch_code': allocation.batch.code,
                 'expiry_date': allocation.batch.expiry_date, 'quantity': allocation.quantity,
                 'status': allocation.batch.status, 'status_label': allocation.batch.get_status_display()}
                for allocation in line.allocations.all()
            ]
        lines.append(item)
    return {
        'id': request.pk,
        'number': request.number,
        'customer': {'id': request.customer_id, 'code': request.customer.code, 'name': request.customer.name,
                     'phone': request.customer.phone, 'address': request.customer.address},
        'sales': person(request.sales),
        'status': request.status,
        'status_label': request.get_status_display(),
        'fulfillment_status': request.fulfillment_status,
        'fulfillment_label': request.get_fulfillment_status_display(),
        'outcome': request.outcome,
        'outcome_label': request.get_outcome_display(),
        'purpose': request.purpose,
        'customer_need': request.customer_need,
        'potential_orders': request.potential_orders,
        'business_profile': request.business_profile,
        'notes': request.notes,
        'decision_note': request.decision_note,
        'recommendation_at_decision': request.recommendation_at_decision,
        'recommendation_label': dict(SampleRequest.Recommendation.choices).get(request.recommendation_at_decision, ''),
        'policy_snapshot': request.policy_snapshot,
        'evidence_snapshot': request.evidence_snapshot,
        'decided_by': person(request.decided_by),
        'decided_at': request.decided_at,
        'shipped_by': person(request.shipped_by),
        'shipped_at': request.shipped_at,
        'received_by': person(request.received_by),
        'received_at': request.received_at,
        'cancelled_by': person(request.cancelled_by),
        'cancelled_at': request.cancelled_at,
        'cancel_reason': request.cancel_reason,
        'order': {'id': request.order_id, 'number': f'OF-{request.order_id:04d}', 'total': request.order.total_rupiah} if request.order_id else None,
        'created_at': request.created_at,
        'updated_at': request.updated_at,
        'lines': lines,
    }


def sample_records(actor, params):
    role = role_of(actor)
    records = sample_requests_for(actor).prefetch_related('lines__product')
    status = params.get('status', '')
    status = status if status in SampleRequest.Status.values else ''
    fulfillment = params.get('fulfillment', '')
    fulfillment = fulfillment if fulfillment in SampleRequest.FulfillmentStatus.values else ''
    customer = params.get('customer', '')
    sales = params.get('sales', '')
    if customer:
        if not customer.isascii() or not customer.isdecimal() or len(customer) > 18:
            raise Http404
        customer = str(get_object_or_404(Customer.objects.filter(sample_requests__in=records).distinct(), pk=customer).pk)
        records = records.filter(customer_id=customer)
    sales_options = active_sales() if role == 'MANAGER' else []
    if sales:
        if role != 'MANAGER':
            raise PermissionDenied
        if not sales.isascii() or not sales.isdecimal() or len(sales) > 18:
            raise Http404
        sales = str(get_object_or_404(sales_options, pk=sales).pk)
        records = records.filter(sales_id=sales)
    query = params.get('q', '').strip()
    if query:
        match = Q(customer__name__icontains=query) | Q(customer__code__icontains=query)
        number = query.upper().removeprefix('SP-').removeprefix('SMP-')
        if number.isascii() and number.isdecimal() and len(number) <= 18:
            match |= Q(pk=int(number))
        records = records.filter(match)
    if fulfillment:
        records = records.filter(fulfillment_status=fulfillment)
    raw_start, raw_end, date_error = params.get('from', ''), params.get('to', ''), ''
    if raw_start or raw_end:
        try:
            start, end = parse_date(raw_start), parse_date(raw_end)
        except ValueError:
            start, end = None, None
        if not start or not end or start > end:
            date_error = 'Isi kedua tanggal dengan rentang yang valid. Hasil belum dibatasi periode.'
        else:
            records = records.filter(created_at__date__gte=start, created_at__date__lte=end)
    status_counts = {value: records.filter(status=value).count() for value in SampleRequest.Status.values}
    if status:
        records = records.filter(status=status)
    sort = params.get('sort', '-created_at')
    if sort not in {'created_at', '-created_at', 'number', '-number'}:
        sort = '-created_at'
    records = records.order_by(('-' if sort.startswith('-') else '') + ('pk' if sort.lstrip('-') == 'number' else 'created_at'), '-pk')
    paginator = Paginator(records, 20)
    raw_page = params.get('page', '1')
    number = int(raw_page) if raw_page.isascii() and raw_page.isdecimal() and len(raw_page) <= 9 else 1
    page = paginator.get_page(number)
    rows = [_request_row(request) for request in page.object_list]
    customer_options = Customer.objects.filter(sample_requests__in=sample_requests_for(actor)).distinct().order_by('name')
    return {
        'samples': rows, 'query': query, 'status_counts': status_counts,
        'status_options': [{'value': value, 'label': label} for value, label in SampleRequest.Status.choices],
        'fulfillment_options': [{'value': value, 'label': label} for value, label in SampleRequest.FulfillmentStatus.choices],
        'selected_status': status,
        'selected_fulfillment': fulfillment,
        'selected_customer': customer,
        'selected_sales': sales,
        'selected_sort': sort,
        'date_from': raw_start,
        'date_to': raw_end,
        'date_error': date_error,
        'customer_options': [{'value': str(item.pk), 'label': f'{item.code} · {item.name}'} for item in customer_options],
        'sales_options': [{'value': str(item.pk), 'label': item.get_full_name() or item.username} for item in sales_options],
        'page': page.number,
        'pages': paginator.num_pages,
        'total': paginator.count,
    }


def sample_context(actor, request):
    role = role_of(actor)
    include_allocations = role in {'WAREHOUSE', 'MANAGER'}
    current = _request_row(request, include_allocations=include_allocations)
    shipped = list(request.customer.orders.filter(status=Order.Status.SHIPPED).order_by('-shipped_at', '-pk'))
    previous = list(
        request.customer.sample_requests.exclude(pk=request.pk)
        .select_related('sales', 'decided_by', 'order')
        .prefetch_related('lines__product', 'followups')
        .order_by('-created_at', '-pk')
    )
    previous_rows = [_request_row(item) for item in previous]
    followups = [
        {
            'id': followup.pk,
            'request_number': followup.request.number,
            'followup_date': followup.followup_date,
            'response': followup.response,
            'outcome': followup.outcome,
            'outcome_label': followup.get_outcome_display(),
            'note': followup.note,
            'actor': person(followup.actor),
            'created_at': followup.created_at,
        }
        for item in [request, *previous]
        for followup in item.followups.all()
    ]
    policy = SamplePolicy.objects.filter(pk=1).first()
    return {
        'sample': current,
        'recommendation': recommend(request) if request.status in {SampleRequest.Status.SUBMITTED, SampleRequest.Status.DRAFT} else {
            'result': request.recommendation_at_decision or SampleRequest.Recommendation.REVIEW,
            'label': current['recommendation_label'] or 'Perlu ditinjau',
            'reasons': request.evidence_snapshot.get('reasons', []),
            'policy': request.policy_snapshot,
            'evidence': request.evidence_snapshot,
        },
        'history': {
            'has_history': bool(shipped or previous or followups),
            'purchase_count': len(shipped),
            'purchase_total': sum(order.total_rupiah for order in shipped),
            'last_purchase_at': shipped[0].shipped_at if shipped else None,
            'previous_samples': previous_rows,
            'received_samples': [item for item in previous_rows if item['fulfillment_status'] == SampleRequest.FulfillmentStatus.RECEIVED],
            'followups': followups,
            'linked_orders': [item['order'] for item in previous_rows if item['order']],
        },
        'policy': {
            'configured': bool(policy and policy.is_configured),
            'repeat_threshold': policy.repeat_threshold if policy else None,
            'review_period_days': policy.review_period_days if policy else None,
            'evaluation_days': policy.evaluation_days if policy else None,
        },
        'can_edit': role in {'SALES', 'MANAGER'} and request.status == SampleRequest.Status.DRAFT,
        'can_submit': role in {'SALES', 'MANAGER'} and request.status == SampleRequest.Status.DRAFT,
        'can_decide': role == 'MANAGER' and request.status == SampleRequest.Status.SUBMITTED,
        'can_cancel': role in {'SALES', 'MANAGER'} and ((request.status in {SampleRequest.Status.DRAFT, SampleRequest.Status.SUBMITTED} and request.fulfillment_status == SampleRequest.FulfillmentStatus.PENDING) or (request.status == SampleRequest.Status.APPROVED and request.fulfillment_status == SampleRequest.FulfillmentStatus.WAITING)),
        'can_ship': role in {'WAREHOUSE', 'MANAGER'} and request.status == SampleRequest.Status.APPROVED and request.fulfillment_status == SampleRequest.FulfillmentStatus.WAITING,
        'can_receive': role in {'SALES', 'WAREHOUSE', 'MANAGER'} and request.status == SampleRequest.Status.APPROVED and request.fulfillment_status == SampleRequest.FulfillmentStatus.SHIPPED,
        'can_followup': role in {'SALES', 'MANAGER'} and request.fulfillment_status == SampleRequest.FulfillmentStatus.RECEIVED,
    }


def sample_tasks(actor):
    role = role_of(actor)
    records = sample_requests_for(actor).select_related('customer', 'sales').order_by('created_at', 'pk')
    if role == 'MANAGER':
        records = records.filter(status=SampleRequest.Status.SUBMITTED)
        task = 'Tinjau pengajuan'
    elif role == 'WAREHOUSE':
        records = records.filter(status=SampleRequest.Status.APPROVED, fulfillment_status=SampleRequest.FulfillmentStatus.WAITING)
        task = 'Siapkan sampel'
    else:
        records = records.filter(status=SampleRequest.Status.APPROVED, fulfillment_status=SampleRequest.FulfillmentStatus.RECEIVED, outcome=SampleRequest.Outcome.NOT_FOLLOWED_UP)
        task = 'Tindak lanjuti sampel'
    return [
        {'id': request.pk, 'number': request.number, 'customer_name': request.customer.name,
         'sales_name': request.sales.get_full_name() or request.sales.username, 'task': task,
         'created_at': request.created_at}
        for request in records[:5]
    ]
