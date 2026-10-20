import hashlib
import json
from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone

from crm.access import active_sales, customers_for, orders_for, require_role, sample_requests_for
from crm.errors import BusinessError
from crm.models import (
    Activity,
    InventoryBalance,
    Order,
    Product,
    SampleAllocation,
    SampleFollowUp,
    SamplePolicy,
    SampleRequest,
    SampleRequestLine,
    StockBatch,
    StockMovement,
)
from crm.services.batches import eligible_batches, sync_balance
from crm.services.inventory import atomic_write, integer_input


def sample_version(request):
    snapshot = [
        request.customer_id,
        request.status,
        request.purpose,
        request.customer_need,
        request.potential_orders,
        request.business_profile,
        request.notes,
        list(request.lines.order_by('product_id').values_list('product_id', 'quantity')),
    ]
    return hashlib.sha256(json.dumps(snapshot).encode()).hexdigest()


def _prepare_lines(lines):
    if not isinstance(lines, list) or not 1 <= len(lines) <= 50:
        raise BusinessError('INVALID_INPUT', 'Pengajuan harus memiliki 1 sampai 50 produk.')
    prepared, used = [], set()
    for line in lines:
        if not isinstance(line, dict) or set(line) != {'product_id', 'quantity'}:
            raise BusinessError('INVALID_INPUT', 'Baris sampel hanya boleh berisi produk dan jumlah.')
        product_id = integer_input(line['product_id'], 1)
        quantity = integer_input(line['quantity'], 1)
        if product_id in used:
            raise BusinessError('INVALID_INPUT', 'Gabungkan produk yang sama menjadi satu baris.')
        used.add(product_id)
        prepared.append((get_object_or_404(Product, pk=product_id, is_active=True), quantity))
    return prepared


def _text(value):
    return value.strip() if isinstance(value, str) else ''


@atomic_write
def create_draft(actor, customer_id, lines, purpose='', customer_need='', potential_orders='', business_profile='', notes=''):
    require_role(actor, {'SALES', 'MANAGER'})
    customer = get_object_or_404(customers_for(actor), pk=customer_id, is_active=True)
    if not active_sales().filter(pk=customer.owner_id).exists():
        raise BusinessError('INVALID_INPUT', 'Penanggung jawab pelanggan harus sales aktif.')
    prepared = _prepare_lines(lines)
    request = SampleRequest.objects.create(
        customer=customer,
        sales=customer.owner,
        purpose=_text(purpose),
        customer_need=_text(customer_need),
        potential_orders=_text(potential_orders),
        business_profile=_text(business_profile),
        notes=_text(notes),
    )
    SampleRequestLine.objects.bulk_create([
        SampleRequestLine(request=request, product=product, quantity=quantity)
        for product, quantity in prepared
    ])
    return request


@atomic_write
def update_draft(actor, request_id, customer_id, lines, version, **fields):
    require_role(actor, {'SALES', 'MANAGER'})
    request = get_object_or_404(sample_requests_for(actor), pk=request_id)
    if request.status != SampleRequest.Status.DRAFT:
        raise BusinessError('INVALID_STATE', 'Hanya pengajuan draf yang dapat diedit.')
    if not version or version != sample_version(request):
        raise BusinessError('STALE_DRAFT', 'Draf diubah pengguna lain. Muat ulang sebelum mengedit.')
    customer = get_object_or_404(customers_for(actor), pk=customer_id, is_active=True)
    if not active_sales().filter(pk=customer.owner_id).exists():
        raise BusinessError('INVALID_INPUT', 'Penanggung jawab pelanggan harus sales aktif.')
    prepared = _prepare_lines(lines)
    request.customer, request.sales = customer, customer.owner
    for name in ('purpose', 'customer_need', 'potential_orders', 'business_profile', 'notes'):
        setattr(request, name, _text(fields.get(name, '')))
    request.save(update_fields=['customer', 'sales', 'purpose', 'customer_need', 'potential_orders', 'business_profile', 'notes', 'updated_at'])
    request.lines.all().delete()
    SampleRequestLine.objects.bulk_create([
        SampleRequestLine(request=request, product=product, quantity=quantity)
        for product, quantity in prepared
    ])
    return request


