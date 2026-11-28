"""Read-only inventory workspace: filtering, history and safe return context."""

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date

from crm.access import orders_for, role_of
from crm.models import Product, StockBatch, StockMovement
from crm.services.batches import fefo_key, meets_shelf_life, shelf_life_days


def stock_state(product):
    if product.opening_stock_pending:
        return 'unverified'
    available = product.balance.available
    if available < 0:
        return 'conflict'
    if available == 0:
        return 'empty'
    return 'low' if available < product.min_stock else 'ready'


def stock_return_url(request, product_id=None):
    from crm.navigation import return_url
    return return_url(request, '/stock/')


LOG_KINDS = [*StockMovement.Kind.choices, ('SWAP', 'Tukar batch'), ('CANCEL', 'Pembatalan pesanan')]


def _log_rows(keys, role):
    """Hydrate one page of (source, pk) keys into rows for the log table."""
    from crm.frontend import encode, person
    from crm.models import BatchSwap, OrderLine

    wanted = {source: [pk for kind, pk in keys if kind == source] for source in ('M', 'S', 'C')}
    movements = StockMovement.objects.select_related('product__balance', 'actor', 'batch').in_bulk(wanted['M'])
    swaps = BatchSwap.objects.select_related('line__product__balance', 'line__order', 'from_batch', 'to_batch', 'actor').in_bulk(wanted['S'])
    lines = OrderLine.objects.select_related('product__balance', 'order__cancelled_by').in_bulk(wanted['C'])
    rows = []
    for source, pk in keys:
        if source == 'M':
            m = movements[pk]
            rows.append(dict(id=f'M{pk}', product=encode(m.product, role), delta=str(m.delta), quantity=str(abs(m.delta)),
                             physical=True, kind=m.get_kind_display(), actor=person(m.actor), reason=m.reason,
                             batch_code=m.batch.code if m.batch_id else None,
                             order_id=str(m.order_id) if m.order_id else None,
                             sample_request_id=str(m.sample_request_id) if m.sample_request_id else None,
                             created_at=m.created_at))
        elif source == 'S':
            swap = swaps[pk]
            rows.append(dict(id=f'S{pk}', product=encode(swap.line.product, role), delta='0', quantity=str(swap.quantity),
                             physical=False, kind='Tukar batch', actor=person(swap.actor), reason=swap.reason,
                             batch_code=f'{swap.from_batch.code} → {swap.to_batch.code}',
                             order_id=str(swap.line.order_id), sample_request_id=None, created_at=swap.created_at))
        else:
            line = lines[pk]
            rows.append(dict(id=f'C{pk}', product=encode(line.product, role), delta='0', quantity=str(line.quantity),
                             physical=False, kind='Pembatalan pesanan', actor=person(line.order.cancelled_by),
                             reason=line.order.cancel_reason, batch_code=None, order_id=str(line.order_id),
                             sample_request_id=None, created_at=line.order.cancelled_at))
    return rows


