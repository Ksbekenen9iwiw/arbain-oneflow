"""Customer context built only from records already authorized by the selector."""
from crm.models import ActionDecision


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