def _is_new_customer(customer):
    return not customer.orders.filter(status=Order.Status.SHIPPED).exists()


@atomic_write
def submit_request(actor, request_id):
    require_role(actor, {'SALES', 'MANAGER'})
    request = get_object_or_404(sample_requests_for(actor), pk=request_id)
    if request.status == SampleRequest.Status.SUBMITTED:
        return request
    if request.status != SampleRequest.Status.DRAFT:
        raise BusinessError('INVALID_STATE', 'Hanya draf yang dapat diajukan.')
    if not request.lines.exists():
        raise BusinessError('INVALID_INPUT', 'Pengajuan harus memiliki setidaknya satu produk.')
    missing = [label for field, label in (
        ('purpose', 'tujuan pemberian'),
        ('customer_need', 'kebutuhan pelanggan'),
        ('potential_orders', 'potensi pesanan'),
    ) if not getattr(request, field).strip()]
    if _is_new_customer(request.customer) and not request.business_profile.strip():
        missing.append('profil usaha')
    if missing:
        raise BusinessError('INVALID_INPUT', 'Lengkapi ' + ', '.join(missing) + ' sebelum mengajukan.')
    request.status = SampleRequest.Status.SUBMITTED
    request.save(update_fields=['status', 'updated_at'])
    return request


def get_policy():
    return SamplePolicy.objects.filter(pk=1).first()


def _policy_data(policy):
    return {
        'repeat_threshold': policy.repeat_threshold if policy else None,
        'review_period_days': policy.review_period_days if policy else None,
        'evaluation_days': policy.evaluation_days if policy else None,
    }


def recommend(request, as_of=None):
    as_of = as_of or timezone.localdate()
    policy = get_policy()
    policy_data = _policy_data(policy)
    missing_policy = [key for key, value in policy_data.items() if value is None]
    product_ids = list(request.lines.values_list('product_id', flat=True))
    product_skus = list(request.lines.select_related('product').values_list('product__sku', flat=True))
    result = SampleRequest.Recommendation.REVIEW
    reasons = []
    evidence = {
        'as_of': as_of.isoformat(),
        'product_ids': product_ids,
        'product_skus': product_skus,
        'review_period_start': None,
        'received_count': 0,
        'in_evaluation_count': 0,
        'without_result_count': 0,
        'linked_purchase_count': 0,
        'requests': [],
    }
    if missing_policy:
        reasons.append('Kebijakan belum dikonfigurasi: ' + ', '.join(missing_policy) + '.')
        return {'result': result, 'label': SampleRequest.Recommendation(result).label,
                'reasons': reasons, 'policy': policy_data, 'evidence': evidence}

    period_start = as_of - timedelta(days=policy.review_period_days)
    evidence['review_period_start'] = period_start.isoformat()
    previous = SampleRequest.objects.filter(
        customer=request.customer,
        fulfillment_status=SampleRequest.FulfillmentStatus.RECEIVED,
        received_at__date__gte=period_start,
        lines__product_id__in=product_ids,
    ).exclude(pk=request.pk).distinct().prefetch_related('lines__product', 'followups', 'order')
    received = list(previous)
    evidence['received_count'] = len(received)
    evaluation_cutoff = as_of - timedelta(days=policy.evaluation_days)
    in_evaluation, without_result, linked = [], [], []
    for previous_request in received:
        products = [
            {'sku': line.product.sku, 'quantity': line.quantity}
            for line in previous_request.lines.all() if line.product_id in product_ids
        ]
        meaningful_followup = any(
            (followup.response.strip() or followup.note.strip()) and followup.outcome in {
                SampleRequest.Outcome.NOT_FOLLOWED_UP,
                SampleRequest.Outcome.EVALUATING,
            }
            for followup in previous_request.followups.all()
        )
        still_evaluating = bool(previous_request.received_at and timezone.localdate(previous_request.received_at) > evaluation_cutoff)
        if previous_request.order_id:
            linked.append(previous_request)
        elif still_evaluating:
            in_evaluation.append(previous_request)
        elif not meaningful_followup:
            without_result.append(previous_request)
        evidence['requests'].append({
            'id': previous_request.id,
            'number': previous_request.number,
            'received_at': previous_request.received_at.isoformat() if previous_request.received_at else None,
            'products': products,
            'outcome': previous_request.outcome,
            'linked_order_id': previous_request.order_id,
            'has_active_followup_note': meaningful_followup,
            'in_evaluation': still_evaluating,
        })
    evidence.update(
        in_evaluation_count=len(in_evaluation),
        without_result_count=len(without_result),
        linked_purchase_count=len(linked),
    )

    if _is_new_customer(request.customer) and not received:
        reasons.append('Belum ada riwayat pelanggan; data lengkap perlu ditinjau manual.')
    elif linked:
        result = SampleRequest.Recommendation.APPROVE
        reasons.append(f'{len(linked)} pemberian produk terkait memiliki pembelian yang ditautkan.')
    elif len(without_result) >= policy.repeat_threshold:
        result = SampleRequest.Recommendation.REJECT
        reasons.append(
            f'{len(without_result)} pemberian produk yang sama dalam {policy.review_period_days} hari '
            'belum memiliki pembelian atau tindak lanjut aktif bercatatan.'
        )
    elif in_evaluation:
        reasons.append(f'{len(in_evaluation)} pemberian masih dalam masa evaluasi {policy.evaluation_days} hari.')
    else:
        result = SampleRequest.Recommendation.APPROVE
        reasons.append('Tidak ditemukan pengulangan tanpa hasil yang melewati ambang kebijakan.')
    return {'result': result, 'label': SampleRequest.Recommendation(result).label,
            'reasons': reasons, 'policy': policy_data, 'evidence': evidence}


