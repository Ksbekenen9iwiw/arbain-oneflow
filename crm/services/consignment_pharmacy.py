"""Pharmacy consignment ('titip jual') stock visits, warehouse adjustments, and overview."""
from uuid import uuid4

from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone

from crm.access import customers_for, require_role, role_of
from crm.errors import BusinessError
from crm.models import (
    Activity,
    ConsignmentStock,
    ConsignmentVisitEntry,
    Customer,
    Product,
    ProductCarryDirective,
    StockBatch,
    StockMovement,
)
from crm.services.batches import ensure_legacy_batch, fefo_key, sync_balance
from crm.services.inventory import atomic_write, integer_input


def _deduct_from_batches(actor, batches, product, quantity, reason, source_prefix):
    remaining = quantity
    for batch in batches:
        if remaining <= 0:
            break
        take = min(batch.available, remaining)
        if take <= 0:
            continue
        batch.on_hand -= take
        batch.save(update_fields=['on_hand'])
        remaining -= take
        StockMovement.objects.create(
            product=product,
            batch=batch,
            delta=-take,
            input_quantity=take,
            kind=StockMovement.Kind.SHIPMENT,
            source_ref=f'{source_prefix}:OUT:{batch.pk}:{uuid4()}',
            actor=actor,
            reason=reason,
        )
    return remaining


def _deduct_warehouse_stock(actor, product, quantity, reason, source_prefix):
    """Deduct free units from active batches (FEFO) and record StockMovement rows."""
    ensure_legacy_batch(product)
    balance = sync_balance(product)
    if balance.available < quantity:
        raise BusinessError(
            'INSUFFICIENT_STOCK',
            f'Stok bebas gudang {product.name} tersedia {balance.available} {product.unit}, '
            f'kurang untuk tambahan titipan {quantity} {product.unit}.',
        )
    all_batches = sorted(product.batches.all(), key=fefo_key)
    active_batches = [
        b for b in all_batches if b.status == StockBatch.Status.ACTIVE and b.available > 0
    ]
    remaining_to_take = _deduct_from_batches(
        actor, active_batches, product, quantity, reason, source_prefix
    )
    if remaining_to_take > 0:
        # Fallback to any batch with unreserved stock if active batches didn't cover it
        _deduct_from_batches(
            actor, all_batches, product, remaining_to_take, reason, source_prefix
        )
    sync_balance(product)


def _return_warehouse_stock(actor, product, quantity, reason, source_prefix, visit_date):
    """Return pulled consignment stock back into warehouse batch and record StockMovement."""
    batch = ensure_legacy_batch(product)
    if batch.received_date is None:
        batch.received_date = visit_date
        batch.save(update_fields=['received_date'])
    batch.on_hand += quantity
    batch.save(update_fields=['on_hand'])
    StockMovement.objects.create(
        product=product,
        batch=batch,
        delta=quantity,
        input_quantity=quantity,
        kind=StockMovement.Kind.RECEIPT,
        source_ref=f'{source_prefix}:IN:{batch.pk}:{uuid4()}',
        actor=actor,
        reason=reason,
    )
    sync_balance(product)


