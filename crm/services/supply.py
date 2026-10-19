"""Dynamic replenishment planning: sales velocity, projection, purchase orders.

Projection model (single documented definition):
- Start balance = sum of ``available`` over ACTIVE, unexpired batches. Batch
  reserved units (confirmed orders, sample allocations) are already excluded,
  so open customer orders are never subtracted a second time from demand.
- Demand = mean shipped units/day over the last N complete calendar days
  (today excluded); days without sales stay in the denominator.
- Outstanding purchase orders contribute their not-yet-received units on the
  ETA day. Late or undated orders are flagged as uncertainty, not assumed away.
- Sample issuances are not sales: they reduce the balance but never the rate.
No returns model exists in this system, so nothing nets against velocity.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal, ROUND_CEILING

from django.shortcuts import get_object_or_404
from django.utils import timezone

from crm.access import require_role, role_of
from crm.errors import BusinessError
from crm.models import OrderLine, Product, ProductSupplySetting, PurchaseOrder, StockBatch
from crm.services.inventory import atomic_write, find_receipt, integer_input, receive_stock

RISK_CONFIG = 'PERLU_KONFIGURASI'
RISK_REVIEW = 'PERLU_DITINJAU'
RISK_REORDER = 'PERLU_PENGADAAN'
RISK_LATE = 'RISIKO_KOSONG_TERLAMBAT'
RISK_OK = 'PASOKAN_AMAN'
HORIZON_CAP_DAYS = 400


def _rate_text(value):
    text = f'{Decimal(value).quantize(Decimal("0.01")):.2f}'
    return text.rstrip('0').rstrip('.')


def velocity(product, as_of, period_days):
    start = as_of - timedelta(days=period_days)
    units = sum(OrderLine.objects.filter(
        product=product, order__status='SHIPPED',
        order__shipped_at__date__gte=start, order__shipped_at__date__lt=as_of,
    ).values_list('quantity', flat=True))
    first_shipped = (OrderLine.objects.filter(product=product, order__status='SHIPPED', order__shipped_at__isnull=False)
                     .order_by('order__shipped_at').values_list('order__shipped_at', flat=True).first())
    caveats = []
    if first_shipped is None:
        caveats.append('Belum ada penjualan terkirim tercatat; rata-rata harian 0 bukan kepastian permintaan.')
        complete = False
    elif timezone.localdate(first_shipped) > start:
        caveats.append(f'Riwayat baru mulai {timezone.localdate(first_shipped).isoformat()}; periode {period_days} hari belum sepenuhnya teramati.')
        complete = False
    else:
        complete = True
    if units and product.balance.available <= 0:
        caveats.append('Stok bebas saat ini kosong; penjualan periode mungkin tertekan kehabisan stok.')
    return {'units': units, 'period_days': period_days, 'rate': Decimal(units) / period_days, 'complete': complete, 'caveats': caveats}


def eligible_available(product, as_of):
    """Free units on lots that may still be sold today (FEFO-eligible; undated lots count)."""
    total = 0
    for batch in product.batches.all():
        if batch.status == StockBatch.Status.ACTIVE and (batch.expiry_date is None or batch.expiry_date >= as_of):
            total += max(batch.available, 0)
    return total


def _project(eligible, rate, arrivals, as_of, horizon):
    """Day-by-day walk of free units; returns first stockout date or None."""
    balance, stockout = Decimal(eligible), None
    for offset in range(1, horizon + 1):
        day = as_of + timedelta(days=offset)
        balance += arrivals.pop(day, Decimal(0))
        balance -= rate
        if balance < 0 and stockout is None:
            stockout = day
    return stockout


def forecast(product, as_of=None):
    as_of = as_of or timezone.localdate()
    # Fresh query: the reverse one-to-one cache on ``product`` can hold a stale row.
    setting = ProductSupplySetting.objects.filter(product_id=product.pk).first()
    result = {
        'as_of': as_of, 'risk': RISK_OK, 'reasons': [], 'caveats': [],
        'configured': bool(setting and setting.is_configured),
        'velocity': None, 'eligible': None, 'trigger': None, 'coverage_days': None,
        'recommend_quantity': None, 'arrival_stock': None, 'stockout_date': None,
        'outstanding_units': 0, 'arrivals': [], 'config': None,
    }
    if not result['configured']:
        missing = [label for field, label in (
            ('analysis_period_days', 'periode analisis'), ('lead_time_days', 'waktu pengisian ulang'),
            ('coverage_target_days', 'target cakupan'), ('safety_stock_days', 'hari cadangan'),
        ) if setting is None or getattr(setting, field) is None]
        result['risk'] = RISK_CONFIG
        result['reasons'] = ['Perlu konfigurasi: ' + ', '.join(missing) + ' belum diisi.']
        return result

    period = setting.analysis_period_days
    lead, coverage, safety = setting.lead_time_days, setting.coverage_target_days, setting.safety_stock_days
    result['config'] = {'analysis_period_days': period, 'lead_time_days': lead,
                        'coverage_target_days': coverage, 'safety_stock_days': safety}
    speed = velocity(product, as_of, period)
    result['velocity'] = {key: (_rate_text(value) if key == 'rate' else value) for key, value in speed.items()}
    result['caveats'].extend(speed['caveats'])
    result['eligible'] = eligible = eligible_available(product, as_of)
    rate = speed['rate']
    trigger = rate * (lead + safety)
    result['trigger'] = _rate_text(trigger)
    result['coverage_days'] = None if rate == 0 else str((Decimal(eligible) / rate).quantize(Decimal('0.1')))

    outstanding = list(PurchaseOrder.objects.filter(product=product, status=PurchaseOrder.Status.CONFIRMED).order_by('expected_date', 'pk'))
    result['outstanding_units'] = outstanding_total = sum(po.remaining for po in outstanding)
    result['arrivals'] = [
        {'id': po.pk, 'number': po.number, 'remaining': po.remaining,
         'expected_date': po.expected_date, 'late': po.expected_date is None or po.expected_date <= as_of}
        for po in outstanding
    ]
    for po in result['arrivals']:
        if po['late']:
            result['caveats'].append(f'{po["number"]} tanpa estimasi valid atau sudah melewati estimasi; dihitung datang besok.')

    if rate == 0:
        result['reasons'].append(f'Tidak ada unit terkirim pada periode {period} hari; pemicu dan rekomendasi tidak dihitung dari nol.')
        return result

    result['reasons'].append(
        f'Rata-rata {_rate_text(rate)} {product.unit}/hari dari {speed["units"]} unit terkirim dalam {period} hari penuh.'
    )
    result['reasons'].append(
        f'Stok layak jual {eligible} {product.unit}. Batas pemicu = {_rate_text(rate)} × ({lead} + {safety}) hari = {_rate_text(trigger)}.'
    )
    required = rate * (lead + coverage + safety)
    recommend = max(Decimal(0), required - eligible - outstanding_total).to_integral_value(rounding=ROUND_CEILING)
    # Only the coverage window matters: stock that survives lead+coverage+safety days
    # has met this cycle's target; later depletion is the next cycle's problem.
    window = min(lead + coverage + safety, HORIZON_CAP_DAYS)
    arrivals = defaultdict(lambda: Decimal(0))
    for po in outstanding:
        day = po.expected_date if po.expected_date and po.expected_date > as_of else as_of + timedelta(days=1)
        if day <= as_of + timedelta(days=window):
            arrivals[day] += po.remaining
    stockout = _project(eligible, rate, arrivals, as_of, window)
    arriving_by_lead = sum((po.remaining for po in outstanding
                            if po.expected_date and po.expected_date <= as_of + timedelta(days=lead)), Decimal(0))
    result['stockout_date'] = stockout
    result['recommend_quantity'] = int(recommend)
    result['arrival_stock'] = int(Decimal(eligible) - rate * lead + recommend + arriving_by_lead)

    if not speed['complete']:
        result['risk'] = RISK_REVIEW
        result['reasons'].append('Riwayat belum lengkap; angka di atas hanya indikasi, tinjau manual sebelum pengadaan.')
    elif recommend > 0:
        result['risk'] = RISK_REORDER
        basis = f'{_rate_text(rate)} × ({lead} + {coverage} + {safety}) hari − {eligible} layak − {outstanding_total} berjalan'
        result['reasons'].append(f'Rekomendasi {recommend} {product.unit}: {basis}, dibulatkan ke atas.')
        if Decimal(eligible) <= trigger:
            result['reasons'].append('Persediaan sudah mencapai atau berada di bawah batas pengadaan.')
    elif stockout is not None:
        result['risk'] = RISK_LATE
        result['reasons'].append(
            f'Jumlah pengadaan berjalan cukup ({outstanding_total} {product.unit}) tetapi stok diproyeksikan habis {stockout.isoformat()} sebelum tiba; percepat kedatangan.'
        )
    else:
        result['reasons'].append('Stok layak plus pengadaan berjalan memproyeksikan cukup sampai target cakupan tercapai.')
    return result


def supply_alerts(actor, limit=5):
    if role_of(actor) not in {'WAREHOUSE', 'MANAGER'}:
        return []
    as_of = timezone.localdate()
    rows = []
    for product in Product.objects.filter(is_active=True, supply_setting__isnull=False).select_related('balance'):
        data = forecast(product, as_of)
        if data['risk'] != RISK_OK:
            rows.append({
                'product': {'id': str(product.pk), 'sku': product.sku, 'name': product.name, 'unit': product.unit},
                'risk': data['risk'], 'eligible': data['eligible'], 'trigger': data['trigger'],
                'recommend_quantity': data['recommend_quantity'],
                'reasons': (data['reasons'][:1] + data['caveats'][:1]) or ['Perlu tinjauan.'],
            })
    order = {RISK_LATE: 0, RISK_REORDER: 1, RISK_CONFIG: 2, RISK_REVIEW: 3}
    rows.sort(key=lambda row: (order.get(row['risk'], 9), -(row['recommend_quantity'] or 0)))
    return rows[:limit]


@atomic_write
def save_settings(actor, product_id, analysis_period_days, lead_time_days, coverage_target_days, safety_stock_days):
    require_role(actor, {'MANAGER'})
    product = get_object_or_404(Product, pk=product_id)
    if analysis_period_days not in ProductSupplySetting.Period.values:
        raise BusinessError('INVALID_INPUT', 'Periode analisis harus 7, 14, atau 30 hari.')
    for name, value, minimum in (('waktu pengisian ulang', lead_time_days, 0), ('target cakupan', coverage_target_days, 1), ('hari cadangan', safety_stock_days, 0)):
        integer_input(value, minimum)
        if value > 3650:
            raise BusinessError('INVALID_INPUT', f'{name} maksimal 3650 hari.')
    return ProductSupplySetting.objects.update_or_create(product=product, defaults={
        'analysis_period_days': analysis_period_days, 'lead_time_days': lead_time_days,
        'coverage_target_days': coverage_target_days, 'safety_stock_days': safety_stock_days,
        'updated_by': actor,
    })[0]


@atomic_write
def create_purchase_order(actor, product_id, quantity, expected_date=None, note=''):
    require_role(actor, {'MANAGER'})
    integer_input(quantity, 1)
    product = get_object_or_404(Product, pk=product_id, is_active=True)
    if expected_date is not None and expected_date < timezone.localdate():
        raise BusinessError('INVALID_INPUT', 'Estimasi kedatangan tidak boleh sebelum hari ini.')
    return PurchaseOrder.objects.create(
        product=product, quantity_ordered=quantity, expected_date=expected_date,
        note=(note or '').strip(), created_by=actor,
    )


@atomic_write
def cancel_purchase_order(actor, purchase_order_id, reason):
    require_role(actor, {'MANAGER'})
    order = get_object_or_404(PurchaseOrder, pk=purchase_order_id)
    reason = (reason or '').strip()
    if not reason:
        raise BusinessError('INVALID_INPUT', 'Alasan pembatalan wajib diisi.')
    if order.status == PurchaseOrder.Status.CANCELLED:
        if order.cancel_reason != reason:
            raise BusinessError('IDEMPOTENCY_CONFLICT', 'Pengadaan sudah dibatalkan dengan alasan berbeda.')
        return order
    if order.status != PurchaseOrder.Status.CONFIRMED or order.quantity_received:
        raise BusinessError('INVALID_STATE', 'Hanya pengadaan berjalan tanpa penerimaan yang dapat dibatalkan.')
    order.status = PurchaseOrder.Status.CANCELLED
    order.cancel_reason = reason
    order.save(update_fields=['status', 'cancel_reason', 'updated_at'])
    return order


@atomic_write
def receive_purchase_order(actor, purchase_order_id, quantity, operation_id, batch_code=None, received_date=None, expiry_date=None):
    require_role(actor, {'WAREHOUSE', 'MANAGER'})
    order = get_object_or_404(PurchaseOrder, pk=purchase_order_id)
    integer_input(quantity, 1)
    if order.status == PurchaseOrder.Status.CANCELLED:
        raise BusinessError('INVALID_STATE', 'Pengadaan dibatalkan tidak dapat diterima; buat catatan baru.')
    if order.status == PurchaseOrder.Status.RECEIVED:
        raise BusinessError('INVALID_STATE', 'Pengadaan sudah diterima penuh.')
    if quantity > order.remaining:
        raise BusinessError('INVALID_INPUT', f'Jumlah melebihi sisa pengadaan ({order.remaining} {order.product.unit}).')
    if find_receipt(operation_id):
        # Retry of an already-recorded receipt: stock and counters stay untouched.
        return order
    reason = f'Penerimaan {order.number}' + (f' · {order.note}' if order.note else '')
    receive_stock(actor, order.product_id, quantity, reason, operation_id,
                  batch_code=batch_code, received_date=received_date, expiry_date=expiry_date)
    order.quantity_received += quantity
    if order.quantity_received >= order.quantity_ordered:
        order.status = PurchaseOrder.Status.RECEIVED
        order.received_at = timezone.now()
        order.save(update_fields=['quantity_received', 'status', 'received_at', 'updated_at'])
    else:
        order.save(update_fields=['quantity_received', 'updated_at'])
    return order