def _lines_and_balances(request):
    lines = list(request.lines.select_related('product').order_by('product_id'))
    balances = {balance.product_id: balance for balance in InventoryBalance.objects.filter(product_id__in=[line.product_id for line in lines])}
    if not lines or any(line.product_id not in balances for line in lines):
        raise BusinessError('INVALID_STATE', 'Saldo produk belum tersedia. Periksa gudang.')
    return lines, balances


@atomic_write
def decide(actor, request_id, decision, note=''):
    require_role(actor, {'MANAGER'})
    request = get_object_or_404(sample_requests_for(actor), pk=request_id)
    if decision not in {SampleRequest.Status.APPROVED, SampleRequest.Status.REJECTED}:
        raise BusinessError('INVALID_INPUT', 'Keputusan tidak dikenal.')
    note = _text(note)
    if request.status == decision:
        return request
    if request.status != SampleRequest.Status.SUBMITTED:
        raise BusinessError('INVALID_STATE', 'Hanya pengajuan yang sedang ditinjau dapat diputuskan.')
    recommendation = recommend(request)
    suggested = {
        SampleRequest.Recommendation.APPROVE: SampleRequest.Status.APPROVED,
        SampleRequest.Recommendation.REJECT: SampleRequest.Status.REJECTED,
    }.get(recommendation['result'])
    if decision == SampleRequest.Status.REJECTED and not note:
        raise BusinessError('INVALID_INPUT', 'Alasan penolakan wajib diisi.')
    if recommendation['result'] == SampleRequest.Recommendation.REVIEW and not note:
        raise BusinessError('INVALID_INPUT', 'Jelaskan alasan keputusan saat rekomendasi memerlukan tinjauan manual.')
    if suggested and decision != suggested and not note:
        raise BusinessError('INVALID_INPUT', 'Jelaskan alasan keputusan yang berbeda dari rekomendasi.')

    if decision == SampleRequest.Status.APPROVED:
        lines, balances = _lines_and_balances(request)
        plans = {}
        for line in lines:
            balance = balances[line.product_id]
            if not line.product.is_active:
                raise BusinessError('INVALID_INPUT', f'{line.product.sku} tidak aktif.')
            if balance.available < line.quantity:
                raise BusinessError('INSUFFICIENT_STOCK', f'{line.product.sku}: tersedia {balance.available}, diminta {line.quantity}.')
            batches = eligible_batches(line.product, timezone.localdate())
            remaining, plan = line.quantity, []
            for batch in batches:
                take = min(batch.available, remaining)
                if take:
                    plan.append((batch, take))
                    remaining -= take
                if remaining <= 0:
                    break
            if remaining:
                eligible = sum(batch.available for batch in batches)
                raise BusinessError('INSUFFICIENT_STOCK', f'{line.product.sku}: stok batch layak {eligible}, kurang {remaining}.')
            plans[line.pk] = plan
        for line in lines:
            for batch, quantity in plans[line.pk]:
                batch.reserved += quantity
                batch.save(update_fields=['reserved'])
                SampleAllocation.objects.create(line=line, batch=batch, quantity=quantity)
            balance = balances[line.product_id]
            balance.reserved += line.quantity
            balance.save(update_fields=['reserved', 'updated_at'])

    request.status = decision
    request.fulfillment_status = (
        SampleRequest.FulfillmentStatus.WAITING
        if decision == SampleRequest.Status.APPROVED
        else SampleRequest.FulfillmentStatus.PENDING
    )
    request.decided_by = actor
    request.decided_at = timezone.now()
    request.decision_note = note
    request.recommendation_at_decision = recommendation['result']
    request.policy_snapshot = recommendation['policy']
    request.evidence_snapshot = {**recommendation['evidence'], 'reasons': recommendation['reasons']}
    request.save(update_fields=[
        'status', 'fulfillment_status', 'decided_by', 'decided_at', 'decision_note',
        'recommendation_at_decision', 'policy_snapshot', 'evidence_snapshot', 'updated_at',
    ])
    return request


