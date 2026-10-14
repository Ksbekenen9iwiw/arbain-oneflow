"""Read-only inventory workspace: filtering, history and safe return context."""

from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date

from crm.access import orders_for, role_of
from crm.models import Product, StockMovement


def stock_state(product):
    available = product.balance.available
    if available < 0:
        return 'conflict'
    if available == 0:
        return 'empty'
    return 'low' if available < product.min_stock else 'ready'


def stock_return_url(request, product_id=None):
    from crm.navigation import return_url
    return return_url(request, '/stock/')


def movement_records(actor, params, product=None):
    if role_of(actor) == 'SALES':
        raise PermissionDenied
    records = StockMovement.objects.select_related('product__balance', 'actor', 'order')
    selected = str(product.pk) if product else params.get('product', '')
    if selected:
        if not selected.isascii() or not selected.isdecimal() or len(selected) > 18:
            raise Http404
        product = product or get_object_or_404(Product, pk=selected)
        records = records.filter(product=product)
    kind = params.get('kind', '')
    kind = kind if kind in StockMovement.Kind.values else ''
    if kind:
        records = records.filter(kind=kind)
    query = params.get('q', '').strip()
    if query:
        records = records.filter(Q(product__name__icontains=query) | Q(product__sku__icontains=query))
    raw_start, raw_end = params.get('from', ''), params.get('to', '')
    start, end, error = None, None, ''
    if raw_start or raw_end:
        try:
            start, end = parse_date(raw_start), parse_date(raw_end)
        except ValueError:
            pass
        if not start or not end or start > end:
            error = 'Isi kedua tanggal dengan rentang yang valid. Riwayat belum dibatasi periode.'
        else:
            records = records.filter(created_at__date__gte=start, created_at__date__lte=end)
    sort = params.get('sort', '-created_at')
    if sort not in ('created_at', '-created_at', 'delta', '-delta'):
        sort = '-created_at'
    records = records.order_by(sort, '-pk')
    paginator = Paginator(records, 20)
    raw_page = params.get('page', '1')
    number = int(raw_page) if raw_page.isascii() and raw_page.isdecimal() and len(raw_page) <= 9 else 1
    page = paginator.get_page(number)
    return {'movements': list(page.object_list), 'movement_total': paginator.count, 'movement_page': page.number,
            'movement_pages': paginator.num_pages, 'page_size': paginator.per_page, 'selected_product': selected,
            'selected_kind': kind, 'selected_sort': sort, 'query': query, 'date_from': raw_start,
            'date_to': raw_end, 'date_error': error, 'kind_options': [{'value': k, 'label': v} for k, v in StockMovement.Kind.choices]}


def stock_records(actor, params):
    role = role_of(actor)
    tab = 'movements' if params.get('tab') == 'movements' else 'products'
    products = list(Product.objects.select_related('balance'))
    summary = {'product_count': len(products), 'low_stock_count': sum(p.balance.available < p.min_stock for p in products), 'conflict_count': sum(p.balance.available < 0 for p in products)}
    if tab == 'movements':
        return dict(movement_records(actor, params), selected_tab=tab, stock_summary=summary,
                    product_options=[{'value': str(p.pk), 'label': f'{p.sku} · {p.name}'} for p in products])
    query = params.get('q', '').strip()
    status = params.get('status', '')
    status = status if status in ('active', 'inactive') else ''
    condition = params.get('filter', '')
    condition = condition if condition in ('low', 'empty', 'conflict', 'ready') else ''
    if query:
        products = [p for p in products if query.casefold() in f'{p.name} {p.sku}'.casefold()]
    if status:
        products = [p for p in products if p.is_active == (status == 'active')]
    counts = {'all': len(products), 'low': sum(p.balance.available < p.min_stock for p in products),
              'empty': sum(stock_state(p) == 'empty' for p in products), 'conflict': sum(stock_state(p) == 'conflict' for p in products),
              'ready': sum(stock_state(p) == 'ready' for p in products)}
    if condition:
        if condition == 'low':
            products = [p for p in products if p.balance.available < p.min_stock]
        else:
            products = [p for p in products if stock_state(p) == condition]
    keys = {'name': lambda p: p.name.casefold(), 'sku': lambda p: p.sku.casefold(), 'price': lambda p: p.price_rupiah,
            'available': lambda p: p.balance.available}
    if role != 'SALES':
        keys.update(on_hand=lambda p: p.balance.on_hand, reserved=lambda p: p.balance.reserved)
    sort = params.get('sort', 'sku')
    if sort not in tuple(keys) + tuple('-' + key for key in keys):
        sort = 'sku'
    products.sort(key=lambda p: (keys[sort.lstrip('-')](p), p.pk), reverse=sort.startswith('-'))
    return {'products': products, 'movements': [], 'stock_summary': summary, 'query': query,
            'stock_filter': condition, 'condition_counts': counts, 'selected_status': status,
            'selected_sort': sort, 'selected_tab': tab}


def product_workspace(actor, product, params):
    data = {'product': product, 'can_manage': role_of(actor) != 'SALES', 'selected_section': 'movements'}
    if data['can_manage']:
        data.update(movement_records(actor, params, product))
        data['selected_section'] = 'reservations' if params.get('section') == 'reservations' else 'movements'
        reservations = product.order_lines.filter(order__in=orders_for(actor).filter(status='CONFIRMED')).select_related('order__customer__owner', 'order__sales', 'order__confirmed_by', 'order__shipped_by', 'order__cancelled_by').order_by('order__confirmed_at', 'order_id')
        data['reservations'] = [{'id': line.pk, 'order': line.order, 'quantity': line.quantity} for line in reservations]
        data['reservation_total'] = sum(line['quantity'] for line in data['reservations'])
    return data
