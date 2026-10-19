from datetime import date, timedelta
from uuid import uuid4

from django.core.exceptions import PermissionDenied
from django.db.models import Sum
from django.test import TestCase

from crm.errors import BusinessError
from crm import models
from crm.services import inventory, orders
from crm.tests.factories import make_customer, make_order, make_product, make_user


class BatchTestsBase(TestCase):
    def setUp(self):
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.sales = make_user('sales', 'SALES')
        self.customer = make_customer(self.sales)
        self.product = make_product(on_hand=0)
        self.today = date.today()

    def receive(self, quantity, code, received=None, expiry=None):
        return inventory.receive_stock(self.warehouse, self.product.id, quantity, 'Penerimaan uji', uuid4(),
                                       batch_code=code, received_date=received, expiry_date=expiry)

    def assert_balance_matches_batches(self):
        self.product.balance.refresh_from_db()
        total = self.product.batches.aggregate(total=Sum('on_hand'))['total'] or 0
        self.assertEqual(self.product.balance.on_hand, total)


class ReceiptBatchTests(BatchTestsBase):
    def test_receipt_with_code_and_dates_creates_dated_batch(self):
        expiry = self.today + timedelta(days=90)
        movement = self.receive(10, 'LOT-A', self.today, expiry)
        batch = self.product.batches.get(code='LOT-A')
        self.assertEqual((batch.on_hand, batch.received_date, batch.expiry_date), (10, self.today, expiry))
        self.assertEqual(movement.batch, batch)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 10)
        self.assertEqual(batch.available, 10)
        self.assertTrue(batch.is_complete)

    def test_receipt_without_code_goes_to_legacy_batch(self):
        movement = self.receive(5, '')
        batch = self.product.batches.get(code=models.StockBatch.LEGACY_CODE)
        self.assertEqual(batch.on_hand, 5)
        self.assertIsNone(batch.expiry_date)
        self.assertEqual(movement.batch, batch)

    def test_dates_require_a_code(self):
        with self.assertRaises(BusinessError) as caught:
            inventory.receive_stock(self.warehouse, self.product.id, 5, 'Masuk', uuid4(), expiry_date=self.today + timedelta(days=30))
        self.assertEqual(caught.exception.code, 'INVALID_INPUT')

    def test_receipt_reuses_batch_and_fills_missing_dates(self):
        inventory.receive_stock(self.warehouse, self.product.id, 4, 'Masuk', uuid4(), batch_code='LOT-B')
        inventory.receive_stock(self.warehouse, self.product.id, 6, 'Masuk', uuid4(), batch_code='LOT-B', expiry_date=self.today + timedelta(days=20))
        batch = self.product.batches.get(code='LOT-B')
        self.assertEqual(batch.on_hand, 10)
        self.assertEqual(batch.expiry_date, self.today + timedelta(days=20))
        self.assertEqual(self.product.batches.count(), 1)


class FefoTests(BatchTestsBase):
    def test_confirm_allocates_earliest_expiry_first(self):
        self.receive(10, 'FRESH', self.today, self.today + timedelta(days=365))
        self.receive(10, 'AGING', self.today, self.today + timedelta(days=60))
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        orders.confirm_order(self.sales, order.id)
        aging = self.product.batches.get(code='AGING')
        fresh = self.product.batches.get(code='FRESH')
        self.assertEqual(aging.reserved, 8)
        self.assertEqual(fresh.reserved, 0)
        self.assert_balance_matches_batches()

    def test_confirm_splits_across_batches_fefo(self):
        self.receive(4, 'AGING', self.today, self.today + timedelta(days=60))
        self.receive(10, 'FRESH', self.today, self.today + timedelta(days=365))
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        orders.confirm_order(self.sales, order.id)
        aging = self.product.batches.get(code='AGING')
        fresh = self.product.batches.get(code='FRESH')
        self.assertEqual(aging.reserved, 4)
        self.assertEqual(fresh.reserved, 4)
        self.assertEqual(self.product.order_lines.get(order=order).allocations.count(), 2)

    def test_ship_consumes_allocated_batches(self):
        self.receive(4, 'AGING', self.today, self.today + timedelta(days=60))
        self.receive(10, 'FRESH', self.today, self.today + timedelta(days=365))
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        orders.confirm_order(self.sales, order.id)
        orders.ship_order(self.warehouse, order.id)
        aging = self.product.batches.get(code='AGING')
        fresh = self.product.batches.get(code='FRESH')
        self.assertEqual((aging.on_hand, aging.reserved), (0, 0))
        self.assertEqual((fresh.on_hand, fresh.reserved), (6, 0))
        self.product.balance.refresh_from_db()
        self.assertEqual((self.product.balance.on_hand, self.product.balance.reserved), (6, 0))
        self.assertEqual(models.StockMovement.objects.filter(kind='SHIPMENT').count(), 2)
        self.assert_balance_matches_batches()