@atomic_write
def record_consignment_visit(
    actor,
    customer_id,
    product_id,
    sold_quantity,
    remaining_stock,
    added_quantity=0,
    returned_quantity=0,
    visit_date=None,
    note='',
    *,
    return_reason=ConsignmentVisitEntry.ReturnReason.NONE,
    nearest_expiry_date=None,
    billing_status=ConsignmentVisitEntry.BillingStatus.BILLED_PAID,
    physical_stamp_verified=True,
    adjust_warehouse=True,
):
    """Record a pharmacy consignment check ('titip jual'):
    1. Remaining physical stock at the pharmacy,
    2. Units sold since the last check (applying QnA #10 '> 2 item' billing rule & QnA #11 partner discount),
    3. New consignment units placed or unsold/near-expiry units pulled back (QnA #10 <= 6 months before ED).
    Automatically enforces Sales A vs Sales B ownership isolation.
    """
    require_role(actor, {'SALES', 'MANAGER'})
    customer = get_object_or_404(customers_for(actor), pk=customer_id)
    if customer.source_pending:
        raise BusinessError('INVALID_STATE', 'Verifikasi master outlet sebelum mencatat titip jual.')
    if not customer.is_active and added_quantity > 0:
        raise BusinessError('INVALID_STATE', 'Pelanggan nonaktif tidak dapat menerima tambahan stok titipan baru.')
    product = get_object_or_404(Product, pk=product_id, is_active=True)
    for val in (sold_quantity, remaining_stock, added_quantity, returned_quantity):
        integer_input(val, 0)

    visit_date = visit_date or timezone.localdate()
    consignment, _ = ConsignmentStock.objects.get_or_create(customer=customer, product=product)
    previous_stock = consignment.quantity_on_display

    if previous_stock > 0 and sold_quantity + remaining_stock != previous_stock:
        raise BusinessError(
            'INVALID_INPUT',
            f'Jumlah laku terjual ({sold_quantity}) ditambah sisa stok fisik ({remaining_stock}) '
            f'harus sama dengan stok titipan sebelumnya di {customer.name} ({previous_stock} {product.unit}).',
        )
    if previous_stock == 0 and (sold_quantity > 0 or remaining_stock > 0):
        raise BusinessError(
            'INVALID_INPUT',
            f'Belum ada stok titipan {product.name} di {customer.name}. Isi 0 pada terjual dan sisa fisik, lalu isi tambahan titipan baru.',
        )
    if returned_quantity > remaining_stock:
        raise BusinessError(
            'INVALID_INPUT',
            f'Jumlah yang ditarik ({returned_quantity}) melebihi sisa stok fisik di apotek ({remaining_stock} {product.unit}).',
        )
    if previous_stock == 0 and added_quantity == 0:
        raise BusinessError(
            'INVALID_INPUT',
            'Isi jumlah tambahan titipan baru untuk menempatkan stok di apotek.',
        )

    directive = getattr(product, 'carry_directive', None)
    if added_quantity > 0 and directive and directive.directive == ProductCarryDirective.Directive.STOP and role_of(actor) == 'SALES':
        sub_text = f' Bawa {directive.substitute_product.name} sebagai pengganti.' if directive.substitute_product else ''
        raise BusinessError(
            'DIRECTIVE_STOP',
            f'Arahan Manajer: {product.name} dihentikan sementara untuk titipan baru karena kurang laku.{sub_text}',
        )

    clean_return_reason = return_reason or ConsignmentVisitEntry.ReturnReason.NONE
    if returned_quantity == 0:
        clean_return_reason = ConsignmentVisitEntry.ReturnReason.NONE
    elif clean_return_reason == ConsignmentVisitEntry.ReturnReason.NONE:
        clean_return_reason = ConsignmentVisitEntry.ReturnReason.SLOW_MOVING

    # QnA #10 & #11: Billing rule (> 2 items sold is billed; <= 2 items sold is not billed yet) + Partner discount
    discount_pct = customer.discount_percent or 0
    gross_rupiah = sold_quantity * product.price_rupiah
    if sold_quantity <= 2:
        effective_billing_status = ConsignmentVisitEntry.BillingStatus.NOT_BILLED
        net_billed_rupiah = 0
    else:
        effective_billing_status = (
            billing_status
            if billing_status in {ConsignmentVisitEntry.BillingStatus.BILLED_PAID, ConsignmentVisitEntry.BillingStatus.DEFERRED}
            else ConsignmentVisitEntry.BillingStatus.BILLED_PAID
        )
        net_billed_rupiah = gross_rupiah * (100 - discount_pct) // 100

    source_prefix = f'CONSIGN:{customer.pk}:{product.pk}'
    if adjust_warehouse and added_quantity > 0:
        _deduct_warehouse_stock(
            actor,
            product,
            added_quantity,
            f'Titip jual ke {customer.name} ({product.sku})',
            source_prefix,
        )
    if adjust_warehouse and returned_quantity > 0:
        _return_warehouse_stock(
            actor,
            product,
            returned_quantity,
            f'Tarik stok titipan dari {customer.name} ({product.sku})',
            source_prefix,
            visit_date,
        )

    closing_stock = remaining_stock - returned_quantity + added_quantity
    consignment.quantity_on_display = closing_stock
    consignment.total_placed += added_quantity
    consignment.total_sold += sold_quantity
    consignment.total_returned += returned_quantity
    consignment.last_checked_date = visit_date
    if nearest_expiry_date is not None:
        consignment.nearest_expiry_date = nearest_expiry_date
    elif closing_stock == 0:
        consignment.nearest_expiry_date = None
    consignment.save()

    clean_note = (note or '').strip()
    summary_parts = [f'Cek titip jual {product.name}: laku {sold_quantity} {product.unit}, sisa {remaining_stock} {product.unit}']
    if added_quantity:
        summary_parts.append(f'tambah titip {added_quantity} {product.unit}')
    if returned_quantity:
        summary_parts.append(f'tarik kembali {returned_quantity} {product.unit}')
    summary_parts.append(f'stok akhir di apotek {closing_stock} {product.unit}.')
    if sold_quantity > 2:
        summary_parts.append(f'Tagihan bersih Rp {net_billed_rupiah:,} (diskon {discount_pct}%).'.replace(',', '.'))
    elif sold_quantity > 0:
        summary_parts.append('Belum ditagih (laku ≤ 2 item).')
    if clean_note:
        summary_parts.append(clean_note)
    result_text = ', '.join(summary_parts[:3]) + (f' ({summary_parts[3]})' if len(summary_parts) > 3 else '')
    if len(summary_parts) > 4:
        result_text += ' ' + ' '.join(summary_parts[4:])

    activity = Activity.objects.create(
        customer=customer,
        sales=customer.owner,
        kind=Activity.Kind.VISIT,
        stage=Activity.Stage.WON if sold_quantity > 0 else Activity.Stage.INTERESTED,
        scheduled_date=visit_date,
        status=Activity.Status.DONE,
        note=clean_note or f'Kunjungan cek stok titip jual {product.name}',
        result=result_text,
        completed_at=timezone.now(),
    )

    return ConsignmentVisitEntry.objects.create(
        customer=customer,
        product=product,
        sales=customer.owner,
        activity=activity,
        visit_date=visit_date,
        previous_stock=previous_stock,
        sold_quantity=sold_quantity,
        remaining_stock=remaining_stock,
        added_quantity=added_quantity,
        returned_quantity=returned_quantity,
        return_reason=clean_return_reason,
        nearest_expiry_date=consignment.nearest_expiry_date,
        billing_status=effective_billing_status,
        gross_rupiah=gross_rupiah,
        discount_percent=discount_pct,
        net_billed_rupiah=net_billed_rupiah,
        physical_stamp_verified=bool(physical_stamp_verified),
        closing_stock=closing_stock,
        note=clean_note,
    )