def _release_allocations(request):
    lines, balances = _lines_and_balances(request)
    for line in lines:
        allocations = list(line.allocations.select_related('batch'))
        if sum(allocation.quantity for allocation in allocations) != line.quantity:
            raise BusinessError('INVALID_STATE', 'Alokasi sampel tidak sesuai. Periksa gudang.')
        for allocation in allocations:
            allocation.batch.reserved -= allocation.quantity
            allocation.batch.save(update_fields=['reserved'])
            allocation.delete()
        balance = balances[line.product_id]
        balance.reserved -= line.quantity
        balance.save(update_fields=['reserved', 'updated_at'])


@atomic_write
def cancel_request(actor, request_id, reason):
    require_role(actor, {'SALES', 'MANAGER'})
    request = get_object_or_404(sample_requests_for(actor), pk=request_id)
    reason = _text(reason)
    if not reason:
        raise BusinessError('INVALID_INPUT', 'Alasan pembatalan wajib diisi.')
    if request.status == SampleRequest.Status.CANCELLED:
        if request.cancel_reason != reason:
            raise BusinessError('IDEMPOTENCY_CONFLICT', 'Pengajuan sudah dibatalkan dengan alasan berbeda.')
        return request
    before_shipping = (
        request.status in {SampleRequest.Status.DRAFT, SampleRequest.Status.SUBMITTED}
        and request.fulfillment_status == SampleRequest.FulfillmentStatus.PENDING
    ) or (request.status == SampleRequest.Status.APPROVED
          and request.fulfillment_status == SampleRequest.FulfillmentStatus.WAITING)
    if not before_shipping:
        raise BusinessError('INVALID_STATE', 'Pengajuan tidak dapat dibatalkan pada tahap ini.')
    if request.status == SampleRequest.Status.APPROVED:
        _release_allocations(request)
    request.status = SampleRequest.Status.CANCELLED
    request.cancel_reason = reason
    request.cancelled_by = actor
    request.cancelled_at = timezone.now()
    request.save(update_fields=['status', 'cancel_reason', 'cancelled_by', 'cancelled_at', 'updated_at'])
    return request


