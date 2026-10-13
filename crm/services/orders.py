from django.shortcuts import get_object_or_404
from django.utils import timezone

from crm.access import active_sales, customers_for, orders_for, require_role, role_of
from crm.errors import BusinessError
from crm.models import InventoryBalance, Order, OrderLine, Product, StockMovement
from crm.services.inventory import atomic_write, integer_input


@atomic_write
def create_draft(actor, customer_id, lines):
    require_role(actor, {'SALES', 'MANAGER'})
    customer = get_object_or_404(customers_for(actor), pk=customer_id, is_active=True)
    if not active_sales().filter(pk=customer.owner_id).exists():
        raise BusinessError('INVALID_INPUT', 'Penanggung jawab pelanggan harus sales aktif.')
    if not isinstance(lines, list) or not lines:
        raise BusinessError('INVALID_INPUT', 'Pesanan harus memiliki setidaknya satu produk.')
    prepared, used, total = [], set(), 0
    for line in lines:
        if not isinstance(line, dict) or set(line) != {'product_id', 'quantity'}:
            raise BusinessError('INVALID_INPUT', 'Baris pesanan hanya boleh berisi produk dan jumlah.')
        product_id = integer_input(line['product_id'], 1)
        quantity = integer_input(line['quantity'], 1)
        if product_id in used:
            raise BusinessError('INVALID_INPUT', 'Gabungkan produk yang sama menjadi satu baris.')
        used.add(product_id)
        product = get_object_or_404(Product, pk=product_id, is_active=True)
        integer_input(product.price_rupiah)
        total += quantity * product.price_rupiah
        integer_input(total)
        prepared.append((product, quantity))
    order = Order.objects.create(customer=customer, sales=customer.owner, total_rupiah=total)
    OrderLine.objects.bulk_create([OrderLine(order=order, product=product, quantity=quantity, unit_price_rupiah=product.price_rupiah) for product, quantity in prepared])
    return order


def _lines_and_balances(order):
    lines = list(order.lines.select_related('product').order_by('product_id'))
    if not lines:
        raise BusinessError('INVALID_INPUT', 'Pesanan tidak memiliki produk.')
    balances = {b.product_id: b for b in InventoryBalance.objects.filter(product_id__in=[line.product_id for line in lines]).order_by('product_id')}
    for line in lines:
        integer_input(line.quantity, 1)
        if line.product_id not in balances:
            raise BusinessError('INVALID_STATE', 'Saldo produk belum tersedia. Periksa gudang.')
    return lines, balances


@atomic_write
def confirm_order(actor, order_id):
    require_role(actor, {'SALES', 'MANAGER'})
    order = get_object_or_404(orders_for(actor), pk=order_id)
    if order.status == Order.Status.CONFIRMED:
        return order
    if order.status != Order.Status.DRAFT:
        raise BusinessError('INVALID_STATE', 'Hanya pesanan draft yang dapat dikonfirmasi.')
    if not order.customer.is_active:
        raise BusinessError('INVALID_INPUT', 'Pelanggan tidak aktif.')
    lines, balances = _lines_and_balances(order)
    for line in lines:
        balance = balances[line.product_id]
        if not line.product.is_active:
            raise BusinessError('INVALID_INPUT', f'{line.product.sku} tidak aktif.')
        if balance.available < 0:
            raise BusinessError('PHYSICAL_CONFLICT', f'{line.product.sku}: fisik lebih kecil daripada reservasi. Periksa gudang.')
        if balance.available < line.quantity:
            raise BusinessError('INSUFFICIENT_STOCK', f'{line.product.sku}: tersedia {balance.available} {line.product.unit}, pesanan meminta {line.quantity}.')
    for line in lines:
        balance = balances[line.product_id]
        balance.reserved += line.quantity
        balance.save(update_fields=['reserved', 'updated_at'])
    order.status, order.confirmed_at, order.confirmed_by = Order.Status.CONFIRMED, timezone.now(), actor
    order.save(update_fields=['status', 'confirmed_at', 'confirmed_by'])
    return order


@atomic_write
def cancel_order(actor, order_id, reason):
    role = role_of(actor)
    records = Order.objects.select_related('customer', 'sales')
    if role == 'SALES':
        records = records.filter(sales=actor)
    elif role == 'WAREHOUSE':
        from django.db.models import Q
        records = records.filter(Q(status='CONFIRMED') | Q(status='CANCELLED', cancelled_by=actor))
    order = get_object_or_404(records, pk=order_id)
    reason = reason.strip() if isinstance(reason, str) else ''
    if not reason:
        raise BusinessError('INVALID_INPUT', 'Alasan pembatalan wajib diisi.')
    if order.status == Order.Status.CANCELLED:
        if reason != order.cancel_reason:
            raise BusinessError('IDEMPOTENCY_CONFLICT', 'Pesanan sudah dibatalkan dengan alasan berbeda.')
        return order
    if order.status not in [Order.Status.DRAFT, Order.Status.CONFIRMED]:
        raise BusinessError('INVALID_STATE', 'Pesanan terkirim tidak dapat dibatalkan. Retur belum tersedia.')
    if order.status == Order.Status.CONFIRMED:
        lines, balances = _lines_and_balances(order)
        for line in lines:
            if balances[line.product_id].reserved < line.quantity:
                raise BusinessError('INVALID_STATE', 'Reservasi tidak sesuai pesanan. Periksa gudang.')
        for line in lines:
            balance = balances[line.product_id]
            balance.reserved -= line.quantity
            balance.save(update_fields=['reserved', 'updated_at'])
    order.status, order.cancel_reason, order.cancelled_at, order.cancelled_by = Order.Status.CANCELLED, reason, timezone.now(), actor
    order.save(update_fields=['status', 'cancel_reason', 'cancelled_at', 'cancelled_by'])
    return order


@atomic_write
def ship_order(actor, order_id):
    require_role(actor, {'WAREHOUSE', 'MANAGER'})
    order = get_object_or_404(orders_for(actor), pk=order_id)
    if order.status == Order.Status.SHIPPED:
        return order
    if order.status != Order.Status.CONFIRMED:
        raise BusinessError('INVALID_STATE', 'Pengiriman hanya untuk pesanan yang sudah dikonfirmasi.')
    lines, balances = _lines_and_balances(order)
    for line in lines:
        balance = balances[line.product_id]
        if balance.on_hand < line.quantity:
            raise BusinessError('INSUFFICIENT_STOCK', f'{line.product.sku}: fisik {balance.on_hand}, dibutuhkan {line.quantity}.')
        if balance.reserved < line.quantity:
            raise BusinessError('INVALID_STATE', 'Reservasi tidak sesuai pesanan. Periksa gudang.')
    for line in lines:
        balance = balances[line.product_id]
        balance.on_hand -= line.quantity
        balance.reserved -= line.quantity
        balance.save(update_fields=['on_hand', 'reserved', 'updated_at'])
        StockMovement.objects.create(product=line.product, delta=-line.quantity, input_quantity=line.quantity, kind=StockMovement.Kind.SHIPMENT, source_ref=f'SHIP:{order.id}:{line.product_id}', order=order, actor=actor, reason=f'Pengiriman OF-{order.id:04d}')
    order.status, order.shipped_at, order.shipped_by = Order.Status.SHIPPED, timezone.now(), actor
    order.save(update_fields=['status', 'shipped_at', 'shipped_by'])
    return order
