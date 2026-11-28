"""Order list, draft wizard, detail, and status transition views."""
from urllib.parse import urlencode

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from crm.access import customers_for, orders_for, require_role, role_of
from crm.errors import BusinessError
from crm.forms import (
    BatchSwapForm,
    CancelOrderForm,
    ConfirmOrderForm,
    OrderForm,
    OrderLineFormSet,
)
from crm.models import Product
from crm.navigation import return_url
from crm.selectors import order_records
from crm.services.orders import (
    cancel_order,
    confirm_order,
    create_draft,
    draft_version,
    ship_order,
    swap_batch,
    update_draft,
)
from crm.views.common import page


@login_required
@require_GET
def orders(request):
    return page(request, 'crm/orders.html', order_records(request.user, request.GET))


def order_return_url(request):
    return return_url(request, '/orders/')


def order_detail_url(request, order_id):
    back = order_return_url(request)
    return f'/orders/{order_id}/' + ('?' + urlencode({'return_to': back}) if back != '/orders/' else '')


@login_required
@require_http_methods(['GET', 'POST'])
def order_create(request, order_id=None):
    order = None
    if order_id is not None:
        require_role(request.user, {'SALES', 'MANAGER'})
        order = get_object_or_404(orders_for(request.user), pk=order_id)
        if order.status != 'DRAFT':
            messages.error(request, 'Hanya pesanan draft yang dapat diedit.')
            return redirect(order_detail_url(request, order_id))
    form = OrderForm(request.POST or None, actor=request.user, initial={'customer': order.customer_id if order else request.GET.get('customer')})
    initial_lines = None
    # Only carry a suggestion through for a customer visible to this actor.
    customer_id = request.GET.get('customer', '')
    product_id = request.GET.get('product', '')
    quantity = request.GET.get('quantity', '')
    if all(value.isascii() and value.isdigit() and len(value) <= 18 for value in (customer_id, product_id, quantity)):
        if customers_for(request.user).filter(pk=int(customer_id), is_active=True).exists() and Product.objects.filter(pk=int(product_id), is_active=True).exists() and 0 < int(quantity) <= 2**63 - 1:
            initial_lines = [{'product': int(product_id), 'quantity': int(quantity)}]
    suggested = bool(initial_lines) and not order
    if order:
        initial_lines = [{'product': line.product_id, 'quantity': line.quantity} for line in order.lines.all()]
    formset = OrderLineFormSet(request.POST or None, prefix='lines', initial=initial_lines)
    status = 400 if request.method == 'POST' else 200
    if request.method == 'POST' and form.is_valid() and formset.is_valid():
        lines = [{'product_id': line['product'].id, 'quantity': line['quantity']} for line in formset.cleaned_data if line and not line.get('DELETE')]
        try:
            saved = update_draft(request.user, order.pk, form.cleaned_data['customer'].id, lines, request.POST.get('draft_version')) if order else create_draft(request.user, form.cleaned_data['customer'].id, lines)
        except BusinessError as error:
            form.add_error(None, error.message)
            status = error.status_code
        else:
            messages.success(request, 'Draft tersimpan. Stok baru direservasi setelah konfirmasi.')
            return redirect(order_detail_url(request, saved.id))
    catalog = [{'id': str(product.id), 'name': product.name, 'sku': product.sku, 'price': str(product.price_rupiah), 'available': str(product.balance.available), 'unit': product.unit} for product in Product.objects.filter(is_active=True).select_related('balance')]
    if order:
        prices = dict(order.lines.values_list('product_id', 'unit_price_rupiah'))
        for product in catalog:
            if int(product['id']) in prices:
                product['price'] = str(prices[int(product['id'])])
    return page(request, 'crm/order_form.html', {'form': form, 'formset': formset, 'catalog': catalog, 'suggested': suggested,
        'editing': f'OF-{order.pk:04d}' if order else '', 'draft_version': (request.POST.get('draft_version', '') if request.method == 'POST' else draft_version(order)) if order else '',
        'back_url': order_detail_url(request, order.pk) if order else order_return_url(request),
        'customer_details': list(customers_for(request.user).filter(is_active=True))}, status=status)


