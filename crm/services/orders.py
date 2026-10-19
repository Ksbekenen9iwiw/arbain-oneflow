from django.shortcuts import get_object_or_404
from django.utils import timezone

from crm.access import active_sales, customers_for, orders_for, require_role, role_of
from crm.errors import BusinessError
from crm.models import BatchAllocation, BatchSwap, InventoryBalance, Order, OrderLine, Product, StockBatch, StockMovement
from crm.services.batches import eligible_batches, sync_balance
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


def draft_version(order):
    import hashlib
    import json
    snapshot = [order.customer_id, order.status, list(order.lines.order_by('product_id').values_list('product_id', 'quantity', 'unit_price_rupiah'))]
    return hashlib.sha256(json.dumps(snapshot).encode()).hexdigest()


@atomic_write
def update_draft(actor, order_id, customer_id, lines, version):
    require_role(actor, {'SALES', 'MANAGER'})
    order = get_object_or_404(orders_for(actor).select_for_update(), pk=order_id)
    if order.status != Order.Status.DRAFT:
        raise BusinessError('INVALID_STATE', 'Pesanan sudah berubah status. Kembali ke detail untuk melihat keadaan terbaru.')
    if not version or version != draft_version(order):
        raise BusinessError('STALE_DRAFT', 'Draft diubah pengguna lain. Muat ulang sebelum mengedit agar perubahan mereka tidak tertimpa.')
    customer = get_object_or_404(customers_for(actor), pk=customer_id, is_active=True)
    if not active_sales().filter(pk=customer.owner_id).exists():
        raise BusinessError('INVALID_INPUT', 'Penanggung jawab pelanggan harus sales aktif.')
    if not isinstance(lines, list) or not 1 <= len(lines) <= 50:
        raise BusinessError('INVALID_INPUT', 'Pesanan harus memiliki 1 sampai 50 produk.')
    prices = dict(order.lines.values_list('product_id', 'unit_price_rupiah'))
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
        price = prices.get(product_id, product.price_rupiah)
        integer_input(price)
        total += price * quantity
        integer_input(total)
        prepared.append(OrderLine(order=order, product=product, quantity=quantity, unit_price_rupiah=price))
    order.customer, order.sales, order.total_rupiah = customer, customer.owner, total
    order.save(update_fields=['customer', 'sales', 'total_rupiah'])
    order.lines.all().delete()
    OrderLine.objects.bulk_create(prepared)
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


def _plan_line(line, order):
    """Return the FEFO allocation plan for one line and the leftover shortage."""
    batches = eligible_batches(line.product, order.expected_receipt_date)
    plan, remaining = [], line.quantity
    for batch in batches:
        if remaining <= 0:
            break
        take = min(batch.available, remaining)
        if take > 0:
            plan.append((batch, take))
            remaining -= take
    return plan, remaining, batches


def _release_line_allocations(line):
    allocations = list(line.allocations.select_related('batch'))
    if sum(allocation.quantity for allocation in allocations) != line.quantity:
        raise BusinessError('INVALID_STATE', 'Alokasi batch tidak sesuai pesanan. Periksa gudang.')
    released = 0
    for allocation in allocations:
        batch = allocation.batch
        batch.reserved -= allocation.quantity
        batch.save(update_fields=['reserved'])
        released += allocation.quantity
        allocation.delete()
    return released