def movement_records(actor, params, product=None):
    """Transaction log: stock movements, batch swaps and order cancellations in one list."""
    from crm.models import BatchSwap, OrderLine

    role = role_of(actor)
    if role == 'SALES':
        raise PermissionDenied
    selected = str(product.pk) if product else params.get('product', '')
    if selected:
        if not selected.isascii() or not selected.isdecimal() or len(selected) > 18:
            raise Http404
        product = product or get_object_or_404(Product, pk=selected)
    kind = params.get('kind', '')
    kind = kind if kind in dict(LOG_KINDS) else ''
    query = params.get('q', '').strip()
    actor_id = params.get('actor', '')
    actor_id = actor_id if actor_id.isascii() and actor_id.isdecimal() and len(actor_id) <= 18 else ''
    raw_start, raw_end = params.get('from', ''), params.get('to', '')
    start, end, error = None, None, ''
    if raw_start or raw_end:
        try:
            start, end = parse_date(raw_start), parse_date(raw_end)
        except ValueError:
            pass
        if not start or not end or start > end:
            start, end = None, None
            error = 'Isi kedua tanggal dengan rentang yang valid. Riwayat belum dibatasi periode.'

    def scoped(records, product_field, actor_field, time_field, batch_fields):
        if product:
            records = records.filter(**{product_field: product})
        if actor_id:
            records = records.filter(**{actor_field + '_id': actor_id})
        if start and end:
            records = records.filter(**{time_field + '__date__gte': start, time_field + '__date__lte': end})
        if query:
            condition = Q(**{product_field + '__name__icontains': query}) | Q(**{product_field + '__sku__icontains': query})
            for field in batch_fields:
                condition |= Q(**{field + '__code__icontains': query})
            records = records.filter(condition)
        return records

    entries = []
    if kind in StockMovement.Kind.values or not kind:
        records = scoped(StockMovement.objects.all(), 'product', 'actor', 'created_at', ['batch'])
        if kind:
            records = records.filter(kind=kind)
        entries += [(at, delta, 'M', pk) for pk, at, delta in records.values_list('pk', 'created_at', 'delta')]
    if kind in ('SWAP', ''):
        records = scoped(BatchSwap.objects.all(), 'line__product', 'actor', 'created_at', ['from_batch', 'to_batch'])
        entries += [(at, 0, 'S', pk) for pk, at in records.values_list('pk', 'created_at')]
    if kind in ('CANCEL', ''):
        records = scoped(OrderLine.objects.filter(order__status='CANCELLED', order__cancelled_at__isnull=False),
                         'product', 'order__cancelled_by', 'order__cancelled_at', [])
        entries += [(at, 0, 'C', pk) for pk, at in records.values_list('pk', 'order__cancelled_at')]
    sort = params.get('sort', '-created_at')
    if sort not in ('created_at', '-created_at', 'delta', '-delta'):
        sort = '-created_at'
    position = 0 if sort.endswith('created_at') else 1
    entries.sort(key=lambda entry: (entry[position], entry[0], entry[3]), reverse=sort.startswith('-'))
    if params.get('format') == 'csv':
        return {'export': _log_rows([entry[2:] for entry in entries[:20000]], role)}
    actors = get_user_model().objects.filter(
        Q(stock_movements__isnull=False) | Q(batch_swaps__isnull=False) | Q(cancelled_orders__isnull=False)
    ).distinct().order_by('first_name', 'username')
    paginator = Paginator(entries, 20)
    raw_page = params.get('page', '1')
    number = int(raw_page) if raw_page.isascii() and raw_page.isdecimal() and len(raw_page) <= 9 else 1
    page = paginator.get_page(number)
    return {'movements': _log_rows([entry[2:] for entry in page.object_list], role), 'movement_total': paginator.count, 'movement_page': page.number,
            'movement_pages': paginator.num_pages, 'page_size': paginator.per_page, 'selected_product': selected,
            'selected_kind': kind, 'selected_sort': sort, 'query': query, 'date_from': raw_start,
            'date_to': raw_end, 'date_error': error, 'selected_actor': actor_id,
            'actor_options': [{'value': str(a.pk), 'label': a.get_full_name() or a.username} for a in actors],
            'kind_options': [{'value': k, 'label': v} for k, v in LOG_KINDS]}


def batch_search(query):
    """Lots whose code contains ``query``, with what is left and where they were sent."""
    from crm.models import Order

    rows = []
    batches = StockBatch.objects.filter(code__icontains=query).exclude(code=StockBatch.LEGACY_CODE).select_related('product').order_by('product__sku', 'code')[:20]
    for batch in batches:
        sent = Order.objects.filter(movements__batch=batch).select_related('customer').distinct().order_by('-shipped_at')[:5]
        rows.append({'id': str(batch.pk), 'product_id': str(batch.product_id), 'sku': batch.product.sku, 'name': batch.product.name,
                     'unit': batch.product.unit, 'code': batch.code, 'expiry_date': batch.expiry_date,
                     'on_hand': str(batch.on_hand), 'available': str(batch.available),
                     'orders': [{'id': str(order.pk), 'customer': order.customer.name} for order in sent]})
    return rows