def _order_context(request, order):
    role = role_of(request.user)
    lines = list(order.lines.select_related('product', 'product__balance'))
    blockers, checks = [], {}
    if order.status == 'DRAFT' and not order.customer.is_active:
        blockers.append('Pelanggan sudah nonaktif. Pesanan ini belum dapat dikonfirmasi.')
    for line in lines:
        balance = line.product.balance
        if order.status == 'DRAFT':
            available = balance.available
            shortage = max(0, line.quantity - max(0, available))
            checks[str(line.pk)] = {'available': available, 'shortage': shortage}
            if not line.product.is_active:
                blockers.append(f'{line.product.name} sudah nonaktif.')
            if available < 0:
                blockers.append(f'{line.product.name}: ada konflik stok. Koordinasikan dengan gudang.')
            elif shortage:
                blockers.append(f'{line.product.name}: diminta {line.quantity}, tersedia {available}, kurang {shortage} {line.product.unit}.')
        elif order.status == 'CONFIRMED' and role in {'MANAGER', 'WAREHOUSE'}:
            if balance.on_hand < line.quantity or balance.reserved < line.quantity:
                blockers.append(f'{line.product.name}: dibutuhkan {line.quantity}, fisik {balance.on_hand}, reservasi {balance.reserved} {line.product.unit}. Kekurangan fisik {max(0, line.quantity - balance.on_hand)}, kekurangan reservasi {max(0, line.quantity - balance.reserved)}. Periksa stok dan alokasi pesanan.')
    allocations, swaps = {}, []
    if role != 'SALES':
        for line in lines:
            allocations[str(line.pk)] = [
                {'id': str(allocation.pk), 'batch_code': allocation.batch.code, 'quantity': str(allocation.quantity),
                 'expiry_date': allocation.batch.expiry_date, 'status': allocation.batch.status,
                 'status_label': allocation.batch.get_status_display()}
                for allocation in line.allocations.select_related('batch')
            ]
            swaps.extend(
                {'id': str(swap.pk), 'product_sku': line.product.sku, 'from_code': swap.from_batch.code,
                 'to_code': swap.to_batch.code, 'quantity': str(swap.quantity), 'reason': swap.reason,
                 'actor': swap.actor.get_full_name() or swap.actor.username, 'created_at': swap.created_at}
                for swap in line.batch_swaps.select_related('from_batch', 'to_batch', 'actor')
            )
    swaps.sort(key=lambda swap: (swap['created_at'], swap['id']), reverse=True)
    can_swap = role in {'WAREHOUSE', 'MANAGER'} and order.status == 'CONFIRMED' and bool(lines)
    # Lines that only fit if the outlet accepts lots below the minimum shelf life.
    near_expiry_lines = []
    if order.status == 'DRAFT':
        from crm.services.batches import meets_shelf_life
        for line in lines:
            usable = [b for b in line.product.batches.all() if b.status == 'ACTIVE' and b.available > 0]
            fresh = sum(b.available for b in usable if meets_shelf_life(line.product, b, order.expected_receipt_date))
            unexpired = sum(b.available for b in usable if meets_shelf_life(line.product, b, order.expected_receipt_date, True))
            if fresh < line.quantity <= unexpired:
                near_expiry_lines.append(line.product.name)
    return {'order': order, 'lines': lines, 'line_checks': checks, 'blockers': blockers,
            'near_expiry_lines': near_expiry_lines,
            'back_url': order_return_url(request), 'detail_url': order_detail_url(request, order.pk),
            'can_confirm': role in {'SALES', 'MANAGER'} and order.status == 'DRAFT',
            'can_ship': role in {'WAREHOUSE', 'MANAGER'} and order.status == 'CONFIRMED',
            'can_cancel': order.status in {'DRAFT', 'CONFIRMED'} and (role != 'WAREHOUSE' or order.status == 'CONFIRMED'),
            'cancel_form': CancelOrderForm(),
            'confirm_form': ConfirmOrderForm(initial={'expected_receipt_date': order.expected_receipt_date}),
            'allocations': allocations, 'batch_swaps': swaps, 'can_swap': can_swap,
            'swap_form': BatchSwapForm(order=order) if can_swap else None}


@login_required
@require_GET
def order_detail(request, order_id):
    order = get_object_or_404(orders_for(request.user), pk=order_id)
    return page(request, 'crm/order_detail.html', _order_context(request, order))


def _transition(request, order_id, operation, *args, extra=None):
    try:
        order = operation(request.user, order_id, *args)
    except BusinessError as error:
        order = orders_for(request.user).filter(pk=order_id).first()
        if not order:
            return page(request, 'crm/error.html', {'error': error, 'back_url': order_return_url(request)}, status=error.status_code)
        context = _order_context(request, order)
        context['error'] = error
        if extra:
            context.update(extra)
        return page(request, 'crm/order_detail.html', context, status=error.status_code)
    messages.success(request, f'Pesanan OF-{order.id:04d}: {'Menunggu pengiriman' if order.status == 'CONFIRMED' else order.get_status_display()}.')
    if role_of(request.user) == 'WAREHOUSE' and order.status == 'CANCELLED':
        return redirect(order_return_url(request))
    return redirect(order_detail_url(request, order_id))


@login_required
@require_POST
def order_confirm(request, order_id):
    form = ConfirmOrderForm(request.POST)
    if not form.is_valid():
        order = get_object_or_404(orders_for(request.user), pk=order_id)
        context = _order_context(request, order)
        context.update(confirm_form=form, dialog='confirm')
        return page(request, 'crm/order_detail.html', context, status=400)
    extra = {'confirm_form': form, 'dialog': 'confirm'}
    fields = form.cleaned_data
    return _transition(request, order_id, confirm_order, fields['expected_receipt_date'],
                       fields['accept_near_expiry'], fields['near_expiry_note'], extra=extra)


@login_required
@require_POST
def order_ship(request, order_id):
    return _transition(request, order_id, ship_order)


@login_required
@require_POST
def order_swap(request, order_id):
    require_role(request.user, {'WAREHOUSE', 'MANAGER'})
    order = get_object_or_404(orders_for(request.user), pk=order_id)
    form = BatchSwapForm(request.POST, order=order)
    if not form.is_valid():
        context = _order_context(request, order)
        context.update(swap_form=form, dialog='swap')
        return page(request, 'crm/order_detail.html', context, status=400)
    fields = form.cleaned_data
    extra = {'swap_form': form, 'dialog': 'swap'}
    return _transition(request, order_id, swap_batch, fields['line_id'], fields['from_batch_id'],
                       fields['to_batch_id'], fields['quantity'], fields['reason'], extra=extra)


@login_required
@require_POST
def order_cancel(request, order_id):
    form = CancelOrderForm(request.POST)
    if not form.is_valid():
        order = get_object_or_404(orders_for(request.user), pk=order_id)
        context = _order_context(request, order)
        context.update(cancel_form=form, dialog='cancel')
        return page(request, 'crm/order_detail.html', context, status=400)
    return _transition(request, order_id, cancel_order, form.cleaned_data['reason'])