@atomic_write
def confirm_order(actor, order_id, expected_receipt_date=None):
    require_role(actor, {'SALES', 'MANAGER'})
    order = get_object_or_404(orders_for(actor), pk=order_id)
    if order.status == Order.Status.CONFIRMED:
        return order
    if order.status != Order.Status.DRAFT:
        raise BusinessError('INVALID_STATE', 'Hanya pesanan draft yang dapat dikonfirmasi.')
    if not order.customer.is_active:
        raise BusinessError('INVALID_INPUT', 'Pelanggan tidak aktif.')
    if expected_receipt_date is not None:
        order.expected_receipt_date = expected_receipt_date
        order.save(update_fields=['expected_receipt_date'])
    lines, balances = _lines_and_balances(order)
    plans = {}
    for line in lines:
        balance = balances[line.product_id]
        if not line.product.is_active:
            raise BusinessError('INVALID_INPUT', f'{line.product.sku} tidak aktif.')
        if balance.available < 0:
            raise BusinessError('PHYSICAL_CONFLICT', f'{line.product.sku}: fisik lebih kecil daripada reservasi. Periksa gudang.')
        if balance.available < line.quantity:
            raise BusinessError('INSUFFICIENT_STOCK', f'{line.product.sku}: tersedia {balance.available} {line.product.unit}, pesanan meminta {line.quantity}.')
        plan, remaining, batches = _plan_line(line, order)
        if remaining:
            eligible_total = sum(batch.available for batch in batches)
            raise BusinessError('INSUFFICIENT_STOCK', f'{line.product.sku}: stok yang memenuhi masa simpan/kedaluwarsa {eligible_total} {line.product.unit}, pesanan meminta {line.quantity}.')
        plans[line.pk] = plan
    for line in lines:
        for batch, quantity in plans[line.pk]:
            batch.reserved += quantity
            batch.save(update_fields=['reserved'])
            BatchAllocation.objects.create(line=line, batch=batch, quantity=quantity)
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
            _release_line_allocations(line)
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
        allocations = list(line.allocations.select_related('batch'))
        if sum(allocation.quantity for allocation in allocations) != line.quantity:
            raise BusinessError('INVALID_STATE', 'Alokasi batch tidak sesuai pesanan. Periksa gudang.')
        for allocation in allocations:
            if allocation.batch.on_hand < allocation.quantity:
                raise BusinessError('INSUFFICIENT_STOCK', f'{line.product.sku}: fisik batch {allocation.batch.code} tinggal {allocation.batch.on_hand}, alokasi {allocation.quantity}. Lakukan penggantian batch.')
            # Re-check shelf life at dispatch: dates and batch conditions may have moved.
            if allocation.batch.expiry_date is not None and allocation.batch.expiry_date < (order.expected_receipt_date or timezone.localdate()):
                raise BusinessError('EXPIRED_BATCH', f'{line.product.sku}: batch {allocation.batch.code} kedaluwarsa sebelum barang diterima pelanggan. Lakukan penggantian batch.')
    for line in lines:
        balance = balances[line.product_id]
        allocations = list(line.allocations.select_related('batch'))
        for index, allocation in enumerate(allocations):
            batch = allocation.batch
            batch.on_hand -= allocation.quantity
            batch.reserved -= allocation.quantity
            batch.save(update_fields=['on_hand', 'reserved'])
            allocation.delete()
            ref = f'SHIP:{order.id}:{line.product_id}' if len(allocations) == 1 else f'SHIP:{order.id}:{line.product_id}:{batch.id}'
            StockMovement.objects.create(product=line.product, batch=batch, delta=-allocation.quantity, input_quantity=allocation.quantity, kind=StockMovement.Kind.SHIPMENT, source_ref=ref, order=order, actor=actor, reason=f'Pengiriman OF-{order.id:04d}')
        balance.reserved -= line.quantity
        balance.save(update_fields=['reserved', 'updated_at'])
        sync_balance(line.product)
    order.status, order.shipped_at, order.shipped_by = Order.Status.SHIPPED, timezone.now(), actor
    order.save(update_fields=['status', 'shipped_at', 'shipped_by'])
    return order


@atomic_write
def swap_batch(actor, order_id, line_id, from_batch_id, to_batch_id, quantity, reason):
    require_role(actor, {'WAREHOUSE', 'MANAGER'})
    order = get_object_or_404(orders_for(actor), pk=order_id)
    if order.status != Order.Status.CONFIRMED:
        raise BusinessError('INVALID_STATE', 'Penggantian batch hanya untuk pesanan yang sudah dikonfirmasi.')
    line = get_object_or_404(order.lines, pk=line_id)
    quantity = integer_input(quantity, 1)
    reason = reason.strip() if isinstance(reason, str) else ''
    if not reason:
        raise BusinessError('INVALID_INPUT', 'Alasan penggantian batch wajib diisi.')
    from_batch = get_object_or_404(StockBatch.objects.filter(product=line.product), pk=from_batch_id)
    to_batch = get_object_or_404(StockBatch.objects.filter(product=line.product), pk=to_batch_id)
    if from_batch_id == to_batch_id:
        raise BusinessError('INVALID_INPUT', 'Batch asal dan batch tujuan harus berbeda.')
    if to_batch.status != StockBatch.Status.ACTIVE:
        raise BusinessError('INVALID_INPUT', 'Batch tujuan tidak aktif.')
    allocation = line.allocations.filter(batch=from_batch).first()
    if not allocation or allocation.quantity < quantity:
        raise BusinessError('INVALID_STATE', 'Alokasi pada batch asal tidak mencukupi.')
    if to_batch.available < quantity:
        raise BusinessError('INSUFFICIENT_STOCK', f'Batch {to_batch.code} hanya memiliki {to_batch.available} unit bebas.')
    if line.product.min_shelf_life_days is not None and order.expected_receipt_date:
        if to_batch.expiry_date is None or (to_batch.expiry_date - order.expected_receipt_date).days < line.product.min_shelf_life_days:
            raise BusinessError('INVALID_INPUT', f'Batch {to_batch.code} tidak memenuhi masa simpan minimum.')
    from_batch.reserved -= quantity
    from_batch.save(update_fields=['reserved'])
    to_batch.reserved += quantity
    to_batch.save(update_fields=['reserved'])
    if allocation.quantity == quantity:
        allocation.delete()
    else:
        allocation.quantity -= quantity
        allocation.save(update_fields=['quantity'])
    destination, created = BatchAllocation.objects.get_or_create(line=line, batch=to_batch, defaults={'quantity': quantity})
    if not created:
        destination.quantity += quantity
        destination.save(update_fields=['quantity'])
    BatchSwap.objects.create(line=line, from_batch=from_batch, to_batch=to_batch, quantity=quantity, reason=reason, actor=actor)
    return order