def stock_records(actor, params):
    role = role_of(actor)
    tab = params.get('tab') if params.get('tab') in ('movements', 'planning') else 'products'
    if tab == 'planning':
        if role == 'SALES':
            raise PermissionDenied
        from crm.services.supply import forecast
        query = params.get('q', '').strip()
        risk = params.get('risk', '')
        rows = []
        for product in Product.objects.select_related('balance').filter(is_active=True).order_by('sku'):
            if query and query.casefold() not in f'{product.sku} {product.name}'.casefold():
                continue
            supply = forecast(product)
            rows.append({'id': product.pk, 'product': product, **supply})
        counts = {'all': len(rows), 'attention': sum(r['risk'] != 'PASOKAN_AMAN' for r in rows)}
        if risk == 'attention':
            rows = [r for r in rows if r['risk'] != 'PASOKAN_AMAN']
        else:
            risk = ''
        priority = {'RISIKO_KOSONG_TERLAMBAT': 0, 'PERLU_PENGADAAN': 1, 'PERLU_DITINJAU': 2, 'PERLU_KONFIGURASI': 3, 'PASOKAN_AMAN': 4}
        rows.sort(key=lambda r: (priority.get(r['risk'], 5), r['product'].sku))
        return {'selected_tab': tab, 'planning': rows, 'query': query, 'selected_risk': risk, 'planning_counts': counts}
    products = list(Product.objects.select_related('balance'))
    summary = {'product_count': len(products), 'low_stock_count': sum(stock_state(p) in {'empty', 'low', 'conflict'} and p.balance.available < p.min_stock for p in products), 'conflict_count': sum(p.balance.available < 0 for p in products)}
    if tab == 'movements':
        return dict(movement_records(actor, params), selected_tab=tab, stock_summary=summary,
                    product_options=[{'value': str(p.pk), 'label': f'{p.sku} · {p.name}'} for p in products])
    query = params.get('q', '').strip()
    status = params.get('status', '')
    status = status if status in ('active', 'inactive') else ''
    condition = params.get('filter', '')
    condition = condition if condition in ('low', 'empty', 'conflict', 'ready', 'unverified') else ''
    batch_matches = batch_search(query) if query and role != 'SALES' else []
    if query:
        hit = {row['product_id'] for row in batch_matches}
        products = [p for p in products if query.casefold() in f'{p.name} {p.sku}'.casefold() or str(p.pk) in hit]
    if status:
        products = [p for p in products if p.is_active == (status == 'active')]
    counts = {'all': len(products), 'low': sum(stock_state(p) in {'empty', 'low', 'conflict'} and p.balance.available < p.min_stock for p in products),
              'empty': sum(stock_state(p) == 'empty' for p in products), 'conflict': sum(stock_state(p) == 'conflict' for p in products),
              'ready': sum(stock_state(p) == 'ready' for p in products),
              'unverified': sum(stock_state(p) == 'unverified' for p in products)}
    if condition:
        if condition == 'low':
            products = [p for p in products if stock_state(p) in {'empty', 'low', 'conflict'} and p.balance.available < p.min_stock]
        else:
            products = [p for p in products if stock_state(p) == condition]
    keys = {'name': lambda p: p.name.casefold(), 'sku': lambda p: p.sku.casefold(), 'price': lambda p: (p.price_rupiah is None, p.price_rupiah or 0),
            'available': lambda p: p.balance.available}
    if role != 'SALES':
        keys.update(on_hand=lambda p: p.balance.on_hand, reserved=lambda p: p.balance.reserved)
    sort = params.get('sort', 'sku')
    if sort not in tuple(keys) + tuple('-' + key for key in keys):
        sort = 'sku'
    products.sort(key=lambda p: (keys[sort.lstrip('-')](p), p.pk), reverse=sort.startswith('-'))
    return {'products': products, 'movements': [], 'stock_summary': summary, 'query': query, 'batch_matches': batch_matches,
            'stock_filter': condition, 'condition_counts': counts, 'selected_status': status,
            'selected_sort': sort, 'selected_tab': tab}


