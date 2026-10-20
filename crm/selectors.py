from django.shortcuts import get_object_or_404
from collections import defaultdict
from datetime import timedelta
from django.core.exceptions import PermissionDenied
from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth.models import User
from django.db.models import F, Q
from django.utils import timezone
from crm.access import active_sales, customers_for, orders_for, role_of
from crm.models import Activity, Product, SalesTarget


def activity_due(activity):
    dates = [value for value in (activity.scheduled_date, activity.followup_date) if value]
    return min(dates) if dates else None


def customer_records(actor, params, as_of):
    """Filter the authorized scope, independent of the currently visible results."""
    from django.db.models import Prefetch
    from django.http import Http404
    scope = customers_for(actor)
    owners = User.objects.filter(pk__in=scope.values('owner_id')).order_by('first_name', 'username')
    selected_sales = params.get('sales', '')
    if selected_sales:
        if role_of(actor) != 'MANAGER':
            raise PermissionDenied
        if not selected_sales.isascii() or not selected_sales.isdecimal() or len(selected_sales) > 18:
            raise Http404
        selected_sales = str(get_object_or_404(owners, pk=selected_sales).pk)
    query = params.get('q', '').strip()
    status = params.get('status', '')
    status = status if status in ('active', 'inactive') else ''
    view = params.get('view', '')
    view = view if view in ('overdue', 'today') else ''
    sort = params.get('sort', 'name')
    sort = sort if sort in ('name', '-name', 'next_due', '-next_due') else 'name'
    records = scope
    if selected_sales:
        records = records.filter(owner_id=selected_sales)
    if query:
        records = records.filter(Q(name__icontains=query) | Q(code__icontains=query) | Q(phone__icontains=query))
    if status:
        records = records.filter(is_active=status == 'active')
    records = list(records.prefetch_related(Prefetch('activities', queryset=Activity.objects.order_by('-created_at', '-pk'))))
    for customer in records:
        activities = list(customer.activities.all())
        planned = [a for a in activities if a.status == 'PLANNED']
        planned.sort(key=lambda a: (activity_due(a) is None, activity_due(a) or as_of, a.pk))
        next_activity = planned[0] if planned else None
        customer.summary = {
            'open_count': len(planned),
            'overdue_count': sum(activity_due(a) is not None and activity_due(a) < as_of for a in planned),
            'today_count': sum(activity_due(a) == as_of for a in planned),
            'next_activity': {'id': next_activity.pk, 'kind': next_activity.get_kind_display(), 'due': activity_due(next_activity)} if next_activity else None,
            'latest_stage': max(activities, key=lambda a: (a.completed_at or a.created_at, a.pk)).get_stage_display() if activities else None,
            'latest_recorded_at': max((a.completed_at or a.created_at for a in activities), default=None),
        }
    counts = {'all': len(records), 'overdue': sum(c.summary['overdue_count'] > 0 for c in records), 'today': sum(c.summary['today_count'] > 0 for c in records)}
    if view:
        records = [c for c in records if c.summary[view + '_count'] > 0]
    if sort.lstrip('-') == 'name':
        records.sort(key=lambda c: (c.name.casefold(), c.pk), reverse=sort.startswith('-'))
    else:
        def due(c):
            return (c.summary['next_activity'] or {}).get('due')
        dated = sorted((c for c in records if due(c)), key=lambda c: (due(c), c.pk), reverse=sort.startswith('-'))
        records = dated + sorted((c for c in records if not due(c)), key=lambda c: (c.name.casefold(), c.pk))
    return {'customers': records, 'query': query, 'selected_sales': selected_sales, 'selected_status': status,
            'selected_view': view, 'selected_sort': sort, 'view_counts': counts,
            'sales_options': [{'value': str(s.pk), 'label': s.get_full_name() or s.username} for s in owners] if role_of(actor) == 'MANAGER' else []}


