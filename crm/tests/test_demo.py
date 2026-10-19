import hashlib
import json
from datetime import date
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.db.models import Sum
from django.test import TestCase

from crm.management.commands import evaluate_actions, seed_demo
from crm.models import Activity, Customer, InventoryBalance, Order, Product, SamplePolicy, SampleRequest, StockMovement
from crm.errors import BusinessError
from crm.selectors import dashboard_metrics
from crm.services.actions import list_actions
from crm.services.inventory import receive_stock
from crm.services.orders import confirm_order, create_draft, ship_order
from crm.services.samples import recommend
from crm.services.supply import forecast
from crm.tests.factories import make_customer, make_user


class DemoTests(TestCase):
    def setUp(self):
        self.assertTrue(hasattr(seed_demo, 'Command'), 'seed_demo not implemented')

    def seed(self):
        output = StringIO()
        call_command('seed_demo', as_of='2026-10-11', stdout=output)
        return output.getvalue()

    def test_seed_counts_and_balances(self):
        output = self.seed()
        self.assertEqual(Customer.objects.count(), 12)
        self.assertEqual(Product.objects.count(), 8)
        self.assertEqual(User.objects.filter(groups__name='SALES').count(), 2)
        self.assertEqual(User.objects.filter(groups__name='WAREHOUSE').count(), 1)
        self.assertEqual(User.objects.filter(groups__name='MANAGER').count(), 1)
        balance = InventoryBalance.objects.get(product__sku='MADU01')
        self.assertEqual((balance.on_hand, balance.reserved, balance.available), (10, 0, 10))
        self.assertNotIn('password=', output)
        for balance in InventoryBalance.objects.all():
            delta = StockMovement.objects.filter(product=balance.product).aggregate(total=Sum('delta'))['total'] or 0
            self.assertEqual(delta, balance.on_hand)
            reserved = sum(line.quantity for order in Order.objects.filter(status='CONFIRMED') for line in order.lines.filter(product=balance.product))
            self.assertEqual(reserved, balance.reserved)

    def test_seed_refuses_existing_business_data(self):
        user = make_user('existing', 'SALES')
        existing = make_customer(user)
        with self.assertRaises(CommandError):
            self.seed()
        self.assertEqual(Customer.objects.count(), 1)
        self.assertTrue(Customer.objects.filter(pk=existing.pk).exists())
        self.assertEqual(User.objects.count(), 1)

    def test_full_demo_sequence(self):
        self.seed()
        sales_a = User.objects.get(username='nadia')
        sales_b = User.objects.get(username='rafi')
        warehouse = User.objects.get(username='gudang')
        manager = User.objects.get(username='manajer')
        customer_a = Customer.objects.get(code='CUS001')
        customer_b = Customer.objects.get(code='CUS007')
        product = Product.objects.get(sku='MADU01')
        as_of = date(2026, 10, 11)
        before = dashboard_metrics(manager, as_of)['shipped_value_rupiah']

        def balance():
            product.balance.refresh_from_db()
            b = product.balance
            return b.on_hand, b.reserved, b.available

        self.assertEqual(balance(), (10, 0, 10))
        a = create_draft(sales_a, customer_a.id, [{'product_id': product.id, 'quantity': 8}])
        b = create_draft(sales_b, customer_b.id, [{'product_id': product.id, 'quantity': 8}])
        confirm_order(sales_a, a.id)
        self.assertEqual(balance(), (10, 8, 2))
        with self.assertRaises(BusinessError) as caught:
            confirm_order(sales_b, b.id)
        self.assertEqual(caught.exception.code, 'INSUFFICIENT_STOCK')
        self.assertEqual(balance(), (10, 8, 2))
        candidate = next(c for c in list_actions(sales_b, as_of, limit=None) if c.customer_id == customer_b.id)
        self.assertEqual(candidate.state, 'WAITING_STOCK')
        shipped = ship_order(warehouse, a.id)
        # The seed date is fixed; emulate the same demo date for this fixture.
        from django.utils import timezone
        from datetime import datetime, time
        Order.objects.filter(pk=shipped.id).update(shipped_at=timezone.make_aware(datetime.combine(as_of, time(12))))
        self.assertEqual(balance(), (2, 0, 2))
        receive_stock(warehouse, product.id, 10, 'Barang masuk demo', uuid4())
        self.assertEqual(balance(), (12, 0, 12))
        candidate = next(c for c in list_actions(sales_b, as_of, limit=None) if c.customer_id == customer_b.id)
        self.assertEqual(candidate.state, 'READY')
        self.assertEqual(dashboard_metrics(manager, as_of)['shipped_value_rupiah'] - before, 400000)
        self.assertTrue(customer_a.orders.filter(pk=a.id, status='SHIPPED').exists())
        self.assertEqual(StockMovement.objects.filter(source_ref=f'SHIP:{a.id}:{product.id}').count(), 1)

    def test_fefo_demo_scenario_splits_by_earliest_expiry(self):
        call_command('seed_demo', as_of='2026-10-11', fefo_demo=True, stdout=StringIO())
        product = Product.objects.get(sku='HERBAL03')
        product.balance.refresh_from_db()
        self.assertEqual(product.min_shelf_life_days, 14)
        self.assertEqual((product.balance.on_hand, product.balance.reserved, product.balance.available), (70, 25, 45))
        order = Order.objects.get(status='CONFIRMED', lines__product=product)
        line = order.lines.get(product=product)
        self.assertEqual({a.batch.code: a.quantity for a in line.allocations.all()}, {'DEMO-A': 20, 'DEMO-B': 5})
        ship_order(User.objects.get(username='gudang'), order.id)
        product.balance.refresh_from_db()
        self.assertEqual((product.balance.on_hand, product.balance.reserved, product.balance.available), (45, 0, 45))
        self.assertEqual({batch.code: batch.on_hand for batch in product.batches.all()},
                         {'BELUM-LENGKAP': 0, 'DEMO-A': 0, 'DEMO-B': 45})

    def test_samples_demo_has_three_explainable_scenarios(self):
        output = StringIO()
        call_command('seed_demo', as_of='2026-10-11', samples_demo=True, stdout=output)
        policy = SamplePolicy.objects.get(pk=1)
        self.assertEqual((policy.repeat_threshold, policy.review_period_days, policy.evaluation_days), (2, 180, 14))
        self.assertEqual(SampleRequest.objects.count(), 5)
        self.assertEqual(SampleRequest.objects.filter(fulfillment_status='RECEIVED').count(), 3)
        self.assertEqual(SampleRequest.objects.filter(order__isnull=False, outcome='PURCHASED').count(), 1)
        pending = SampleRequest.objects.filter(status='SUBMITTED', customer__code='CUS003').get()
        self.assertEqual(recommend(pending, date(2026, 10, 11))['result'], SampleRequest.Recommendation.REJECT)
        product = Product.objects.get(sku='COSM03')
        product.balance.refresh_from_db()
        self.assertEqual((product.balance.on_hand, product.balance.reserved), (17, 0))
        self.assertEqual(StockMovement.objects.filter(product=product, kind='SAMPLE').count(), 3)
        self.assertIn('Skenario sampel simulasi', output.getvalue())

    def test_supply_demo_has_three_explainable_risk_states(self):
        output = StringIO()
        call_command('seed_demo', as_of='2026-10-11', supply_demo=True, stdout=output)
        as_of = date(2026, 10, 11)
        madu = forecast(Product.objects.get(sku='MADU01'), as_of)
        self.assertEqual((madu['risk'], madu['velocity']['rate'], madu['eligible'], madu['recommend_quantity']),
                         ('PERLU_PENGADAAN', '5', 76, 19))
        herbal = forecast(Product.objects.get(sku='HERBAL01'), as_of)
        self.assertEqual(herbal['risk'], 'RISIKO_KOSONG_TERLAMBAT')
        self.assertEqual(herbal['recommend_quantity'], 0)
        cosm = forecast(Product.objects.get(sku='COSM03'), as_of)
        self.assertEqual(cosm['risk'], 'PERLU_DITINJAU')
        self.assertIn('Skenario pasokan simulasi', output.getvalue())

    def test_evaluation_reports_actual_case_results(self):
        self.assertTrue(hasattr(evaluate_actions, 'Command'), 'evaluate_actions not implemented')
        self.seed()
        database = Path(connection.settings_dict['NAME'])
        before = hashlib.sha256(database.read_bytes()).hexdigest()
        with TemporaryDirectory() as directory:
            output = Path(directory) / 'evaluation.json'
            call_command('evaluate_actions', output=str(output), stdout=StringIO(), stderr=StringIO())
            report = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(report['case_count'], 20)
        self.assertEqual(len(report['cases']), 20)
        self.assertEqual(report['passed_cases'], sum(c['matches_expected'] for c in report['cases']))
        self.assertEqual(report['passed_cases'], 20)
        self.assertIn('sensitivity', report, 'Evaluator must report the spec\'s urgency-only sensitivity run')
        self.assertEqual(report['sensitivity']['weights'], [1.0, 0.0])
        self.assertEqual(len(report['sensitivity']['cases']), 20)
        c08 = next(c for c in report['sensitivity']['cases'] if c['id'] == 'C08')
        self.assertEqual(c08['urgency_only'][0]['priority'], 14)
        for method in ['baseline_a', 'baseline_b', 'oneflow']:
            actual = sum(c['methods'][method]['invalid_offers'] for c in report['cases'])
            self.assertEqual(report['methods'][method]['invalid_offers'], actual)
        self.assertEqual(report['methods']['oneflow']['invalid_offers'], 0)
        self.assertEqual(Customer.objects.count(), 12)
        self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(), before)