class ShelfLifeTests(BatchTestsBase):
    def setUp(self):
        super().setUp()
        self.product.min_shelf_life_days = 30
        self.product.save(update_fields=['min_shelf_life_days'])

    def test_rejects_batch_below_minimum_shelf_life(self):
        self.receive(10, 'SOON', self.today, self.today + timedelta(days=10))
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        order.expected_receipt_date = self.today
        order.save(update_fields=['expected_receipt_date'])
        with self.assertRaises(BusinessError) as caught:
            orders.confirm_order(self.sales, order.id)
        self.assertEqual(caught.exception.code, 'INSUFFICIENT_STOCK')

    def test_accepts_batch_meeting_minimum_shelf_life(self):
        self.receive(10, 'OK', self.today, self.today + timedelta(days=40))
        self.receive(10, 'SOON', self.today, self.today + timedelta(days=10))
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        order.expected_receipt_date = self.today
        order.save(update_fields=['expected_receipt_date'])
        orders.confirm_order(self.sales, order.id)
        ok = self.product.batches.get(code='OK')
        soon = self.product.batches.get(code='SOON')
        self.assertEqual(ok.reserved, 8)
        self.assertEqual(soon.reserved, 0)

    def test_requires_receipt_date_when_policy_set(self):
        self.receive(10, 'LOT', self.today, self.today + timedelta(days=90))
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        with self.assertRaises(BusinessError) as caught:
            orders.confirm_order(self.sales, order.id)
        self.assertEqual(caught.exception.code, 'INVALID_INPUT')

    def test_legacy_batch_ineligible_when_policy_set(self):
        # Legacy stock has no expiry date, so it cannot satisfy the policy.
        inventory.receive_stock(self.warehouse, self.product.id, 10, 'Saldo lama', uuid4())
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        order.expected_receipt_date = self.today
        order.save(update_fields=['expected_receipt_date'])
        with self.assertRaises(BusinessError) as caught:
            orders.confirm_order(self.sales, order.id)
        self.assertEqual(caught.exception.code, 'INSUFFICIENT_STOCK')


class SwapTests(BatchTestsBase):
    def setUp(self):
        super().setUp()
        self.receive(10, 'AGING', self.today, self.today + timedelta(days=60))
        self.receive(10, 'FRESH', self.today, self.today + timedelta(days=365))
        self.order = make_order(self.sales, self.customer, self.product, quantity=8)
        orders.confirm_order(self.sales, self.order.id)

    def test_swap_moves_reservation(self):
        line = self.order.lines.get()
        aging = self.product.batches.get(code='AGING')
        fresh = self.product.batches.get(code='FRESH')
        self.assertEqual(aging.reserved, 8)
        orders.swap_batch(self.warehouse, self.order.id, line.id, aging.id, fresh.id, 8, 'Batch lama terlalu dekat kedaluwarsa')
        aging.refresh_from_db()
        fresh.refresh_from_db()
        self.assertEqual((aging.reserved, fresh.reserved), (0, 8))
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.reserved, 8)
        self.assertEqual(line.allocations.get().batch, fresh)

    def test_swap_partial_keeps_two_allocations(self):
        line = self.order.lines.get()
        aging = self.product.batches.get(code='AGING')
        fresh = self.product.batches.get(code='FRESH')
        orders.swap_batch(self.warehouse, self.order.id, line.id, aging.id, fresh.id, 3, 'Sebagian dipindahkan')
        aging.refresh_from_db()
        fresh.refresh_from_db()
        self.assertEqual((aging.reserved, fresh.reserved), (5, 3))
        self.assertEqual(line.allocations.count(), 2)

    def test_swap_rejects_overallocated_quantity(self):
        line = self.order.lines.get()
        aging = self.product.batches.get(code='AGING')
        fresh = self.product.batches.get(code='FRESH')
        with self.assertRaises(BusinessError) as caught:
            orders.swap_batch(self.warehouse, self.order.id, line.id, aging.id, fresh.id, 9, 'Terlalu banyak')
        self.assertEqual(caught.exception.code, 'INVALID_STATE')

    def test_swap_rejects_inactive_target(self):
        line = self.order.lines.get()
        aging = self.product.batches.get(code='AGING')
        fresh = self.product.batches.get(code='FRESH')
        fresh.status = models.StockBatch.Status.HELD
        fresh.save(update_fields=['status'])
        with self.assertRaises(BusinessError) as caught:
            orders.swap_batch(self.warehouse, self.order.id, line.id, aging.id, fresh.id, 8, 'Target ditahan')
        self.assertEqual(caught.exception.code, 'INVALID_INPUT')

    def test_swap_requires_consecutive_target(self):
        line = self.order.lines.get()
        aging = self.product.batches.get(code='AGING')
        fresh = self.product.batches.get(code='FRESH')
        with self.assertRaises(BusinessError) as caught:
            orders.swap_batch(self.warehouse, self.order.id, line.id, aging.id, aging.id, 1, 'Sama saja')
        self.assertEqual(caught.exception.code, 'INVALID_INPUT')


