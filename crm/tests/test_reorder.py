from datetime import date, timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from crm.models import Customer, Product, PurchaseOrder
from crm.selectors import customer_history
from crm.services.actions import compute_candidates, list_actions
from crm.services.supply import create_purchase_order
from crm.tests.factories import make_customer, make_product, make_shipped_order, make_user


class ReorderReminderTests(TestCase):
    def setUp(self):
        self.sales = make_user('sales', 'SALES')
        self.manager = make_user('manager', 'MANAGER')
        self.customer = make_customer(self.sales)
        self.product = make_product(on_hand=100)
        self.as_of = date(2026, 10, 11)
        for days in (42, 28, 14):
            make_shipped_order(self.sales, self.customer, self.product, 24, self.as_of - timedelta(days=days))

    def test_estimate_lands_on_evaluation_day(self):
        (candidate,) = compute_candidates(self.sales, self.as_of)
        self.assertEqual(candidate.kind, 'REORDER')
        self.assertEqual(candidate.due_date, self.as_of)
        self.assertEqual(candidate.reasons['intervals_days'], [14, 14])
        self.assertEqual(candidate.reasons['interval_days'], 14)
        self.assertEqual(candidate.reasons['typical_quantity'], 24)

    def test_two_dates_produce_no_estimate(self):
        other = make_customer(self.sales, 'CUS002')
        make_shipped_order(self.sales, other, self.product, 24, self.as_of - timedelta(days=28))
        make_shipped_order(self.sales, other, self.product, 24, self.as_of - timedelta(days=14))
        self.assertFalse([c for c in compute_candidates(self.sales, self.as_of) if c.customer_id == other.id])

    def test_same_day_purchases_count_once_and_pairs_are_separate(self):
        make_shipped_order(self.sales, self.customer, self.product, 5, self.as_of - timedelta(days=28))
        other_product = make_product(sku='OTHER01', on_hand=100)
        make_shipped_order(self.sales, self.customer, other_product, 3, self.as_of - timedelta(days=40))
        (candidate,) = [c for c in compute_candidates(self.sales, self.as_of) if c.product_id == self.product.id]
        self.assertEqual(candidate.reasons['purchase_date_count'], 3)
        self.assertFalse([c for c in compute_candidates(self.sales, self.as_of) if c.product_id == other_product.id])

    def test_empty_stock_keeps_reminder_with_inbound_info(self):
        self.product.balance.on_hand = 0
        self.product.balance.save()
        po = create_purchase_order(self.manager, self.product.id, 50, self.as_of + timedelta(days=10), 'Simulasi')
        (candidate,) = compute_candidates(self.sales, self.as_of)
        self.assertEqual(candidate.state, 'WAITING_STOCK')
        self.assertEqual(candidate.reasons['inbound'], [{'number': po.number, 'remaining': 50, 'expected_date': (self.as_of + timedelta(days=10)).isoformat()}])

    def test_recompute_does_not_duplicate_and_snooze_defers(self):
        first = compute_candidates(self.sales, self.as_of)
        second = compute_candidates(self.sales, self.as_of)
        self.assertEqual([c.key for c in first], [c.key for c in second])
        key = first[0].key
        from crm.services.actions import record_action
        record_action(self.sales, key, 'SNOOZED', 'Pelanggan minta dihubungi lagi', next_date=self.as_of + timedelta(days=5), as_of=self.as_of)
        self.assertFalse([a for a in list_actions(self.sales, self.as_of, limit=None) if a.key == key])
        self.assertTrue([a for a in list_actions(self.sales, self.as_of + timedelta(days=5), limit=None) if a.key == key])

    def test_new_purchase_refreshes_cycle(self):
        (old,) = compute_candidates(self.sales, self.as_of)
        make_shipped_order(self.sales, self.customer, self.product, 24, self.as_of)
        (new,) = compute_candidates(self.sales, self.as_of + timedelta(days=14))
        self.assertNotEqual(old.key, new.key)
        self.assertEqual(new.due_date, self.as_of + timedelta(days=14))

    def test_customer_history_exposes_pattern_and_thin(self):
        context = customer_history(self.sales, self.customer.id)
        self.assertEqual(len(context['reorder_patterns']), 1)
        pattern = context['reorder_patterns'][0]
        self.assertEqual(pattern['product_sku'], self.product.sku)
        self.assertEqual(pattern['intervals_days'], [14, 14])
        thin_product = make_product(sku='THIN01', on_hand=100)
        thin_customer = make_customer(self.sales, 'CUS003')
        make_shipped_order(self.sales, thin_customer, thin_product, 2, self.as_of - timedelta(days=10))
        thin_context = customer_history(self.sales, thin_customer.id)
        self.assertEqual(thin_context['reorder_patterns'], [])
        self.assertEqual(len(thin_context['thin_history']), 1)

    def test_scope_follows_customer_owner(self):
        other_sales = make_user('other', 'SALES')
        self.assertEqual(compute_candidates(other_sales, self.as_of), [])

    def test_reorder_demo_seed(self):
        pass


class ReorderDemoSeedTests(TestCase):
    def test_reorder_demo_seed(self):
        call_command('seed_demo', as_of='2026-10-11', reorder_demo=True, stdout=StringIO())
        sales = Customer.objects.get(code='CUS010').owner
        candidates = [c for c in compute_candidates(sales, date(2026, 10, 11))
                      if c.kind == 'REORDER' and c.customer_id == Customer.objects.get(code='CUS010').id]
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].due_date, date(2026, 10, 11))
        self.assertEqual(len(candidates[0].reasons['inbound']), 1)
        self.assertTrue(PurchaseOrder.objects.filter(product__sku='COSM02', status='CONFIRMED').exists())
        self.assertTrue(Product.objects.filter(sku='COSM02').exists())
