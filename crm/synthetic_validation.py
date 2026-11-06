"""Cross-table checks for generated data; failure aborts the seed transaction."""
from collections import defaultdict

from django.core.management.base import CommandError
from django.db.models import Sum
from django.utils import timezone

from crm.models import (Activity, BatchAllocation, InventoryBalance, Order, PurchaseOrder,
                        SampleAllocation, SampleRequest, StockBatch, StockMovement)


def validate_synthetic():
    def require(condition, message):
        if not condition:
            raise CommandError(f'Validasi data sintetis gagal: {message}')

    running = defaultdict(int)
    for movement in StockMovement.objects.select_related('batch').order_by('created_at', 'pk'):
        require(movement.batch_id is not None, 'mutasi tanpa batch')
        running[movement.batch_id] += movement.delta
        require(running[movement.batch_id] >= 0, f'stok historis negatif: {movement.batch_id}')
        require(movement.batch.product_id == movement.product_id, 'SKU mutasi berbeda dari batch')
        require(movement.batch.received_date <= timezone.localdate(movement.created_at), 'mutasi sebelum barang masuk')
    for batch in StockBatch.objects.all():
        require(running[batch.pk] == batch.on_hand, f'saldo ledger batch {batch.pk}')
        expected = (BatchAllocation.objects.filter(batch=batch).aggregate(n=Sum('quantity'))['n'] or 0)
        expected += SampleAllocation.objects.filter(batch=batch).aggregate(n=Sum('quantity'))['n'] or 0
        require(expected == batch.reserved and 0 <= batch.reserved <= batch.on_hand, f'reservasi batch {batch.pk}')
    for balance in InventoryBalance.objects.all():
        totals = balance.product.batches.aggregate(on_hand=Sum('on_hand'), reserved=Sum('reserved'))
        require(balance.on_hand == (totals['on_hand'] or 0), 'saldo fisik produk')
        require(balance.reserved == (totals['reserved'] or 0), 'saldo reservasi produk')
    for order in Order.objects.prefetch_related('lines__allocations').all():
        require(order.total_rupiah == sum(line.subtotal_rupiah for line in order.lines.all()), f'total OF-{order.pk}')
        require(order.sales_id == order.customer.owner_id, 'owner pesanan berbeda')
        if order.confirmed_at:
            require(order.created_at <= order.confirmed_at, 'konfirmasi mendahului draft')
        if order.shipped_at:
            require(order.confirmed_at <= order.shipped_at, 'pengiriman mendahului konfirmasi')
        if order.cancelled_at:
            require((order.confirmed_at or order.created_at) <= order.cancelled_at, 'urutan pembatalan')
        for line in order.lines.all():
            reserved = sum(a.quantity for a in line.allocations.all())
            require(reserved == (line.quantity if order.status == 'CONFIRMED' else 0), 'reservasi baris pesanan')
            shipped = -(order.movements.filter(product=line.product).aggregate(n=Sum('delta'))['n'] or 0)
            require(shipped == (line.quantity if order.status == 'SHIPPED' else 0), 'mutasi baris pesanan')
    for request in SampleRequest.objects.all():
        dates = [value for value in [request.created_at, request.decided_at, request.shipped_at, request.received_at] if value]
        require(dates == sorted(dates), 'urutan proses sampel')
        for line in request.lines.all():
            reserved = sum(a.quantity for a in line.allocations.all())
            expected = line.quantity if request.status == 'APPROVED' and request.fulfillment_status == 'WAITING' else 0
            require(reserved == expected, 'reservasi sampel')
            shipped = -(request.movements.filter(product=line.product).aggregate(n=Sum('delta'))['n'] or 0)
            require(shipped == (line.quantity if request.shipped_at else 0), 'mutasi sampel')
        if request.order_id:
            require(request.outcome == 'PURCHASED' and request.order.customer_id == request.customer_id, 'tautan pembelian sampel')
            require(request.received_at <= request.order.created_at, 'pesanan lebih awal dari sampel')
            require(set(request.lines.values_list('product_id', flat=True)) <= set(request.order.lines.values_list('product_id', flat=True)), 'SKU pembelian sampel')
        for followup in request.followups.exclude(outcome='NOT_FOLLOWED_UP'):
            require(followup.followup_date >= timezone.localdate(request.received_at), 'evaluasi sebelum diterima')
    for activity in Activity.objects.filter(status='DONE'):
        require(bool(activity.result.strip()) and activity.completed_at is not None, 'aktivitas selesai tanpa hasil/waktu')
        require(activity.completed_at >= activity.created_at, 'aktivitas selesai sebelum dibuat')
    for po in PurchaseOrder.objects.all():
        require(0 <= po.quantity_received <= po.quantity_ordered, 'jumlah penerimaan PO')
        require((po.quantity_received == po.quantity_ordered) == (po.status == 'RECEIVED'), 'status penerimaan PO')
        receipts = StockMovement.objects.filter(kind='RECEIPT', reason__startswith=f'Penerimaan {po.number} ·').aggregate(n=Sum('delta'))['n'] or 0
        require(receipts == po.quantity_received, 'ledger penerimaan PO')