@atomic_write
def ship_request(actor, request_id):
    require_role(actor, {'WAREHOUSE', 'MANAGER'})
    request = get_object_or_404(sample_requests_for(actor), pk=request_id)
    if request.fulfillment_status in {SampleRequest.FulfillmentStatus.SHIPPED, SampleRequest.FulfillmentStatus.RECEIVED}:
        return request
    if request.status != SampleRequest.Status.APPROVED or request.fulfillment_status != SampleRequest.FulfillmentStatus.WAITING:
        raise BusinessError('INVALID_STATE', 'Hanya sampel disetujui yang menunggu pengiriman dapat dikirim.')
    lines, balances = _lines_and_balances(request)
    today = timezone.localdate()
    checked = {}
    for line in lines:
        allocations = list(line.allocations.select_related('batch'))
        if sum(allocation.quantity for allocation in allocations) != line.quantity:
            raise BusinessError('INVALID_STATE', 'Alokasi sampel tidak sesuai. Periksa gudang.')
        for allocation in allocations:
            batch = allocation.batch
            if batch.status != StockBatch.Status.ACTIVE:
                raise BusinessError('INVALID_STATE', f'Batch {batch.code} sedang ditahan. Ganti alokasi sebelum mengirim.')
            if batch.on_hand < allocation.quantity:
                raise BusinessError('INSUFFICIENT_STOCK', f'Batch {batch.code}: fisik {batch.on_hand}, alokasi {allocation.quantity}.')
            if batch.expiry_date is not None and batch.expiry_date < today:
                raise BusinessError('EXPIRED_BATCH', f'Batch {batch.code} sudah kedaluwarsa.')
            minimum = line.product.min_shelf_life_days
            if minimum is not None and (batch.expiry_date is None or (batch.expiry_date - today).days < minimum):
                raise BusinessError('EXPIRED_BATCH', f'Batch {batch.code} tidak lagi memenuhi masa simpan minimum.')
        checked[line.pk] = allocations
    for line in lines:
        for allocation in checked[line.pk]:
            batch = allocation.batch
            batch.on_hand -= allocation.quantity
            batch.reserved -= allocation.quantity
            batch.save(update_fields=['on_hand', 'reserved'])
            allocation.delete()
            StockMovement.objects.create(
                product=line.product,
                batch=batch,
                delta=-allocation.quantity,
                input_quantity=allocation.quantity,
                kind=StockMovement.Kind.SAMPLE,
                source_ref=f'SAMPLE:{request.id}:{line.product_id}:{batch.id}',
                sample_request=request,
                actor=actor,
                reason=f'Pengeluaran sampel {request.number}',
            )
        balance = balances[line.product_id]
        balance.reserved -= line.quantity
        balance.save(update_fields=['reserved', 'updated_at'])
        sync_balance(line.product)
    request.fulfillment_status = SampleRequest.FulfillmentStatus.SHIPPED
    request.shipped_by = actor
    request.shipped_at = timezone.now()
    request.save(update_fields=['fulfillment_status', 'shipped_by', 'shipped_at', 'updated_at'])
    return request


@atomic_write
def mark_received(actor, request_id):
    require_role(actor, {'SALES', 'WAREHOUSE', 'MANAGER'})
    request = get_object_or_404(sample_requests_for(actor), pk=request_id)
    if request.fulfillment_status == SampleRequest.FulfillmentStatus.RECEIVED:
        return request
    if request.status != SampleRequest.Status.APPROVED or request.fulfillment_status != SampleRequest.FulfillmentStatus.SHIPPED:
        raise BusinessError('INVALID_STATE', 'Hanya sampel yang sudah dikirim dapat ditandai diterima.')
    request.fulfillment_status = SampleRequest.FulfillmentStatus.RECEIVED
    request.received_by = actor
    request.received_at = timezone.now()
    request.save(update_fields=['fulfillment_status', 'received_by', 'received_at', 'updated_at'])
    return request


