"""Consignment ('titip jual') stock at pharmacies, slow-moving detection,
manager carry directives, raw-material early warning alarms, and sales daily/weekly
visit attendance recaps.
"""
from collections import defaultdict
from datetime import timedelta
from uuid import uuid4

from django.db.models import Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from crm.access import active_sales, customers_for, require_role, role_of
from crm.errors import BusinessError
from crm.models import (
    Activity,
    ConsignmentStock,
    ConsignmentVisitEntry,
    Customer,
    OrderLine,
    Product,
    ProductCarryDirective,
    RawMaterial,
    StockBatch,
    StockMovement,
)
from crm.services.batches import ensure_legacy_batch, fefo_key, sync_balance
from crm.services.inventory import atomic_write, integer_input

DAY_NAMES_ID = ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')


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
    batches = [
        b for b in product.batches.all()
        if b.status == StockBatch.Status.ACTIVE and b.available > 0
    ]
    batches.sort(key=fefo_key)
    remaining_to_take = quantity
    for batch in batches:
        if remaining_to_take <= 0:
            break
        take = min(batch.available, remaining_to_take)
        if take <= 0:
            continue
        batch.on_hand -= take
        batch.save(update_fields=['on_hand'])
        remaining_to_take -= take
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
    if remaining_to_take > 0:
        # Fallback to any batch with unreserved stock if active batches didn't cover it
        for batch in sorted(product.batches.all(), key=fefo_key):
            if remaining_to_take <= 0:
                break
            take = min(batch.available, remaining_to_take)
            if take <= 0:
                continue
            batch.on_hand -= take
            batch.save(update_fields=['on_hand'])
            remaining_to_take -= take
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
    if not customer.is_active and added_quantity > 0:
        raise BusinessError('INVALID_STATE', 'Pelanggan nonaktif tidak dapat menerima tambahan stok titipan baru.')
    product = get_object_or_404(Product, pk=product_id, is_active=True)
    for label, val in (
        ('Jumlah terjual', sold_quantity),
        ('Sisa stok fisik', remaining_stock),
        ('Tambahan titipan', added_quantity),
        ('Jumlah ditarik', returned_quantity),
    ):
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


@atomic_write
def save_carry_directive(actor, product_id, directive, substitute_product_id=None, reason=''):
    """Manager sets or updates carry instruction ('Arahan Bawaan Sales') for a product."""
    require_role(actor, {'MANAGER'})
    product = get_object_or_404(Product, pk=product_id)
    if directive == 'CLEAR':
        ProductCarryDirective.objects.filter(product=product).delete()
        return None
    if directive not in ProductCarryDirective.Directive.values:
        raise BusinessError('INVALID_INPUT', 'Pilih jenis arahan bawaan yang valid.')
    substitute = None
    if substitute_product_id:
        if str(substitute_product_id) == str(product.pk):
            raise BusinessError('INVALID_INPUT', 'Produk pengganti harus berbeda dari produk yang dihentikan.')
        substitute = get_object_or_404(Product, pk=substitute_product_id, is_active=True)
    clean_reason = (reason or '').strip()
    if not clean_reason:
        raise BusinessError('INVALID_INPUT', 'Isi alasan atau instruksi bawaan untuk sales.')
    obj, _ = ProductCarryDirective.objects.update_or_create(
        product=product,
        defaults={
            'directive': directive,
            'substitute_product': substitute,
            'reason': clean_reason,
            'updated_by': actor,
        },
    )
    return obj


@atomic_write
def save_raw_material(actor, material_id, on_hand, min_threshold, fast_moving_threshold, note=''):
    """Warehouse or Manager updates raw material stock and early-warning thresholds."""
    require_role(actor, {'MANAGER', 'WAREHOUSE'})
    material = get_object_or_404(RawMaterial, pk=material_id)
    integer_input(on_hand, 0)
    integer_input(min_threshold, 1)
    integer_input(fast_moving_threshold, 1)
    if fast_moving_threshold < min_threshold:
        raise BusinessError('INVALID_INPUT', 'Target stok saat produk laku keras tidak boleh di bawah batas minimum standar.')
    material.on_hand = on_hand
    material.min_threshold = min_threshold
    material.fast_moving_threshold = fast_moving_threshold
    material.note = (note or '').strip()
    material.updated_by = actor
    material.save(update_fields=['on_hand', 'min_threshold', 'fast_moving_threshold', 'note', 'updated_by', 'updated_at'])
    return material