def pharmacy_consignment_overview(actor, selected_sales=None, customer_id=None, as_of=None):
    """Return per-pharmacy ('apotek') consignment stock breakdown scoped to actor's role."""
    as_of = as_of or timezone.localdate()
    role = role_of(actor)
    if role == 'WAREHOUSE':
        scope = Customer.objects.filter(is_active=True)
    else:
        scope = customers_for(actor)
    if selected_sales and role == 'MANAGER':
        scope = scope.filter(owner_id=selected_sales)
    if customer_id is not None:
        scope = scope.filter(pk=customer_id)

    customers = list(
        scope.select_related('owner').prefetch_related(
            Prefetch(
                'consignment_stocks',
                queryset=ConsignmentStock.objects.select_related('product', 'product__carry_directive').order_by('product__sku'),
            ),
            Prefetch(
                'consignment_entries',
                queryset=ConsignmentVisitEntry.objects.select_related('product', 'sales').order_by('-visit_date', '-pk'),
            ),
        )
    )
    outlets = []
    for customer in customers:
        stocks = [s for s in customer.consignment_stocks.all() if s.quantity_on_display > 0 or s.total_placed > 0]
        if not stocks and customer_id is None:
            continue
        items = []
        total_display = 0
        total_sold = 0
        weak_items = []
        near_expiry_items = []
        last_checked = None
        for s in stocks:
            total_display += s.quantity_on_display
            total_sold += s.total_sold
            if s.last_checked_date and (last_checked is None or s.last_checked_date > last_checked):
                last_checked = s.last_checked_date
            denom = s.total_sold + s.quantity_on_display
            sell_pct = round(s.total_sold * 100 / denom, 1) if denom > 0 else 0.0
            is_weak = s.quantity_on_display >= 4 and sell_pct < 25
            if is_weak:
                weak_items.append(s.product.name)
            days_to_expiry = (s.nearest_expiry_date - as_of).days if s.nearest_expiry_date else None
            is_near_expiry = bool(s.quantity_on_display > 0 and days_to_expiry is not None and days_to_expiry <= 180)
            if is_near_expiry:
                near_expiry_items.append(s.product.name)
            directive = getattr(s.product, 'carry_directive', None)
            items.append({
                'id': str(s.pk),
                'product_id': str(s.product_id),
                'sku': s.product.sku,
                'name': s.product.name,
                'unit': s.product.unit,
                'price_rupiah': s.product.price_rupiah,
                'quantity_on_display': s.quantity_on_display,
                'total_placed': s.total_placed,
                'total_sold': s.total_sold,
                'total_returned': s.total_returned,
                'sell_through_pct': sell_pct,
                'is_weak': is_weak,
                'nearest_expiry_date': s.nearest_expiry_date.isoformat() if s.nearest_expiry_date else None,
                'days_to_expiry': days_to_expiry,
                'is_near_expiry': is_near_expiry,
                'last_checked_date': s.last_checked_date.isoformat() if s.last_checked_date else None,
                'directive_code': directive.directive if directive else '',
                'directive_label': directive.get_directive_display() if directive else '',
            })
        all_entries = list(customer.consignment_entries.all())
        deferred_billing_rupiah = sum(
            e.net_billed_rupiah for e in all_entries
            if e.billing_status == ConsignmentVisitEntry.BillingStatus.DEFERRED
        )
        recent_entries = [
            {
                'id': str(e.pk),
                'visit_date': e.visit_date.isoformat(),
                'product_name': e.product.name,
                'product_sku': e.product.sku,
                'unit': e.product.unit,
                'previous_stock': e.previous_stock,
                'sold_quantity': e.sold_quantity,
                'remaining_stock': e.remaining_stock,
                'added_quantity': e.added_quantity,
                'returned_quantity': e.returned_quantity,
                'return_reason': e.return_reason,
                'return_reason_label': e.get_return_reason_display(),
                'nearest_expiry_date': e.nearest_expiry_date.isoformat() if e.nearest_expiry_date else None,
                'billing_status': e.billing_status,
                'billing_status_label': e.get_billing_status_display(),
                'gross_rupiah': e.gross_rupiah,
                'discount_percent': e.discount_percent,
                'net_billed_rupiah': e.net_billed_rupiah,
                'physical_stamp_verified': e.physical_stamp_verified,
                'closing_stock': e.closing_stock,
                'sales_name': e.sales.get_full_name() or e.sales.username,
                'note': e.note,
            }
            for e in all_entries[:8]
        ]
        outlets.append({
            'customer_id': str(customer.pk),
            'code': customer.code,
            'name': customer.name,
            'outlet_type': customer.outlet_type,
            'outlet_type_label': customer.get_outlet_type_display(),
            'discount_percent': customer.discount_percent,
            'sales_id': str(customer.owner_id),
            'sales_name': customer.owner.get_full_name() or customer.owner.username,
            'total_on_display': total_display,
            'total_sold': total_sold,
            'weak_items': weak_items,
            'near_expiry_items': near_expiry_items,
            'deferred_billing_rupiah': deferred_billing_rupiah,
            'last_checked_date': last_checked.isoformat() if last_checked else None,
            'items': items,
            'recent_entries': recent_entries,
        })
    outlets.sort(key=lambda o: (-len(o['near_expiry_items']), -len(o['weak_items']), -o['total_on_display'], o['code']))
    return outlets