def product_workspace(actor, product, params):
    data = {'product': product, 'can_manage': role_of(actor) != 'SALES', 'selected_section': 'movements'}
    data['source_sales'] = [
        dict(id=row.pk, sales=row.sales, month=row.report.period.strftime('%Y-%m'), quantity=row.quantity,
             sold=row.sold, returned=row.returned, issue=row.issue)
        for row in product.company_report_rows.select_related('report').order_by('-report__period', 'sales')
    ] if role_of(actor) == 'MANAGER' else []
    if data['can_manage']:
        data.update(movement_records(actor, params, product))
        data['selected_section'] = params.get('section') if params.get('section') in ('batches', 'supply', 'movements', 'reservations') else 'batches'
        reservations = product.order_lines.filter(order__in=orders_for(actor).filter(status='CONFIRMED')).select_related('order__customer__owner', 'order__sales', 'order__confirmed_by', 'order__shipped_by', 'order__cancelled_by').order_by('order__confirmed_at', 'order_id')
        data['reservations'] = [{'id': line.pk, 'order': line.order, 'quantity': line.quantity} for line in reservations]
        data['reservation_total'] = sum(line['quantity'] for line in data['reservations'])
        today, rows, ineligible = timezone.localdate(), [], 0
        for batch in sorted(product.batches.all(), key=fefo_key):
            expired = batch.expiry_date is not None and batch.expiry_date < today
            near = not expired and not meets_shelf_life(product, batch, today)
            if batch.status == StockBatch.Status.HELD or expired or near:
                ineligible += batch.on_hand
            rows.append({'id': str(batch.pk), 'code': batch.code, 'received_date': batch.received_date,
                         'expiry_date': batch.expiry_date, 'on_hand': str(batch.on_hand), 'reserved': str(batch.reserved),
                         'available': str(batch.available), 'status': batch.status, 'status_label': batch.get_status_display(),
                         'is_complete': batch.is_complete, 'is_expired': expired, 'is_near_expiry': near, 'is_legacy': batch.code == StockBatch.LEGACY_CODE,
                         'days_left': (batch.expiry_date - today).days if batch.expiry_date else None})
        data['batches'] = rows
        data['batch_summary'] = {'on_hand': str(product.balance.on_hand), 'reserved': str(product.balance.reserved),
                                 'available': str(product.balance.available), 'ineligible': str(ineligible)}
        data['shelf_life_days'] = shelf_life_days(product)
        data['shelf_life_is_default'] = product.min_shelf_life_days is None
        data.update(supply_workspace(actor, product))
    return data


def supply_workspace(actor, product):
    from uuid import uuid4

    from crm.forms import CancelOrderForm, PurchaseOrderForm, ReceivePurchaseForm, SupplySettingForm
    from crm.models import PurchaseOrder
    from crm.services.supply import forecast

    role = role_of(actor)
    setting = getattr(product, 'supply_setting', None)
    data = {'supply': forecast(product)}
    if role == 'MANAGER':
        data['supply_form'] = SupplySettingForm(actor=actor, initial={
            'analysis_period_days': setting.analysis_period_days if setting else None,
            'lead_time_days': setting.lead_time_days if setting else None,
            'coverage_target_days': setting.coverage_target_days if setting else None,
            'safety_stock_days': setting.safety_stock_days if setting else None,
        })
        data['purchase_form'] = PurchaseOrderForm(actor=actor)
    orders = list(product.purchase_orders.select_related('created_by')[:20])
    data['purchase_orders'] = [{
        'id': str(order.pk), 'number': order.number, 'ordered': str(order.quantity_ordered),
        'received': str(order.quantity_received), 'remaining': str(order.remaining),
        'expected_date': order.expected_date, 'status': order.status, 'status_label': order.get_status_display(),
        'note': order.note, 'cancel_reason': order.cancel_reason,
        'created_by': order.created_by.get_full_name() or order.created_by.username,
        'created_at': order.created_at, 'received_at': order.received_at,
    } for order in orders]
    if role in {'WAREHOUSE', 'MANAGER'}:
        data['receive_forms'] = [
            {'id': str(order.pk), 'form': ReceivePurchaseForm(initial={'operation_id': uuid4()})}
            for order in orders if order.status == PurchaseOrder.Status.CONFIRMED and order.remaining
        ]
    if role == 'MANAGER':
        data['cancel_purchase_form'] = CancelOrderForm()
    return data