def product_traction_analysis(as_of=None):
    """Evaluate product movement across pharmacies (fast-moving vs slow/dead-moving)
    and attach Manager carry directives.
    """
    as_of = as_of or timezone.localdate()
    since_30d = as_of - timedelta(days=30)
    products = list(
        Product.objects.filter(is_active=True)
        .select_related('balance', 'carry_directive__substitute_product', 'carry_directive__updated_by')
        .prefetch_related('consignment_stocks__customer', 'consignment_entries')
    )
    shipped_30d = defaultdict(int)
    for row in (
        OrderLine.objects.filter(
            order__status='SHIPPED',
            order__shipped_at__date__gte=since_30d,
            order__shipped_at__date__lte=as_of,
        )
        .values('product_id')
        .annotate(total=Sum('quantity'))
    ):
        shipped_30d[row['product_id']] = row['total'] or 0

    rows = []
    for product in products:
        stocks = [s for s in product.consignment_stocks.all() if s.quantity_on_display > 0 or s.total_placed > 0]
        entries_30d = [e for e in product.consignment_entries.all() if since_30d <= e.visit_date <= as_of]
        consign_sold_30d = sum(e.sold_quantity for e in entries_30d)
        on_display = sum(s.quantity_on_display for s in stocks)
        active_outlets = sum(1 for s in stocks if s.quantity_on_display > 0)
        weak_outlets = []
        for s in stocks:
            denom = s.total_sold + s.quantity_on_display
            ratio = (s.total_sold * 100 // denom) if denom else 0
            if s.quantity_on_display >= 4 and ratio < 25:
                weak_outlets.append(s.customer.name)

        exposure = consign_sold_30d + on_display
        sell_through_pct = round(consign_sold_30d * 100 / exposure, 1) if exposure > 0 else 0.0
        total_demand_30d = consign_sold_30d + shipped_30d[product.pk]

        if (sell_through_pct >= 50 and consign_sold_30d >= 12) or total_demand_30d >= 60:
            movement = 'FAST'
            movement_label = 'Laku keras'
        elif active_outlets >= 2 and consign_sold_30d == 0 and on_display >= 6:
            movement = 'DEAD'
            movement_label = 'Tidak laku di apotek'
        elif (active_outlets >= 2 and sell_through_pct < 25 and on_display >= 6) or len(weak_outlets) >= 2:
            movement = 'SLOW'
            movement_label = 'Kurang laku'
        else:
            movement = 'NORMAL'
            movement_label = 'Normal'

        directive = getattr(product, 'carry_directive', None)
        rows.append({
            'id': str(product.pk),
            'product_id': str(product.pk),
            'sku': product.sku,
            'name': product.name,
            'unit': product.unit,
            'on_display': on_display,
            'active_outlets': active_outlets,
            'consign_sold_30d': consign_sold_30d,
            'shipped_30d': shipped_30d[product.pk],
            'total_demand_30d': total_demand_30d,
            'sell_through_pct': sell_through_pct,
            'weak_outlet_count': len(weak_outlets),
            'weak_outlets': weak_outlets[:5],
            'movement': movement,
            'movement_label': movement_label,
            'directive': {
                'code': directive.directive,
                'label': directive.get_directive_display(),
                'substitute_id': str(directive.substitute_product_id) if directive.substitute_product_id else '',
                'substitute_name': directive.substitute_product.name if directive.substitute_product else '',
                'substitute_sku': directive.substitute_product.sku if directive.substitute_product else '',
                'reason': directive.reason,
                'updated_by': directive.updated_by.get_full_name() or directive.updated_by.username,
            } if directive else None,
        })
    order_priority = {'DEAD': 0, 'SLOW': 1, 'FAST': 2, 'NORMAL': 3}
    rows.sort(key=lambda r: (0 if r['directive'] else 1, order_priority.get(r['movement'], 9), r['sku']))
    return rows


def raw_material_alerts(as_of=None):
    """Compute Early Warning System alarms for raw materials ('bahan pokok / bahan baku')
    based on whether linked finished products are fast-moving.
    """
    as_of = as_of or timezone.localdate()
    traction_by_id = {int(r['product_id']): r for r in product_traction_analysis(as_of)}
    materials = list(RawMaterial.objects.prefetch_related('products').order_by('code'))
    alerts = []
    for mat in materials:
        linked = list(mat.products.all())
        fast_products = [
            p.name for p in linked
            if traction_by_id.get(p.pk, {}).get('movement') == 'FAST'
        ]
        is_fast_demand = len(fast_products) > 0
        required_stock = mat.fast_moving_threshold if is_fast_demand else mat.min_threshold
        shortage = max(0, required_stock - mat.on_hand)
        ratio_pct = round(mat.on_hand * 100 / required_stock, 1) if required_stock > 0 else 100.0

        if mat.on_hand <= required_stock * 0.5:
            severity = 'CRITICAL'
            severity_label = 'Alarm kritis (≤ 50% kebutuhan)'
        elif mat.on_hand < required_stock:
            severity = 'WARNING'
            severity_label = 'Perlu pengadaan segera'
        else:
            severity = 'SAFE'
            severity_label = 'Stok bahan baku aman'

        if is_fast_demand and severity != 'SAFE':
            explanation = (
                f'Produk {", ".join(fast_products)} sedang laku keras: wajib sedia minimal '
                f'{required_stock} {mat.unit}, saat ini tersisa {mat.on_hand} {mat.unit} '
                f'(kurang {shortage} {mat.unit}).'
            )
        elif is_fast_demand:
            explanation = (
                f'Produk {", ".join(fast_products)} laku keras: target stok {required_stock} {mat.unit} terpenuhi.'
            )
        elif severity != 'SAFE':
            explanation = (
                f'Stok di bawah batas minimum standar {required_stock} {mat.unit} (kurang {shortage} {mat.unit}).'
            )
        else:
            explanation = f'Memenuhi batas minimum standar ({required_stock} {mat.unit}).'

        alerts.append({
            'id': str(mat.pk),
            'code': mat.code,
            'name': mat.name,
            'unit': mat.unit,
            'on_hand': mat.on_hand,
            'min_threshold': mat.min_threshold,
            'fast_moving_threshold': mat.fast_moving_threshold,
            'required_stock': required_stock,
            'shortage': shortage,
            'ratio_pct': ratio_pct,
            'is_fast_demand': is_fast_demand,
            'fast_products': fast_products,
            'linked_products': [{'id': str(p.pk), 'sku': p.sku, 'name': p.name} for p in linked],
            'severity': severity,
            'severity_label': severity_label,
            'explanation': explanation,
            'note': mat.note,
        })
    severity_rank = {'CRITICAL': 0, 'WARNING': 1, 'SAFE': 2}
    alerts.sort(key=lambda a: (severity_rank.get(a['severity'], 9), a['code']))
    return alerts


def sales_attendance_recap(actor, as_of=None, selected_sales=None):
    """Build daily and 7-day ('Presensi Kunjungan Sales' / Rapat Senin) outlet visit recap.
    Sales only sees their own attendance; Manager sees all sales (or filtered sales).
    """
    role = role_of(actor)
    if role == 'WAREHOUSE':
        return []
    as_of = as_of or timezone.localdate()
    yesterday = as_of - timedelta(days=1)
    week_start = as_of - timedelta(days=6)

    if role == 'SALES':
        sales_users = [actor]
    else:
        qs = active_sales().order_by('username')
        if selected_sales:
            qs = qs.filter(pk=selected_sales)
        sales_users = list(qs)

    customer_scope = customers_for(actor)
    activities = list(
        Activity.objects.filter(
            customer__in=customer_scope,
            sales__in=sales_users,
        )
        .filter(
            Q(status='DONE', completed_at__date__gte=week_start, completed_at__date__lte=as_of)
            | Q(scheduled_date__gte=week_start, scheduled_date__lte=as_of)
        )
        .select_related('customer', 'sales')
        .order_by('-completed_at', '-created_at', '-pk')
    )
    consign_entries = list(
        ConsignmentVisitEntry.objects.filter(
            customer__in=customer_scope,
            sales__in=sales_users,
            visit_date__gte=week_start,
            visit_date__lte=as_of,
        )
        .select_related('customer', 'product', 'sales')
        .order_by('-visit_date', '-created_at', '-pk')
    )

    recaps = []
    for sales_user in sales_users:
        by_day = {
            week_start + timedelta(days=offset): {}
            for offset in range(7)
        }
        for entry in consign_entries:
            if entry.sales_id != sales_user.pk or entry.visit_date not in by_day:
                continue
            day_map = by_day[entry.visit_date]
            item = day_map.setdefault(entry.customer_id, {
                'customer_id': str(entry.customer_id),
                'code': entry.customer.code,
                'name': entry.customer.name,
                'status': 'DONE',
                'notes': [],
            })
            detail = f'{entry.product.name}: laku {entry.sold_quantity}, sisa {entry.remaining_stock}'
            if entry.added_quantity:
                detail += f', +titip {entry.added_quantity}'
            if entry.returned_quantity:
                detail += f', tarik {entry.returned_quantity}'
            item['notes'].append(detail)

        for act in activities:
            if act.customer.owner_id != sales_user.pk and act.sales_id != sales_user.pk:
                continue
            act_day = timezone.localdate(act.completed_at) if act.completed_at else act.scheduled_date
            if act_day not in by_day:
                continue
            day_map = by_day[act_day]
            item = day_map.setdefault(act.customer_id, {
                'customer_id': str(act.customer_id),
                'code': act.customer.code,
                'name': act.customer.name,
                'status': act.status,
                'notes': [],
            })
            if act.status == 'DONE':
                item['status'] = 'DONE'
            summary_text = (act.result or act.note or act.get_kind_display()).strip()
            if summary_text and summary_text not in item['notes']:
                item['notes'].append(summary_text)

        days_list = []
        all_week_outlets = set()
        total_day_visits = 0
        for offset in range(6, -1, -1):
            day_date = week_start + timedelta(days=offset)
            outlets = list(by_day[day_date].values())
            for o in outlets:
                o['summary'] = ' · '.join(o.pop('notes')[:2])
                all_week_outlets.add(o['customer_id'])
            total_day_visits += len(outlets)
            days_list.append({
                'date': day_date.isoformat(),
                'day_name': DAY_NAMES_ID[day_date.weekday()],
                'is_today': day_date == as_of,
                'is_yesterday': day_date == yesterday,
                'outlet_count': len(outlets),
                'outlet_names': ', '.join(o['name'] for o in outlets) if outlets else 'Belum ada kunjungan tercatat',
                'outlets': outlets,
            })

        today_row = next((d for d in days_list if d['is_today']), None)
        yesterday_row = next((d for d in days_list if d['is_yesterday']), None)
        recaps.append({
            'sales_id': str(sales_user.pk),
            'sales_username': sales_user.username,
            'sales_name': sales_user.get_full_name() or sales_user.username,
            'today_count': today_row['outlet_count'] if today_row else 0,
            'today_outlets': today_row['outlets'] if today_row else [],
            'today_names': today_row['outlet_names'] if today_row else 'Belum ada kunjungan tercatat',
            'yesterday_count': yesterday_row['outlet_count'] if yesterday_row else 0,
            'yesterday_outlets': yesterday_row['outlets'] if yesterday_row else [],
            'yesterday_names': yesterday_row['outlet_names'] if yesterday_row else 'Belum ada kunjungan tercatat',
            'week_unique_outlets': len(all_week_outlets),
            'week_total_visits': total_day_visits,
            'days': days_list,
        })
    return recaps


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


def seed_consignment_and_alarms(as_of=None):
    """Idempotently populate realistic consignment stocks at pharmacies, 7-day visit
    entries for Sales A & Sales B, Manager carry directives for slow/fast items,
    and Raw Material early-warning alarms (including the 1-ton vs 0.5-ton scenario).
    Does not touch Order, StockBatch, or InventoryBalance ledgers.
    """
    from django.contrib.auth.models import User
    as_of = as_of or timezone.localdate()
    if ConsignmentStock.objects.exists() or RawMaterial.objects.exists():
        return

    manager = User.objects.filter(groups__name='MANAGER').first()
    warehouse = User.objects.filter(groups__name='WAREHOUSE').first()
    nadia = User.objects.filter(username='nadia').first()
    rafi = User.objects.filter(username='rafi').first()
    if not (manager and nadia and rafi):
        return

    products = {p.sku: p for p in Product.objects.all()}
    nadia_customers = list(Customer.objects.filter(owner=nadia, is_active=True).order_by('code')[:6])
    rafi_customers = list(Customer.objects.filter(owner=rafi, is_active=True).order_by('code')[:6])
    if not nadia_customers or not rafi_customers or 'MADU01' not in products:
        return

    # 0. Assign partner outlet categories & discount rules (QnA #11: Apotek 16%, Minimarket 20%, Distributor 25-50%)
    for customer in Customer.objects.all():
        name_lower = customer.name.lower()
        if 'distributor' in name_lower or 'grosir' in name_lower:
            customer.outlet_type = Customer.OutletType.DISTRIBUTOR
            customer.discount_percent = 30
        elif 'mart' in name_lower or 'swalayan' in name_lower or 'minimarket' in name_lower or 'toko' in name_lower:
            customer.outlet_type = Customer.OutletType.MINIMARKET
            customer.discount_percent = 20
        else:
            customer.outlet_type = Customer.OutletType.APOTEK
            customer.discount_percent = 16
        customer.save(update_fields=['outlet_type', 'discount_percent'])

    # 1. Raw Materials (Early Warning System: 1 ton required for fast-moving MADU01, only 500 kg left!)
    raw_specs = [
        (
            'RM-MADU',
            'Madu Hutan Mentah Murni (Bahan Pokok)',
            'kg',
            500,
            300,
            1000,
            ['MADU01', 'MADU02'],
            'Kritis: Madu Hutan 250 ml sedang laku keras (wajib sedia 1.000 kg / 1 ton), stok tersisa 500 kg (setengah ton).',
        ),
        (
            'RM-TEMU',
            'Simplisia & Ekstrak Herbal Temulawak',
            'kg',
            180,
            150,
            300,
            ['HERBAL01', 'HERBAL02'],
            'Perlu pengadaan tambahan sebelum produksi batch minggu depan.',
        ),
        (
            'RM-ZAITUN',
            'Minyak Atsiri & Bahan Dasar Perawatan',
            'liter',
            95,
            120,
            250,
            ['COSM01', 'COSM03'],
            'Di bawah batas minimum standar 120 liter; hubungi pemasok.',
        ),
        (
            'RM-BOTOL',
            'Botol Kaca Amber 250 ml & Segel',
            'unit',
            1850,
            600,
            1500,
            ['MADU01', 'HERBAL01'],
            'Stok kemasan mencukupi untuk produksi berjalan.',
        ),
    ]
    for code, name, unit, on_hand, min_t, fast_t, skus, note in raw_specs:
        mat = RawMaterial.objects.create(
            code=code,
            name=name,
            unit=unit,
            on_hand=on_hand,
            min_threshold=min_t,
            fast_moving_threshold=fast_t,
            note=note,
            updated_by=warehouse or manager,
        )
        linked = [products[s] for s in skus if s in products]
        if linked:
            mat.products.set(linked)

    # 2. Consignment stock & 7-day visit history across Nadia (Sales A) and Rafi (Sales B)
    # Fast moving: MADU01, MADU02, HERBAL01
    # Slow / Dead moving across almost all pharmacies: HERBAL03 (Teh Herbal) & COSM02 (Balm Herbal)
    consign_plan = [
        # (customer_list, index, sku, day_offset, prev, sold, rem, added, ret, ret_reason, exp_days, bill_mode, note)
        # Today (day_offset = 0)
        (nadia_customers, 0, 'MADU01', 0, 12, 9, 3, 10, 0, 'NONE', 340, 'BILLED_PAID', 'Laku keras di Apotek; tambah titipan 10 botol baru.'),
        (nadia_customers, 0, 'HERBAL03', 0, 8, 0, 8, 0, 4, 'NEAR_EXPIRY', 120, 'NOT_BILLED', 'Teh Herbal tidak bergerak & mendekati 4 bulan sebelum ED (≤ 6 bln); tarik 4 unit.'),
        (nadia_customers, 1, 'MADU02', 0, 10, 7, 3, 8, 0, 'NONE', 310, 'DEFERRED', 'Permintaan rutin stabil, tambah 8 botol (penagihan tunda pekan depan oleh petugas tagih).'),
        (rafi_customers, 0, 'MADU01', 0, 15, 11, 4, 12, 0, 'NONE', 350, 'BILLED_PAID', 'Penjualan tinggi pekan ini, tambah 12 botol.'),
        (rafi_customers, 1, 'COSM02', 0, 10, 1, 9, 0, 0, 'NONE', 145, 'NOT_BILLED', 'Balm Herbal baru laku 1 item (≤ 2 item belum ditagih) & masa simpan < 5 bulan.'),
        # Yesterday (day_offset = 1)
        (nadia_customers, 2, 'MADU01', 1, 10, 8, 2, 10, 0, 'NONE', 330, 'BILLED_PAID', 'Stok titipan hampir habis, isi ulang 10 botol.'),
        (nadia_customers, 2, 'COSM02', 1, 8, 1, 7, 0, 0, 'NONE', 260, 'NOT_BILLED', 'Laku 1 item (≤ 2 item belum ditagih), kurang diminati pelanggan apotek.'),
        (nadia_customers, 3, 'HERBAL01', 1, 8, 5, 3, 6, 0, 'NONE', 300, 'BILLED_PAID', 'Minuman Herbal laku 5 botol, tambah 6 botol.'),
        (rafi_customers, 2, 'MADU02', 1, 12, 8, 4, 8, 0, 'NONE', 320, 'DEFERRED', 'Penjualan bagus, tambah 8 botol (jadwal tagih tunda).'),
        (rafi_customers, 2, 'HERBAL03', 1, 10, 0, 10, 0, 5, 'SLOW_MOVING', 150, 'NOT_BILLED', 'Tidak ada penjualan sebulan terakhir & ED ≤ 6 bulan, tarik 5 unit.'),
        # 2 to 6 days ago (for full 1-week Monday meeting recap)
        (nadia_customers, 4, 'MADU01', 2, 10, 7, 3, 9, 0, 'NONE', 340, 'BILLED_PAID', 'Kunjungan rutin cek stok titipan.'),
        (rafi_customers, 3, 'HERBAL01', 2, 10, 6, 4, 6, 0, 'NONE', 290, 'BILLED_PAID', 'Kunjungan rutin & top-up stok rak.'),
        (nadia_customers, 5 % len(nadia_customers), 'COSM01', 3, 8, 5, 3, 5, 0, 'NONE', 280, 'BILLED_PAID', 'Sabun Herbal terjual 5 unit.'),
        (rafi_customers, 4 % len(rafi_customers), 'COSM02', 3, 9, 1, 8, 0, 0, 'NONE', 240, 'NOT_BILLED', 'Perputaran Balm Herbal sangat lambat (laku 1 item, belum ditagih).'),
        (nadia_customers, 0, 'HERBAL02', 4, 6, 4, 2, 6, 0, 'NONE', 270, 'BILLED_PAID', 'Tambah stok Serbuk Herbal.'),
        (rafi_customers, 5 % len(rafi_customers), 'MADU01', 4, 12, 9, 3, 9, 0, 'NONE', 350, 'BILLED_PAID', 'Laku keras, isi kembali rak utama.'),
        (nadia_customers, 1, 'HERBAL03', 5, 6, 0, 6, 0, 0, 'NONE', 135, 'NOT_BILLED', 'Belum ada penjualan Teh Herbal di outlet ini (mendekati batas tarik 6 bln ED).'),
        (rafi_customers, 0, 'HERBAL03', 5, 8, 0, 8, 0, 0, 'NONE', 210, 'NOT_BILLED', 'Stok Teh Herbal masih utuh di etalase.'),
        (nadia_customers, 2, 'MADU02', 6, 10, 6, 4, 6, 0, 'NONE', 310, 'BILLED_PAID', 'Awal pekan cek & tambah stok.'),
        (rafi_customers, 1, 'MADU01', 6, 10, 8, 2, 8, 0, 'NONE', 345, 'BILLED_PAID', 'Awal pekan cek & tambah stok.'),
    ]

    stock_acc = {}
    for cust_list, idx, sku, offset, prev, sold, rem, added, ret, ret_reason, exp_days, bill_mode, note in consign_plan:
        if sku not in products or idx >= len(cust_list):
            continue
        customer = cust_list[idx]
        customer.refresh_from_db()
        product = products[sku]
        vdate = as_of - timedelta(days=offset)
        exp_date = as_of + timedelta(days=exp_days) if exp_days else None
        closing = rem - ret + added
        discount_pct = customer.discount_percent or 16
        gross_rp = sold * product.price_rupiah
        if sold <= 2:
            eff_bill = ConsignmentVisitEntry.BillingStatus.NOT_BILLED
            net_rp = 0
        else:
            eff_bill = bill_mode
            net_rp = gross_rp * (100 - discount_pct) // 100
        ConsignmentVisitEntry.objects.create(
            customer=customer,
            product=product,
            sales=customer.owner,
            visit_date=vdate,
            previous_stock=prev,
            sold_quantity=sold,
            remaining_stock=rem,
            added_quantity=added,
            returned_quantity=ret,
            return_reason=ret_reason,
            nearest_expiry_date=exp_date,
            billing_status=eff_bill,
            gross_rupiah=gross_rp,
            discount_percent=discount_pct,
            net_billed_rupiah=net_rp,
            physical_stamp_verified=True,
            closing_stock=closing,
            note=note,
        )
        key = (customer.pk, product.pk)
        cur = stock_acc.get(key)
        if cur is None:
            stock_acc[key] = {
                'customer': customer,
                'product': product,
                'quantity_on_display': closing,
                'total_placed': prev + added,
                'total_sold': sold,
                'total_returned': ret,
                'nearest_expiry_date': exp_date,
                'last_checked_date': vdate,
            }
        else:
            cur['total_placed'] += added
            cur['total_sold'] += sold
            cur['total_returned'] += ret
            if vdate >= cur['last_checked_date']:
                cur['quantity_on_display'] = closing
                cur['last_checked_date'] = vdate
                cur['nearest_expiry_date'] = exp_date

    for item in stock_acc.values():
        ConsignmentStock.objects.create(**item)

    # 3. Manager Carry Directives ('Arahan Bawaan Sales')
    if 'HERBAL03' in products and 'MADU01' in products:
        ProductCarryDirective.objects.create(
            product=products['HERBAL03'],
            directive=ProductCarryDirective.Directive.STOP,
            substitute_product=products['MADU01'],
            reason='Tidak laku di hampir seluruh apotek (0 terjual dalam 30 hari). Sales tidak usah bawa dulu; ganti bawa Madu Hutan 250 ml & Madu Bunga 100 ml.',
            updated_by=manager,
        )
    if 'COSM02' in products and 'MADU02' in products:
        ProductCarryDirective.objects.create(
            product=products['COSM02'],
            directive=ProductCarryDirective.Directive.REDUCE,
            substitute_product=products['MADU02'],
            reason='Perputaran di apotek sangat lambat (< 15%). Jangan tambah titipan baru, alihkan bawaan ke Madu Bunga 100 ml.',
            updated_by=manager,
        )
    if 'MADU01' in products:
        ProductCarryDirective.objects.create(
            product=products['MADU01'],
            directive=ProductCarryDirective.Directive.PRIORITY,
            substitute_product=None,
            reason='Laku keras di seluruh apotek (> 70% terjual). Pastikan setiap kunjungan membawa stok isi ulang.',
            updated_by=manager,
        )

