from datetime import date

from django.test import TestCase
from django.utils import timezone

from crm import models, selectors
from crm.services.orders import cancel_order, confirm_order, ship_order
from crm.tests.factories import make_customer, make_order, make_product, make_shipped_order, make_user


class DashboardTests(TestCase):
    def setUp(self):
        self.assertTrue(hasattr(selectors, 'dashboard_metrics'), 'dashboard_metrics not implemented')
        self.sales = make_user('sales', 'SALES')
        self.other = make_user('other', 'SALES')
        self.manager = make_user('manager', 'MANAGER')
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.customer = make_customer(self.sales)
        self.product = make_product(on_hand=100)
        self.as_of = timezone.localdate()

    def test_only_shipped_orders_count(self):
        make_order(self.sales, self.customer, self.product)
        cancelled = make_order(self.sales, self.customer, self.product)
        cancel_order(self.sales, cancelled.id, 'Ditunda')
        confirmed = make_order(self.sales, self.customer, self.product)
        confirm_order(self.sales, confirmed.id)
        shipped = make_order(self.sales, self.customer, self.product)
        confirm_order(self.sales, shipped.id)
        ship_order(self.warehouse, shipped.id)
        metrics = selectors.dashboard_metrics(self.manager, self.as_of)
        self.assertEqual(metrics['shipped_value_rupiah'], 400000)
        self.assertEqual(metrics['shipped_order_count'], 1)
        self.assertEqual(metrics['pending_shipment_count'], 1)

    def test_zero_target_has_no_percentage(self):
        models.SalesTarget.objects.create(sales=self.sales, month=self.as_of.replace(day=1), target_rupiah=0)
        make_shipped_order(self.sales, self.customer, self.product, 8, self.as_of)
        metrics = selectors.dashboard_metrics(self.sales, self.as_of)
        self.assertIsNone(metrics['sales_rows'][0]['achievement_percent'])

    def test_sales_sees_own_results(self):
        other_customer = make_customer(self.other, 'OTHER')
        make_shipped_order(self.sales, self.customer, self.product, 8, self.as_of)
        make_shipped_order(self.other, other_customer, self.product, 16, self.as_of)
        metrics = selectors.dashboard_metrics(self.sales, self.as_of)
        self.assertEqual(metrics['shipped_value_rupiah'], 400000)
        self.assertEqual(len(metrics['sales_rows']), 1)
        self.assertEqual(metrics['sales_rows'][0]['sales_id'], self.sales.id)

    def test_manager_cannot_assign_target_to_warehouse(self):
        self.client.force_login(self.manager)
        response = self.client.post('/targets/', {'sales': self.warehouse.id, 'month': self.as_of.isoformat(), 'target_rupiah': 1000000})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(models.SalesTarget.objects.count(), 0)

    def test_month_boundary_uses_wib(self):
        for at in ['2026-09-30T16:59:00+00:00', '2026-09-30T17:30:00+00:00', '2026-10-31T17:30:00+00:00']:
            make_shipped_order(self.sales, self.customer, self.product, 8, at)
        metrics = selectors.dashboard_metrics(self.manager, date(2026, 10, 31))
        self.assertEqual(metrics['shipped_value_rupiah'], 400000)
        self.assertEqual(metrics['shipped_order_count'], 1)

    def test_target_post_normalizes_month_and_is_unique(self):
        self.client.force_login(self.manager)
        payload = {'sales': self.sales.id, 'month': '2026-10-17', 'target_rupiah': 1000000}
        self.assertEqual(self.client.post('/targets/', payload).status_code, 302)
        payload.update(month='2026-10', target_rupiah=2000000)
        self.assertEqual(self.client.post('/targets/', payload).status_code, 302)
        target = models.SalesTarget.objects.get(sales=self.sales)
        self.assertEqual((target.month, target.target_rupiah), (date(2026, 10, 1), 2000000))
        self.client.force_login(self.sales)
        self.assertEqual(self.client.post('/targets/', payload).status_code, 403)

    def test_warehouse_summary_does_not_include_crm_results(self):
        make_shipped_order(self.sales, self.customer, self.product, 8, self.as_of)
        metrics = selectors.dashboard_metrics(self.warehouse, self.as_of)
        self.assertEqual(metrics['sales_rows'], [])
        self.assertEqual(metrics['shipped_value_rupiah'], 0)
        self.assertEqual(metrics['done_activity_count'], 0)

    def test_daily_series_zero_fills_wib_and_preserves_exact_money(self):
        from datetime import timedelta
        self.product.price_rupiah = 9007199254740993
        self.product.save()
        make_shipped_order(self.sales, self.customer, self.product, 1, '2026-09-30T17:30:00+00:00')
        make_shipped_order(self.sales, self.customer, self.product, 1, '2026-10-02T17:30:00+00:00')
        make_order(self.sales, self.customer, self.product, 1)
        metrics = selectors.dashboard_metrics(self.sales, date(2026, 10, 2))
        series = {d['date']:d for d in metrics['shipment_days']}
        self.assertEqual(len(series), 30)
        self.assertEqual(series[date(2026, 10, 1)]['value_rupiah'], 9007199254740993)
        self.assertEqual(series[date(2026, 10, 2)]['value_rupiah'], 0)
        self.assertEqual(sum(d['order_count'] for d in series.values()), 1)
        self.assertNotIn(date(2026, 10, 3), series)

    def test_partial_and_zero_targets_never_invent_team_percentage(self):
        models.SalesTarget.objects.create(sales=self.sales, month=self.as_of.replace(day=1), target_rupiah=1000000)
        metrics = selectors.dashboard_metrics(self.manager, self.as_of)
        self.assertFalse(metrics['target_summary']['is_complete'])
        self.assertIsNone(metrics['target_summary']['achievement_percent'])
        other = next(r for r in metrics['sales_rows'] if r['sales_id'] == self.other.id)
        self.assertFalse(other['target_set'])
        models.SalesTarget.objects.create(sales=self.other, month=self.as_of.replace(day=1), target_rupiah=0)
        scoped = selectors.dashboard_metrics(self.manager, self.as_of, self.other.id)
        self.assertTrue(scoped['target_summary']['is_complete'])
        self.assertIsNone(scoped['target_summary']['achievement_percent'])
        self.assertTrue(scoped['sales_rows'][0]['target_set'])

    def test_manager_scope_covers_metrics_agenda_recommendations_and_pending(self):
        foreign = make_customer(self.other, 'FILTER-OTHER')
        for sales, customer in [(self.sales,self.customer),(self.other,foreign)]:
            models.Activity.objects.create(customer=customer,sales=sales,kind='FOLLOWUP',followup_date=self.as_of)
            make_shipped_order(sales,customer,self.product,8,self.as_of)
            order = make_order(sales,customer,self.product,1)
            confirm_order(sales,order.id)
        self.client.force_login(self.manager)
        data = self.client.get(f'/?sales={self.sales.id}',HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertEqual(data['metrics']['shipped_value_rupiah'],'400000')
        self.assertEqual(data['metrics']['pending_shipment_count'],'1')
        self.assertEqual(len(data['agenda']),1)
        self.assertEqual(data['agenda'][0]['customer']['id'],str(self.customer.id))
        self.assertEqual({a['customer_id'] for a in data['actions']},{str(self.customer.id)})
        self.assertEqual({o['sales']['id'] for o in data['pending_orders']},{str(self.sales.id)})
        self.assertEqual(sum(int(d['value_rupiah']) for d in data['metrics']['shipment_days']),400000)
        self.client.force_login(self.sales)
        self.assertEqual(self.client.get(f'/?sales={self.other.id}').status_code,403)
        self.client.force_login(self.warehouse)
        data = self.client.get('/',HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertNotIn('shipment_days',data['metrics'])
        self.assertNotIn('agenda',data)

    def test_overdue_metric_matches_authorized_queue_after_customer_transfer(self):
        from datetime import timedelta
        models.Activity.objects.create(customer=self.customer,sales=self.other,kind='VISIT',scheduled_date=self.as_of-timedelta(days=1))
        metrics = selectors.dashboard_metrics(self.sales,self.as_of)
        self.assertEqual(metrics['overdue_activity_count'],1)
        self.client.force_login(self.sales)
        data=self.client.get('/',HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertEqual(len(data['agenda']),1)

    def test_shipped_drilldown_matches_month_and_sales_wib(self):
        other_customer=make_customer(self.other,'DRILL-OTHER')
        make_shipped_order(self.sales,self.customer,self.product,8,'2026-09-30T16:30:00+00:00')
        wanted=make_shipped_order(self.sales,self.customer,self.product,8,'2026-09-30T17:30:00+00:00')
        make_shipped_order(self.other,other_customer,self.product,8,'2026-10-01')
        self.client.force_login(self.manager)
        data=self.client.get(f'/orders/?status=SHIPPED&sales={self.sales.id}&shipped_from=2026-10-01&shipped_to=2026-10-14',HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertEqual([o['id'] for o in data['orders']],[str(wanted.id)])
        self.assertEqual(data['shipped_from'],'2026-10-01')
        self.client.force_login(self.sales)
        self.assertEqual(self.client.get(f'/orders/?sales={self.other.id}').status_code,403)

    def test_historical_sales_and_invalid_filters(self):
        make_shipped_order(self.other,make_customer(self.other,'INACTIVE'),self.product,8,'2026-08-01')
        self.other.is_active=False
        self.other.save()
        metrics=selectors.dashboard_metrics(self.manager,date(2026,10,14),self.other.id)
        self.assertEqual(metrics['sales_rows'][0]['sales_id'],self.other.id)
        self.assertEqual(metrics['shipped_value_rupiah'],0)
        self.client.force_login(self.manager)
        for path in ['/?sales=nope','/?sales='+('9'*200),'/orders/?sales=nope']:
            self.assertEqual(self.client.get(path).status_code,404)
