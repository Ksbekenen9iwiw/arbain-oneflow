"""Customer context built only from records already authorized by the selector."""
from crm.models import ActionDecision


def customer_next_actions(actor, customer, opened, patterns, orders, today):
    """Explain existing work; never create activities or promise availability."""
    from crm.access import sample_requests_for
    from crm.models import SampleRequest

    actions = []

    def add(key, title, reason, label, href, priority, due=None, urgency=None):
        actions.append(dict(key=key, title=title, reason=reason, label=label,
                            href=href, priority=priority, due=due, urgency=urgency))

    for activity in opened:
        due = activity.due
        ready = due and due <= today
        add(f'activity-{activity.pk}', activity.get_kind_display(),
            f'Jadwal {due:%d/%m/%Y} · {activity.sales.get_full_name() or activity.sales.username}.'
            if due else 'Aktivitas sudah tercatat, tetapi belum memiliki tanggal.',
            'Catat hasil' if ready else 'Buka aktivitas',
            f'/activities/{activity.pk}/complete/', 0 if ready else 5,
            due, 'OVERDUE' if due and due < today else 'DUE_TODAY' if due == today else None)

    if customer.is_active:
        samples = sample_requests_for(actor).filter(
            customer=customer, status=SampleRequest.Status.APPROVED,
            fulfillment_status=SampleRequest.FulfillmentStatus.RECEIVED,
            outcome__in=[SampleRequest.Outcome.NOT_FOLLOWED_UP, SampleRequest.Outcome.EVALUATING,
                         SampleRequest.Outcome.NO_RESPONSE],
        ).prefetch_related('followups__activity').order_by('received_at', 'pk')
        for sample in samples:
            # The scheduled activity is already shown above; do not ask sales to schedule twice.
            if any(f.activity and f.activity.status == 'PLANNED' for f in sample.followups.all()):
                continue
            add(f'sample-{sample.pk}', f'Evaluasi sampel {sample.number}',
                'Sampel telah diterima. Catat tanggapan pelanggan sebelum menentukan penawaran berikutnya.',
                'Tinjau sampel', f'/samples/{sample.pk}/', 1)
        for pattern in patterns:
            shortage = pattern['available_quantity'] < pattern['typical_quantity']
            reason = (f"Perkiraan {pattern['next_due']:%d/%m/%Y}, berdasarkan "
                      f"{pattern['purchase_date_count']} tanggal pembelian.")
            if shortage:
                reason += ' Stok bebas kurang dari acuan pembelian; konfirmasi kesiapan barang sebelum menjanjikan pengiriman.'
            else:
                reason += ' Konfirmasi kebutuhan pelanggan sebelum membuat pesanan.'
            if not pattern['consistent']:
                reason += ' Pola belum konsisten; tinjau perkiraannya.'
            add(f"reorder-{pattern['product_id']}", f"Hubungi untuk {pattern['product_name']}",
                reason, 'Jadwalkan tindak lanjut',
                f"/customers/{customer.pk}/activities/new/?intent=followup&source_product={pattern['product_id']}",
                2, pattern['next_due'], 'STOCK_LOW' if shortage else None)
        for order in orders:
            if order.status == 'DRAFT':
                add(f'order-{order.pk}', f'Tinjau draf OF-{order.pk:04d}',
                    'Draf belum mencadangkan stok. Konfirmasi kebutuhan dan jumlah bersama pelanggan.',
                    'Buka draf', f'/orders/{order.pk}/', 3)
    if not actions:
        add('plan', 'Tentukan kontak berikutnya',
            'Belum ada aktivitas terbuka. Catat kebutuhan pelanggan dan sepakati waktu untuk menghubungi kembali.'
            if customer.is_active else 'Pelanggan nonaktif. Riwayat tetap tersedia dan Anda dapat mencatat hasil komunikasi.',
            'Jadwalkan tindak lanjut' if customer.is_active else 'Catat interaksi',
            f'/customers/{customer.pk}/activities/new/?intent={"followup" if customer.is_active else "done"}', 6)
    actions.sort(key=lambda row: (row['priority'], row['due'] or today, row['key']))
    return actions


def customer_context(customer, activities, orders):
    by_id = {a.pk: a for a in activities}
    order_by_id = {o.pk: o for o in orders}
    linked_orders = {}
    for decision in ActionDecision.objects.filter(customer=customer, outcome='DONE', order_id__in=order_by_id).order_by('updated_at', 'pk'):
        if decision.key.startswith('FOLLOWUP:'):
            activity_id = decision.key.removeprefix('FOLLOWUP:')
            if activity_id.isdecimal() and int(activity_id) in by_id:
                linked_orders[int(activity_id)] = order_by_id[decision.order_id]
    completed = sorted((a for a in activities if a.status == 'DONE'), key=lambda a: (a.completed_at or a.created_at, a.pk), reverse=True)
    history = []
    for activity in completed:
        followups = [a for a in activities if a.followup_of_id == activity.pk]
        history.append({
            'id': f'activity-{activity.pk}', 'category': 'interactions',
            'at': activity.completed_at or activity.created_at,
            'time_label': 'Hasil disimpan' if activity.completed_at else 'Dicatat',
            'title': f'{activity.get_kind_display()} selesai', 'activity': activity,
            'followups': followups, 'related_order': linked_orders.get(activity.pk),
        })
    phases = [('created', 'Draft pesanan dicatat'), ('confirmed', 'Pesanan dikonfirmasi · stok direservasi'), ('shipped', 'Pesanan terkirim'), ('cancelled', 'Pesanan dibatalkan')]
    for order in orders:
        for phase, title in phases:
            at = getattr(order, phase + '_at')
            if at:
                actor = order.sales if phase == 'created' else getattr(order, phase + '_by')
                history.append({'id': f'order-{order.pk}-{phase}', 'category': 'orders', 'at': at,
                                'time_label': 'Dicatat' if phase == 'created' else 'Terjadi',
                                'title': title, 'order': order, 'phase': phase,
                                'actor': (actor.get_full_name() or actor.username) if actor else None})
    history.sort(key=lambda event: (event['at'], event['id']), reverse=True)
    latest = max(activities, key=lambda a: (a.completed_at or a.created_at, a.pk), default=None)
    return {
        'history': history,
        'latest_interaction': completed[0] if completed else None,
        'latest_order': max(orders, key=lambda o: (o.created_at, o.pk), default=None),
        'latest_stage': latest.get_stage_display() if latest else None,
        'pending_order_count': sum(o.status == 'CONFIRMED' for o in orders),
    }