@atomic_write
def schedule_followup(actor, request_id, followup_date, note=''):
    require_role(actor, {'SALES', 'MANAGER'})
    request = get_object_or_404(sample_requests_for(actor), pk=request_id)
    if request.fulfillment_status != SampleRequest.FulfillmentStatus.RECEIVED:
        raise BusinessError('INVALID_STATE', 'Tindak lanjut dijadwalkan setelah sampel diterima.')
    if not followup_date or followup_date < timezone.localdate():
        raise BusinessError('INVALID_INPUT', 'Tanggal tindak lanjut tidak boleh sebelum hari ini.')
    latest = request.customer.activities.order_by('-created_at', '-pk').first()
    activity = Activity.objects.create(
        customer=request.customer,
        sales=request.sales,
        kind=Activity.Kind.FOLLOWUP,
        stage=latest.stage if latest else Activity.Stage.NEW,
        followup_date=followup_date,
        note=_text(note) or f'Tindak lanjut sampel {request.number}.',
    )
    SampleFollowUp.objects.create(
        request=request,
        followup_date=followup_date,
        outcome=SampleRequest.Outcome.NOT_FOLLOWED_UP,
        actor=actor,
        activity=activity,
        note=_text(note),
    )
    return request


@atomic_write
def record_followup(actor, request_id, response, outcome, note='', order_id=None):
    require_role(actor, {'SALES', 'MANAGER'})
    request = get_object_or_404(sample_requests_for(actor), pk=request_id)
    if request.fulfillment_status != SampleRequest.FulfillmentStatus.RECEIVED:
        raise BusinessError('INVALID_STATE', 'Hasil tindak lanjut dicatat setelah sampel diterima.')
    if outcome not in {
        SampleRequest.Outcome.EVALUATING,
        SampleRequest.Outcome.NOT_INTERESTED,
        SampleRequest.Outcome.NO_RESPONSE,
        SampleRequest.Outcome.PURCHASED,
    }:
        raise BusinessError('INVALID_INPUT', 'Hasil evaluasi tidak dikenal.')
    response, note = _text(response), _text(note)
    order = None
    if outcome == SampleRequest.Outcome.PURCHASED:
        if not order_id:
            raise BusinessError('INVALID_INPUT', 'Tautkan pesanan untuk hasil membeli.')
        order = get_object_or_404(orders_for(actor), pk=order_id, customer=request.customer, status=Order.Status.SHIPPED)
    elif not response and not note:
        raise BusinessError('INVALID_INPUT', 'Catat tanggapan pelanggan atau hasil evaluasi.')
    followup = request.followups.filter(outcome=SampleRequest.Outcome.NOT_FOLLOWED_UP).select_related('activity').first()
    if followup is None:
        followup = SampleFollowUp(request=request, followup_date=timezone.localdate(), actor=actor)
    followup.response = response
    followup.outcome = outcome
    followup.note = note
    followup.actor = actor
    followup.save()
    if followup.activity_id and followup.activity.status == Activity.Status.PLANNED:
        activity = followup.activity
        activity.status = Activity.Status.DONE
        activity.result = response or note or 'Pelanggan membeli setelah menerima sampel.'
        activity.completed_at = timezone.now()
        activity.save(update_fields=['status', 'result', 'completed_at'])
    request.outcome = outcome
    request.order = order
    request.save(update_fields=['outcome', 'order', 'updated_at'])
    return request


@atomic_write
def save_policy(actor, repeat_threshold, review_period_days, evaluation_days):
    require_role(actor, {'MANAGER'})
    values = {
        'repeat_threshold': integer_input(repeat_threshold, 1),
        'review_period_days': integer_input(review_period_days, 1),
        'evaluation_days': integer_input(evaluation_days, 0),
        'updated_by': actor,
    }
    return SamplePolicy.objects.update_or_create(pk=1, defaults=values)[0]
