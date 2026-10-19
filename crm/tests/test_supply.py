from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.core.exceptions import PermissionDenied
from django.test import TestCase, override_settings
from django.utils import timezone

from crm.errors import BusinessError
from crm.models import PurchaseOrder, StockBatch, StockMovement
from crm.services.inventory import receive_stock, set_batch_status
from crm.services.orders import confirm_order, create_draft
from crm.services.samples import create_draft as create_sample, decide as decide_sample, ship_request as ship_sample, submit_request as submit_sample
from crm.services.supply import (
    RISK_CONFIG, RISK_LATE, RISK_OK, RISK_REORDER, RISK_REVIEW,
    cancel_purchase_order, create_purchase_order, forecast, receive_purchase_order,
    save_settings, supply_alerts,
)
from crm.tests.factories import make_customer, make_product, make_shipped_order, make_user


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class SupplyForecastTests(TestCase):
    def setUp(self):
        self.sales = make_user('sales', 'SALES')
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.manager = make_user('manager', 'MANAGER')
        self.customer = make_customer(self.sales)
        self.product = make_product(on_hand=0)
        self.today = timezone.localdate()

    def receive(self, quantity, **kwargs):
        kwargs.setdefault('expiry_date', self.today + timedelta(days=120))
        kwargs.setdefault('received_date', self.today)
        receive_stock(self.warehouse, self.product.id, quantity, 'Stok uji pasokan', uuid4(),
                      batch_code=kwargs.pop('batch_code', f'LOT-{uuid4().hex[:6]}'), **kwargs)

    def configure(self, period=30, lead=3, coverage=14, safety=2):
        save_settings(self.manager, self.product.id, period, lead, coverage, safety)

    def ship_on(self, quantity, days_ago):
        make_shipped_order(self.sales, self.customer, self.product, quantity, self.today - timedelta(days=days_ago))

    def test_spec_example_trigger_recommendation_and_arrival_stock(self):
        self.ship_on(600, 30)  # window [today-30, today-1]; first ship on the start day = complete window
        self.configure()
        self.receive(100)
        data = forecast(self.product, self.today)
        self.assertEqual(data['risk'], RISK_REORDER)
        self.assertEqual(data['velocity']['rate'], '20')
        self.assertEqual(data['trigger'], '100')
        self.assertEqual(data['recommend_quantity'], 280)
        self.assertEqual(data['arrival_stock'], 320)  # 100 - 20*3 + 280
        self.assertEqual(data['coverage_days'], '5.0')
        self.assertTrue(any('batas pengadaan' in reason for reason in data['reasons']))

    def test_analysis_period_changes_window_and_rate(self):
        self.ship_on(140, 30)
        self.ship_on(70, 5)
        self.configure(period=30)
        data = forecast(self.product, self.today)
        self.assertEqual(data['velocity']['rate'], '7')
        self.assertTrue(data['velocity']['complete'])
        self.configure(period=14)
        data = forecast(self.product, self.today)
        self.assertEqual(data['velocity']['rate'], '5')
        self.assertTrue(data['velocity']['complete'])  # oldest ship predates the 14-day window
        self.configure(period=7)
        data = forecast(self.product, self.today)
        self.assertEqual(data['velocity']['rate'], '10')
        self.assertTrue(data['velocity']['complete'])

    def test_zero_sales_days_stay_in_the_denominator(self):
        self.ship_on(60, 25)
        self.configure(period=30)
        self.receive(100)
        data = forecast(self.product, self.today)
        self.assertEqual(data['velocity']['rate'], '2')

    def test_incomplete_history_requires_review_not_operational_numbers(self):
        self.ship_on(60, 2)
        self.configure(period=30)
        self.receive(10)
        data = forecast(self.product, self.today)
        self.assertEqual(data['risk'], RISK_REVIEW)
        self.assertTrue(any('belum lengkap' in reason for reason in data['reasons']))

    def test_zero_sales_has_no_stockout_or_division(self):
        self.configure()
        self.receive(100)
        data = forecast(self.product, self.today)
        self.assertEqual(data['risk'], RISK_OK)
        self.assertIsNone(data['coverage_days'])
        self.assertIsNone(data['stockout_date'])
        self.assertIsNone(data['recommend_quantity'])
        self.assertTrue(any('rata-rata harian 0' in caveat for caveat in data['caveats']))

    def test_unconfigured_setting_never_fabricates_policy(self):
        self.receive(10)
        data = forecast(self.product, self.today)
        self.assertEqual(data['risk'], RISK_CONFIG)
        self.assertIn('Perlu konfigurasi', data['reasons'][0])

    def test_partial_setting_counts_as_unconfigured(self):
        PurchaseOrder.objects.all().delete()
        from crm.models import ProductSupplySetting
        ProductSupplySetting.objects.create(product=self.product, analysis_period_days=30, lead_time_days=3,
                                            coverage_target_days=14, safety_stock_days=None)
        data = forecast(self.product, self.today)
        self.assertEqual(data['risk'], RISK_CONFIG)
        self.assertIn('hari cadangan', data['reasons'][0])

    def test_lead_and_safety_days_raise_the_trigger(self):
        self.ship_on(600, 30)
        self.configure(lead=3, safety=0)
        self.receive(100)
        without_safety = forecast(self.product, self.today)
        self.assertEqual(without_safety['trigger'], '60')
        self.assertEqual(without_safety['recommend_quantity'], 240)
        self.assertFalse(any('batas pengadaan' in reason for reason in without_safety['reasons']))
        self.configure(lead=3, safety=2)
        with_safety = forecast(self.product, self.today)
        self.assertEqual(with_safety['trigger'], '100')
        self.assertEqual(with_safety['recommend_quantity'], 280)
        self.assertEqual(with_safety['risk'], RISK_REORDER)
        self.assertTrue(any('batas pengadaan' in reason for reason in with_safety['reasons']))

    def test_ontime_purchase_order_reduces_additional_need(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        create_purchase_order(self.manager, self.product.id, 280, self.today + timedelta(days=2), 'Pemasok A')
        data = forecast(self.product, self.today)
        self.assertEqual(data['outstanding_units'], 280)
        self.assertEqual(data['recommend_quantity'], 0)
        self.assertEqual(data['risk'], RISK_OK)
        self.assertIsNone(data['stockout_date'])

    def test_late_purchase_order_keeps_stockout_risk(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        create_purchase_order(self.manager, self.product.id, 280, self.today + timedelta(days=40), 'Pemasok telat')
        data = forecast(self.product, self.today)
        self.assertEqual(data['risk'], RISK_LATE)
        self.assertEqual(data['recommend_quantity'], 0)
        self.assertIsNotNone(data['stockout_date'])
        self.assertTrue(any('percepat' in reason for reason in data['reasons']))

    def test_undated_purchase_order_flagged_as_uncertainty(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        create_purchase_order(self.manager, self.product.id, 280, None)
        data = forecast(self.product, self.today)
        self.assertTrue(data['arrivals'][0]['late'])
        self.assertTrue(any('tanpa estimasi valid' in caveat for caveat in data['caveats']))

    def test_cancelled_purchase_order_excluded(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        order = create_purchase_order(self.manager, self.product.id, 280, self.today + timedelta(days=2))
        cancel_purchase_order(self.manager, order.pk, 'Pemasok membatalkan')
        data = forecast(self.product, self.today)
        self.assertEqual(data['outstanding_units'], 0)
        self.assertEqual(data['recommend_quantity'], 280)

    def test_partial_receipt_counts_remaining_once(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        order = create_purchase_order(self.manager, self.product.id, 300, self.today + timedelta(days=2))
        operation = uuid4()
        receive_purchase_order(self.warehouse, order.pk, 100, operation)
        order.refresh_from_db()
        self.product.balance.refresh_from_db()
        self.assertEqual((order.quantity_received, order.remaining), (100, 200))
        self.assertEqual(self.product.balance.on_hand, 200)
        receive_purchase_order(self.warehouse, order.pk, 100, operation)  # retry: no double receipt
        order.refresh_from_db()
        self.product.balance.refresh_from_db()
        self.assertEqual((order.quantity_received, self.product.balance.on_hand), (100, 200))
        data = forecast(self.product, self.today)
        # 200 received (now stock) + 200 remaining count once each: 400 >= target 380.
        self.assertEqual(data['outstanding_units'], 200)
        self.assertEqual(data['eligible'], 200)
        self.assertEqual(data['recommend_quantity'], 0)

    def test_receipt_over_remaining_and_full_then_extra_rejected(self):
        order = create_purchase_order(self.manager, self.product.id, 50, self.today + timedelta(days=1))
        with self.assertRaises(BusinessError):
            receive_purchase_order(self.warehouse, order.pk, 51, uuid4())
        receive_purchase_order(self.warehouse, order.pk, 50, uuid4())
        order.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrder.Status.RECEIVED)
        with self.assertRaises(BusinessError):
            receive_purchase_order(self.warehouse, order.pk, 1, uuid4())

    def test_confirmed_order_reservation_not_double_counted(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        draft = create_draft(self.sales, self.customer.id, [{'product_id': self.product.id, 'quantity': 20}])
        confirm_order(self.sales, draft.id, self.today)
        data = forecast(self.product, self.today)
        self.assertEqual(data['eligible'], 80)  # reservation already out; velocity untouched
        self.assertEqual(data['velocity']['rate'], '20')

    def test_sample_issuance_lowers_stock_but_is_not_sales(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        sample = create_sample(self.sales, self.customer.id, [{'product_id': self.product.id, 'quantity': 8}],
                               purpose='Uji', customer_need='Butuh', potential_orders='Potensi')
        submit_sample(self.sales, sample.id)
        decide_sample(self.manager, sample.id, 'APPROVED', 'Setuju untuk uji pasar')
        ship_sample(self.warehouse, sample.id)
        data = forecast(self.product, self.today)
        self.assertEqual(data['eligible'], 92)
        self.assertEqual(data['velocity']['units'], 600)
        self.assertEqual(StockMovement.objects.filter(kind=StockMovement.Kind.SAMPLE, product=self.product).count(), 1)

    def test_held_and_expired_batches_not_eligible(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(50, batch_code='LOT-EXPIRED', expiry_date=self.today - timedelta(days=1),
                      received_date=self.today - timedelta(days=90))
        self.receive(50, batch_code='LOT-HELD')
        held = StockBatch.objects.get(product=self.product, code='LOT-HELD')
        set_batch_status(self.warehouse, self.product.id, held.pk, StockBatch.Status.HELD)
        data = forecast(self.product, self.today)
        self.assertEqual(data['eligible'], 0)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 100)

    def test_forecast_and_alerts_never_mutate_stock(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        self.product.balance.refresh_from_db()
        before = (self.product.balance.on_hand, self.product.balance.reserved)
        forecast(self.product, self.today)
        supply_alerts(self.manager)
        create_purchase_order(self.manager, self.product.id, 280, self.today + timedelta(days=2))
        self.product.balance.refresh_from_db()
        self.assertEqual((self.product.balance.on_hand, self.product.balance.reserved), before)

    def test_alerts_derive_one_row_per_product_and_respect_role(self):
        self.ship_on(600, 30)
        self.configure()
        self.receive(100)
        first = supply_alerts(self.manager)
        second = supply_alerts(self.manager)
        self.assertEqual(len(first), 1)
        self.assertEqual([row['product']['id'] for row in first], [row['product']['id'] for row in second])
        self.assertEqual(first[0]['risk'], RISK_REORDER)
        self.assertEqual(supply_alerts(self.sales), [])

    def test_setting_validation(self):
        with self.assertRaises(BusinessError):
            save_settings(self.manager, self.product.id, 10, 3, 14, 2)  # period not in 7/14/30
        with self.assertRaises(BusinessError):
            save_settings(self.manager, self.product.id, 30, 3, 0, 2)  # coverage must be >= 1
        save_settings(self.manager, self.product.id, 30, 0, 1, 0)  # zeros allowed for lead/safety
        setting = self.product.supply_setting
        self.assertEqual((setting.lead_time_days, setting.safety_stock_days), (0, 0))
        with self.assertRaises(PermissionDenied):
            save_settings(self.warehouse, self.product.id, 30, 3, 14, 2)
        with self.assertRaises(PermissionDenied):
            create_purchase_order(self.warehouse, self.product.id, 10)
        with self.assertRaises(PermissionDenied):
            receive_purchase_order(self.sales, 1, 1, uuid4())

    def test_purchase_dates_and_cancellation_rules(self):
        with self.assertRaises(BusinessError):
            create_purchase_order(self.manager, self.product.id, 10, self.today - timedelta(days=1))
        order = create_purchase_order(self.manager, self.product.id, 10, self.today + timedelta(days=3))
        receive_purchase_order(self.warehouse, order.pk, 4, uuid4())
        with self.assertRaises(BusinessError):
            cancel_purchase_order(self.manager, order.pk, 'sudah sebagian')
        with self.assertRaises(BusinessError):
            cancel_purchase_order(self.manager, order.pk, '')


class SupplyViewTests(TestCase):
    def setUp(self):
        self.sales = make_user('sales', 'SALES')
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.manager = make_user('manager', 'MANAGER')
        self.customer = make_customer(self.sales)
        self.product = make_product(on_hand=0)
        receive_stock(self.warehouse, self.product.id, 100, 'Stok uji', uuid4(), batch_code='LOT-VIEW',
                      received_date=timezone.localdate(), expiry_date=timezone.localdate() + timedelta(days=120))

    def test_routes_enforce_roles_and_save_settings(self):
        self.client.force_login(self.sales)
        self.assertEqual(self.client.post(f'/products/{self.product.id}/supply/settings/', {}).status_code, 403)
        self.client.force_login(self.manager)
        response = self.client.post(f'/products/{self.product.id}/supply/settings/',
                                    {'analysis_period_days': '30', 'lead_time_days': '3',
                                     'coverage_target_days': '14', 'safety_stock_days': '2'})
        self.assertRedirects(response, f'/products/{self.product.id}/')
        self.assertEqual(self.product.supply_setting.analysis_period_days, 30)
        response = self.client.post(f'/products/{self.product.id}/supply/orders/',
                                    {'quantity': '280', 'expected_date': '', 'note': 'Simulasi'})
        self.assertRedirects(response, f'/products/{self.product.id}/')
        order = PurchaseOrder.objects.get()
        self.assertEqual((order.quantity_ordered, order.status), (280, PurchaseOrder.Status.CONFIRMED))
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 100)  # recording a PO does not move stock
        self.client.force_login(self.warehouse)
        response = self.client.post(f'/supply/orders/{order.pk}/receive/',
                                    {'quantity': '280', 'batch_code': 'LOT-PO1',
                                     'received_date': timezone.localdate().isoformat(),
                                     'expiry_date': (timezone.localdate() + timedelta(days=200)).isoformat(),
                                     'operation_id': str(uuid4())})
        self.assertRedirects(response, f'/products/{self.product.id}/')
        order.refresh_from_db()
        self.product.balance.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrder.Status.RECEIVED)
        self.assertEqual(self.product.balance.on_hand, 380)