def customer_history(actor, customer_id):
    customer = get_object_or_404(customers_for(actor), pk=customer_id)
    activities = list(customer.activities.select_related('sales', 'customer__owner'))
    for activity in activities:
        activity.due = activity_due(activity)
    opened = sorted((a for a in activities if a.status == 'PLANNED'), key=lambda a: (a.due is None, a.due or timezone.localdate(), a.pk))
    orders = list(orders_for(actor).filter(customer=customer).prefetch_related('lines__product'))
    from crm.customer_workspace import customer_context, customer_next_actions, customer_samples
    context = customer_context(customer, activities, orders)
    from crm.services.actions import compute_candidates
    patterns = []
    for candidate in compute_candidates(actor, timezone.localdate()):
        if candidate.customer_id != customer.id or candidate.product_id is None:
            continue
        reasons = candidate.reasons
        spread = max(reasons['intervals_days']) - min(reasons['intervals_days'])
        patterns.append({'product_name': reasons['product_name'], 'product_sku': reasons.get('product_sku'), 'product_id': candidate.product_id,
                         'purchase_dates': reasons['purchase_dates'], 'purchase_date_count': reasons['purchase_date_count'],
                         'intervals_days': reasons['intervals_days'], 'interval_days': reasons['interval_days'],
                         'last_purchase_date': reasons['last_purchase_date'], 'typical_quantity': candidate.typical_quantity,
                         'available_quantity': candidate.available_quantity, 'unit': reasons['unit'],
                         'next_due': candidate.due_date, 'inbound': reasons.get('inbound', []),
                         'consistent': spread <= max(7, reasons['interval_days'] // 2)})
    shipped = [(timezone.localdate(line.order.shipped_at), line) for order in orders
                 if order.status == 'SHIPPED' and order.shipped_at for line in order.lines.all()]
    by_product = {}
    for day, line in shipped:
        row = by_product.setdefault(line.product_id, {'product_name': line.product.name, 'product_sku': line.product.sku, 'dates': set()})
        row['dates'].add(day)
    have_pattern = {p['product_sku'] for p in patterns}
    thin = sorted(({'product_name': row['product_name'], 'product_sku': row['product_sku'], 'dates': sorted(row['dates'])}
                   for row in by_product.values() if len(row['dates']) < 3 and row['product_sku'] not in have_pattern),
                  key=lambda row: row['product_sku'])
    context['overdue_count'] = sum(bool(a.due and a.due < timezone.localdate()) for a in opened)
    context['reorder_patterns'] = sorted(patterns, key=lambda p: (p['next_due'], p['product_sku']))
    context['thin_history'] = thin
    context['next_actions'] = customer_next_actions(
        actor, customer, opened, context['reorder_patterns'], orders, timezone.localdate())
    context['samples'] = customer_samples(actor, customer)
    return dict(context, customer=customer, activities=activities, open_activities=opened,
                completed_activities=sorted((a for a in activities if a.status == 'DONE'), key=lambda a: (a.completed_at or a.created_at, a.pk), reverse=True), orders=orders)



def dashboard_sales():
    """Active sales plus historical owners, so former team members remain filterable."""
    from crm.models import Order
    return User.objects.filter(Q(pk__in=active_sales()) | Q(pk__in=Order.objects.values('sales_id'))).distinct().order_by('username')


def dashboard_activities(actor, sales_id=None):
    activities = Activity.objects.filter(customer__in=customers_for(actor))
    return activities.filter(customer__owner_id=sales_id) if sales_id else activities


def dashboard_metrics(actor, as_of, sales_id=None):
    role = role_of(actor)
    month = as_of.replace(day=1)
    if sales_id and (role != 'MANAGER' or not dashboard_sales().filter(pk=sales_id).exists()):
        raise PermissionDenied
    order_scope = orders_for(actor)
    if sales_id:
        order_scope = order_scope.filter(sales_id=sales_id)
    metrics = {'shipped_value_rupiah': 0, 'shipped_order_count': 0, 'planned_activity_count': 0, 'done_activity_count': 0, 'overdue_activity_count': 0, 'pending_shipment_count': order_scope.filter(status='CONFIRMED').count(), 'low_stock_count': Product.objects.filter(is_active=True, balance__on_hand__lt=F('balance__reserved') + F('min_stock')).count(), 'sales_rows': []}
    metrics['stock_conflict_count'] = Product.objects.filter(balance__on_hand__lt=F('balance__reserved')).count()
    if role == 'WAREHOUSE':
        return metrics
    start = min(month, as_of - timedelta(days=29))
    days = {start + timedelta(days=i): {'date': start + timedelta(days=i), 'value_rupiah': 0, 'order_count': 0} for i in range((as_of - start).days + 1)}
    shipped_by_sales = defaultdict(int)
    for order in order_scope.filter(status='SHIPPED', shipped_at__date__gte=start, shipped_at__date__lte=as_of):
        shipped_date = timezone.localdate(order.shipped_at)
        if shipped_date in days:
            days[shipped_date]['value_rupiah'] += order.total_rupiah
            days[shipped_date]['order_count'] += 1
        if month <= shipped_date <= as_of:
            metrics['shipped_order_count'] += 1
            metrics['shipped_value_rupiah'] += order.total_rupiah
            shipped_by_sales[order.sales_id] += order.total_rupiah
    metrics['shipment_days'] = list(days.values())
    activities = dashboard_activities(actor, sales_id)
    metrics['planned_activity_count'] = activities.filter(status='PLANNED').count()
    metrics['done_activity_count'] = activities.filter(status='DONE').count()
    metrics['overdue_activity_count'] = activities.filter(status='PLANNED').filter(Q(followup_date__lt=as_of) | Q(scheduled_date__lt=as_of)).count()
    users = User.objects.filter(pk=actor.id) if role == 'SALES' else User.objects.filter(Q(pk__in=active_sales()) | Q(pk__in=shipped_by_sales)).distinct().order_by('username')
    if sales_id:
        users = dashboard_sales().filter(pk=sales_id)
    targets = {target.sales_id: target.target_rupiah for target in SalesTarget.objects.filter(month=month)}
    for sales in users:
        value, target = shipped_by_sales[sales.id], targets.get(sales.id, 0)
        achievement = float((Decimal(value) * 100 / Decimal(target)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)) if target else None
        metrics['sales_rows'].append({'sales_id': sales.id, 'sales_name': sales.get_full_name() or sales.username, 'shipped_value_rupiah': value, 'target_rupiah': target, 'target_set': sales.id in targets, 'achievement_percent': achievement})
    # Match dashboard scope: activities follow the customer's current owner;
    # orders keep their recorded sales attribution.
    from collections import Counter
    overdue_by_sales = Counter(activities.filter(status='PLANNED').filter(Q(followup_date__lt=as_of) | Q(scheduled_date__lt=as_of)).values_list('customer__owner_id', flat=True))
    pending_by_sales = Counter(order_scope.filter(status='CONFIRMED').values_list('sales_id', flat=True))
    for row in metrics['sales_rows']:
        row['overdue_activity_count'] = overdue_by_sales[row['sales_id']]
        row['pending_shipment_count'] = pending_by_sales[row['sales_id']]
    rows = metrics['sales_rows']
    target_total = sum(row['target_rupiah'] for row in rows)
    complete = bool(rows) and all(row['target_set'] for row in rows)
    metrics['target_summary'] = {
        'target_rupiah': target_total, 'is_complete': complete,
        'set_count': sum(row['target_set'] for row in rows), 'sales_count': len(rows),
        'achievement_percent': float((Decimal(metrics['shipped_value_rupiah']) * 100 / Decimal(target_total)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)) if complete and target_total else None,
    }
    return metrics


def order_records(actor, params):
    from django.db.models import Count
    from django.utils.dateparse import parse_date
    from django.http import Http404
    role = role_of(actor)
    allowed = ['CONFIRMED', 'SHIPPED'] if role == 'WAREHOUSE' else ['DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED']
    status = params.get('status', '')
    status = status if status in allowed else ''
    records = orders_for(actor)
    sales_options = dashboard_sales() if role == 'MANAGER' else []
    sales = params.get('sales', '')
    if sales:
        if role != 'MANAGER':
            raise PermissionDenied
        if not sales.isascii() or not sales.isdecimal() or len(sales) > 18:
            raise Http404
        sales = str(get_object_or_404(sales_options, pk=sales).pk)
        records = records.filter(sales_id=sales)
    query = params.get('q', '').strip()
    if query:
        condition = Q(customer__name__icontains=query)
        number = query.upper().removeprefix('OF-')
        if number.isascii() and number.isdecimal() and len(number) <= 18:
            condition |= Q(pk=int(number))
        records = records.filter(condition)
    start, end, date_error = None, None, ''
    raw_start = params.get('shipped_from', '') if status == 'SHIPPED' else ''
    raw_end = params.get('shipped_to', '') if status == 'SHIPPED' else ''
    if raw_start or raw_end:
        try:
            start, end = parse_date(raw_start), parse_date(raw_end)
        except ValueError:
            pass
        if not start or not end or start > end:
            start, end = None, None
            date_error = 'Isi kedua tanggal pengiriman dengan rentang yang valid. Hasil belum dibatasi periode.'
    counts = {value: 0 for value in allowed}
    counts.update({row['status']: row['count'] for row in records.order_by().values('status').annotate(count=Count('pk'))})
    counts['all'] = sum(counts.values())
    if start and end:
        counts['SHIPPED'] = records.filter(status='SHIPPED', shipped_at__date__gte=start, shipped_at__date__lte=end).count()
    if status:
        records = records.filter(status=status)
    if start and end:
        records = records.filter(shipped_at__date__gte=start, shipped_at__date__lte=end)
    default_sort = '-shipped_at' if status == 'SHIPPED' else '-created_at'
    sort = params.get('sort', default_sort)
    keys = {'number': 'pk', 'created_at': 'created_at', 'total': 'total_rupiah'}
    if status == 'SHIPPED':
        keys['shipped_at'] = 'shipped_at'
    if sort.lstrip('-') not in keys:
        sort = default_sort
    records = records.order_by(('-' if sort.startswith('-') else '') + keys[sort.lstrip('-')], '-pk')
    from django.db.models import Prefetch
    from crm.models import OrderLine
    records = records.prefetch_related(Prefetch('lines', queryset=OrderLine.objects.select_related('product').order_by('pk'), to_attr='list_lines'))
    return {'orders': records, 'selected_status': status, 'allowed_statuses': allowed, 'status_counts': counts,
            'query': query, 'selected_sales': sales, 'selected_sort': sort,
            'sales_options': [{'value': str(s.pk), 'label': s.get_full_name() or s.username} for s in sales_options],
            'shipped_from': start, 'shipped_to': end, 'date_error': date_error,
            'date_from_input': raw_start, 'date_to_input': raw_end}
