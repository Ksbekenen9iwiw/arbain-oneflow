from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from statistics import median

from django.http import Http404
from django.utils import timezone

from crm.access import active_sales, customers_for, orders_for, require_role, role_of
from crm.errors import BusinessError
from crm.models import ActionDecision, Activity, OrderLine
from crm.services.inventory import atomic_write, integer_input


@dataclass(frozen=True)
class Candidate:
    key: str
    customer_id: int
    product_id: int | None
    kind: str
    due_date: date
    typical_quantity: int | None
    available_quantity: int | None
    priority: int
    state: str
    reasons: dict


def _half_up(value):
    return int(Decimal(str(value)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def priority_score(overdue_days, value_rupiah, max_value_rupiah, weights=(0.8, 0.2)):
    urgency = min(Decimal(1), Decimal(max(overdue_days, 0)) / Decimal(7))
    value = Decimal(value_rupiah) / Decimal(max_value_rupiah) if max_value_rupiah else Decimal(0)
    return _half_up(100 * (Decimal(str(weights[0])) * urgency + Decimal(str(weights[1])) * value))


def _sort_key(candidate):
    return (-candidate.priority, candidate.due_date, candidate.reasons['customer_code'], candidate.reasons.get('product_sku', ''), candidate.key)


def _compute_candidates(actor, as_of, ignored_order_id=None):
    if role_of(actor) == 'WAREHOUSE':
        return []
    customers = {c.id: c for c in customers_for(actor).filter(is_active=True, owner__in=active_sales())}
    if not customers:
        return []
    rows = OrderLine.objects.filter(order__customer_id__in=customers, order__status='SHIPPED', order__shipped_at__isnull=False).exclude(order_id=ignored_order_id).select_related('order', 'product', 'product__balance').order_by('order__shipped_at', 'pk')
    daily, products, values = defaultdict(lambda: defaultdict(int)), {}, defaultdict(int)
    window_start = as_of - timedelta(days=89)
    for line in rows:
        local_date = timezone.localdate(line.order.shipped_at)
        if local_date > as_of:
            continue
        if local_date >= window_start:
            values[line.order.customer_id] += line.quantity * line.unit_price_rupiah
        if line.product.is_active:
            pair = (line.order.customer_id, line.product_id)
            daily[pair][local_date] += line.quantity
            products[line.product_id] = line.product
    maximum = max(values.values(), default=0)
    pending = set(OrderLine.objects.filter(order__customer_id__in=customers, order__status='CONFIRMED').exclude(order_id=ignored_order_id).values_list('order__customer_id', 'product_id'))
    candidates = []

    def common(customer, due):
        overdue = (as_of - due).days
        value = values[customer.id]
        return priority_score(overdue, value, maximum), {'customer_code': customer.code, 'customer_name': customer.name, 'sales_name': customer.owner.get_full_name() or customer.owner.username, 'overdue_days': overdue, 'value_90_days_rupiah': value, 'max_value_90_days_rupiah': maximum, 'due_date': due.isoformat(), 'urgency_weight': 0.8, 'value_weight': 0.2}

    for activity in Activity.objects.filter(customer_id__in=customers, status='PLANNED', followup_date__lte=as_of).order_by('followup_date', 'pk'):
        priority, reasons = common(customers[activity.customer_id], activity.followup_date)
        reasons.update({'activity_id': activity.id, 'note': activity.note, 'stage': activity.get_stage_display(), 'recorded_at': activity.created_at.isoformat()})
        candidates.append(Candidate(f'FOLLOWUP:{activity.id}', activity.customer_id, None, 'FOLLOWUP', activity.followup_date, None, None, priority, 'READY', reasons))
    for (customer_id, product_id), quantities in daily.items():
        dates = sorted(quantities)[-6:]
        if len(dates) < 3 or (customer_id, product_id) in pending:
            continue
        interval = _half_up(median((later - earlier).days for earlier, later in zip(dates, dates[1:])))
        due = dates[-1] + timedelta(days=interval)
        if due > as_of:
            continue
        typical = int(median(quantities[d] for d in dates[-3:]))
        product = products[product_id]
        balance = product.balance
        available = balance.available
        priority, reasons = common(customers[customer_id], due)
        reasons.update({'product_sku': product.sku, 'product_name': product.name, 'unit': product.unit, 'purchase_dates': [d.isoformat() for d in dates], 'purchase_date_count': len(dates), 'interval_days': interval, 'last_purchase_date': dates[-1].isoformat(), 'typical_quantity': typical, 'available_quantity': available, 'stock_updated_at': balance.updated_at.isoformat(), 'stock_updated_label': timezone.localtime(balance.updated_at).strftime('%d/%m/%Y %H:%M WIB')})
        state = 'READY' if available >= typical else 'WAITING_STOCK'
        candidates.append(Candidate(f'REORDER:{customer_id}:{product_id}:{dates[-1].isoformat()}', customer_id, product_id, 'REORDER', due, typical, available, priority, state, reasons))
    return sorted(candidates, key=_sort_key)


def compute_candidates(actor, as_of):
    return _compute_candidates(actor, as_of)


def list_actions(actor, as_of, limit=5):
    candidates = compute_candidates(actor, as_of)
    decisions = {d.key: d for d in ActionDecision.objects.filter(key__in=[c.key for c in candidates])}
    grouped = {}
    for candidate in candidates:
        decision = decisions.get(candidate.key)
        if decision and (decision.outcome in {'DONE', 'DISMISSED'} or (decision.outcome == 'SNOOZED' and decision.next_date and as_of < decision.next_date)):
            continue
        existing = grouped.get(candidate.customer_id)
        if existing is None or (candidate.kind == 'FOLLOWUP' and existing.kind != 'FOLLOWUP'):
            grouped[candidate.customer_id] = candidate
    result = sorted(grouped.values(), key=_sort_key)
    return result if limit is None else result[:limit]


@atomic_write
def record_action(actor, key, outcome, note, next_date=None, order_id=None, as_of=None):
    require_role(actor, {'SALES', 'MANAGER'})
    as_of = as_of or timezone.localdate()
    if not isinstance(key, str) or not key or len(key) > 200:
        raise Http404('Pemicu tindakan tidak ditemukan.')
    if outcome not in ActionDecision.Outcome.values:
        raise BusinessError('INVALID_INPUT', 'Pilih hasil tindakan yang valid.')
    note = note.strip() if isinstance(note, str) else ''
    if order_id is not None:
        integer_input(order_id, 1)
    previous = ActionDecision.objects.filter(key=key).first()
    if previous:
        if not customers_for(actor).filter(pk=previous.customer_id).exists():
            raise Http404('Pemicu tindakan tidak ditemukan.')
        if (previous.outcome, previous.note, previous.next_date, previous.order_id) == (outcome, note, next_date, order_id):
            return previous
        if previous.outcome in {'DONE', 'DISMISSED'}:
            raise BusinessError('ACTION_ALREADY_RESOLVED', 'Tindakan ini sudah diselesaikan. Catat aktivitas baru bila perlu.')
    linked_order = None
    if order_id is not None:
        linked_order = orders_for(actor).filter(pk=order_id).first()
        if not linked_order or linked_order.status == 'CANCELLED':
            raise BusinessError('INVALID_INPUT', 'Pesanan terkait tidak valid untuk tindakan ini.')
    # Reconstruct the original trigger even if the linked order has already
    # confirmed/shipped and consequently removed it from today's candidates.
    candidates = _compute_candidates(actor, as_of, ignored_order_id=linked_order.id if linked_order else None)
    candidate = next((c for c in candidates if c.key == key), None)
    if not candidate:
        raise Http404('Pemicu sudah berubah atau tidak berada dalam tanggung jawab Anda. Muat ulang daftar.')
    customer = customers_for(actor).get(pk=candidate.customer_id)
    if linked_order and (linked_order.customer_id != customer.id or linked_order.sales_id != customer.owner_id):
        raise BusinessError('INVALID_INPUT', 'Pesanan harus milik pelanggan dan sales penanggung jawab yang sama.')
    if outcome == 'DONE' and not note and not linked_order:
        raise BusinessError('INVALID_INPUT', 'Catat hasil interaksi atau tautkan pesanan untuk menyelesaikan tindakan.')
    if outcome == 'DISMISSED' and not note:
        raise BusinessError('INVALID_INPUT', 'Alasan penolakan wajib diisi.')
    if outcome == 'SNOOZED' and (type(next_date) is not date or next_date <= as_of):
        raise BusinessError('INVALID_INPUT', 'Pilih tanggal penundaan setelah hari ini.')
    if outcome != 'SNOOZED' and next_date is not None:
        raise BusinessError('INVALID_INPUT', 'Tanggal berikutnya hanya untuk tindakan tunda.')
    if outcome != 'DONE' and linked_order:
        raise BusinessError('INVALID_INPUT', 'Pesanan terkait hanya untuk hasil selesai.')
    if outcome == 'DONE':
        result = note or f'Pesanan OF-{linked_order.id:04d} ditautkan.'
        if candidate.kind == 'FOLLOWUP':
            Activity.objects.filter(pk=candidate.reasons['activity_id'], status='PLANNED').update(status='DONE', result=result)
        elif note:
            Activity.objects.create(customer=customer, sales=customer.owner, kind='INTERACTION', stage='CONTACTED', status='DONE', result=note, note='Hasil rekomendasi pembelian ulang.')
    decision, _ = ActionDecision.objects.update_or_create(key=key, defaults={'customer': customer, 'product_id': candidate.product_id, 'actor': actor, 'outcome': outcome, 'note': note, 'next_date': next_date, 'order': linked_order})
    return decision