class LegacyFoldTests(BatchTestsBase):
    def test_balance_only_product_folds_into_legacy_batch(self):
        # Simulate a pre-batch product: balance exists, no batches yet.
        product = make_product('LEGACY01', on_hand=10)
        order = make_order(self.sales, self.customer, product, quantity=8)
        orders.confirm_order(self.sales, order.id)
        legacy = product.batches.get(code=models.StockBatch.LEGACY_CODE)
        self.assertEqual((legacy.on_hand, legacy.reserved), (10, 8))
        product.balance.refresh_from_db()
        self.assertEqual((product.balance.on_hand, product.balance.reserved, product.balance.available), (10, 8, 2))

    def test_reconcile_down_adjusts_legacy_batch(self):
        self.receive(10, 'LOT', self.today, self.today + timedelta(days=90))
        inventory.reconcile_stock(self.warehouse, self.product.id, 7, 'Hitung', uuid4())
        lot = self.product.batches.get(code='LOT')
        self.assertEqual(lot.on_hand, 7)
        self.assert_balance_matches_batches()


class BatchEligibilityTests(BatchTestsBase):
    def test_product_detail_payload_lists_batches_and_shelf_life(self):
        self.receive(10, 'LOT-A', self.today, self.today + timedelta(days=30))
        self.client.force_login(self.warehouse)
        payload = self.client.get(f'/products/{self.product.id}/', HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertIsNone(payload['shelf_life_days'])
        self.assertEqual([batch['code'] for batch in payload['batches']], ['LOT-A'])
        self.assertEqual(payload['batch_summary'], {'on_hand': '10', 'reserved': '0', 'available': '10', 'ineligible': '0'})
        self.assertEqual(payload['batches'][0]['days_left'] is not None, True)
        self.assertEqual((payload['batches'][0]['is_expired'], payload['batches'][0]['is_complete']), (False, True))

    def test_expired_batch_is_not_selected(self):
        self.receive(10, 'EXPIRED', self.today - timedelta(days=40), self.today - timedelta(days=1))
        self.receive(10, 'FRESH', self.today, self.today + timedelta(days=90))
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        orders.confirm_order(self.sales, order.id)
        self.assertEqual(self.product.batches.get(code='EXPIRED').reserved, 0)
        self.assertEqual(self.product.batches.get(code='FRESH').reserved, 8)

    def test_hold_batch_is_excluded_from_fefo(self):
        self.receive(10, 'AGING', self.today, self.today + timedelta(days=60))
        self.receive(10, 'FRESH', self.today, self.today + timedelta(days=365))
        aging = self.product.batches.get(code='AGING')
        inventory.set_batch_status(self.warehouse, self.product.id, aging.id, models.StockBatch.Status.HELD)
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        orders.confirm_order(self.sales, order.id)
        aging.refresh_from_db()
        self.assertEqual(aging.reserved, 0)
        self.assertEqual(self.product.batches.get(code='FRESH').reserved, 8)

    def test_sales_cannot_hold_batch(self):
        self.receive(5, 'LOT', self.today, self.today + timedelta(days=90))
        lot = self.product.batches.get(code='LOT')
        with self.assertRaises(PermissionDenied):
            inventory.set_batch_status(self.sales, self.product.id, lot.id, models.StockBatch.Status.HELD)
        lot.refresh_from_db()
        self.assertEqual(lot.status, models.StockBatch.Status.ACTIVE)

    def test_hold_and_release_batch_round_trip(self):
        self.receive(5, 'LOT', self.today, self.today + timedelta(days=90))
        lot = self.product.batches.get(code='LOT')
        inventory.set_batch_status(self.warehouse, self.product.id, lot.id, models.StockBatch.Status.HELD)
        lot.refresh_from_db()
        self.assertEqual(lot.status, models.StockBatch.Status.HELD)
        inventory.set_batch_status(self.warehouse, self.product.id, lot.id, models.StockBatch.Status.ACTIVE)
        lot.refresh_from_db()
        self.assertEqual(lot.status, models.StockBatch.Status.ACTIVE)

    def test_ship_rechecks_shelf_life(self):
        self.receive(10, 'LOT', self.today, self.today + timedelta(days=30))
        order = make_order(self.sales, self.customer, self.product, quantity=8)
        orders.confirm_order(self.sales, order.id, self.today)
        # The promised delivery date slips past the batch expiry after confirmation.
        models.Order.objects.filter(pk=order.id).update(expected_receipt_date=self.today + timedelta(days=60))
        with self.assertRaises(BusinessError) as caught:
            orders.ship_order(self.warehouse, order.id)
        self.assertEqual(caught.exception.code, 'EXPIRED_BATCH')
        self.assert_balance_matches_batches()
        order.refresh_from_db()
        self.assertEqual(order.status, 'CONFIRMED')