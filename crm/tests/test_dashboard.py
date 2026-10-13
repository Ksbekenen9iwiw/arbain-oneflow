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
