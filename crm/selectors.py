from django.shortcuts import get_object_or_404
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth.models import User
from django.db.models import F, Q
from django.utils import timezone
from crm.access import active_sales, customers_for, orders_for, role_of
from crm.models import Activity, Product, SalesTarget


def customer_history(actor, customer_id):
    customer = get_object_or_404(customers_for(actor), pk=customer_id)
    return {'customer': customer, 'activities': customer.activities.select_related('sales'), 'orders': orders_for(actor).filter(customer=customer).prefetch_related('lines__product')}


def dashboard_metrics(actor, as_of):
    role = role_of(actor)
    month = as_of.replace(day=1)
    order_scope = orders_for(actor)
    metrics = {'shipped_value_rupiah': 0, 'shipped_order_count': 0, 'planned_activity_count': 0, 'done_activity_count': 0, 'overdue_activity_count': 0, 'pending_shipment_count': order_scope.filter(status='CONFIRMED').count(), 'low_stock_count': Product.objects.filter(is_active=True, balance__on_hand__lt=F('balance__reserved') + F('min_stock')).count(), 'sales_rows': []}
    if role == 'WAREHOUSE':
        return metrics
    shipped_by_sales = defaultdict(int)
    for order in order_scope.filter(status='SHIPPED', shipped_at__isnull=False):
        shipped_date = timezone.localdate(order.shipped_at)
        if month <= shipped_date <= as_of:
            metrics['shipped_order_count'] += 1
            metrics['shipped_value_rupiah'] += order.total_rupiah
            shipped_by_sales[order.sales_id] += order.total_rupiah
    activities = Activity.objects.all()
    if role == 'SALES':
        activities = activities.filter(sales=actor)
    metrics['planned_activity_count'] = activities.filter(status='PLANNED').count()
    metrics['done_activity_count'] = activities.filter(status='DONE').count()
    metrics['overdue_activity_count'] = activities.filter(status='PLANNED').filter(Q(followup_date__lt=as_of) | Q(scheduled_date__lt=as_of)).count()
    users = User.objects.filter(pk=actor.id) if role == 'SALES' else User.objects.filter(Q(pk__in=active_sales()) | Q(pk__in=shipped_by_sales)).distinct().order_by('username')
    targets = {target.sales_id: target.target_rupiah for target in SalesTarget.objects.filter(month=month)}
    for sales in users:
        value, target = shipped_by_sales[sales.id], targets.get(sales.id, 0)
        achievement = float((Decimal(value) * 100 / Decimal(target)).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)) if target else None
        metrics['sales_rows'].append({'sales_id': sales.id, 'sales_name': sales.get_full_name() or sales.username, 'shipped_value_rupiah': value, 'target_rupiah': target, 'achievement_percent': achievement})
    return metrics
