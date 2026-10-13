from uuid import uuid4

from django.core.exceptions import PermissionDenied
from django.db.models import Sum
from django.test import TestCase

from crm.errors import BusinessError
from crm import models
from crm.services import inventory
from crm.tests.factories import make_product, make_user


class InventoryTests(TestCase):
    def setUp(self):
        self.assertTrue(hasattr(inventory, 'receive_stock'), 'receive_stock not implemented')
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.sales = make_user('sales', 'SALES')
        self.product = make_product(on_hand=10)

    def test_receive_updates_balance_and_ledger(self):
        movement = inventory.receive_stock(self.warehouse, self.product.id, 10, 'Barang masuk', uuid4())
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 20)
        self.assertEqual(movement.delta, 10)
        self.assertEqual(models.StockMovement.objects.count(), 1)
        self.assertEqual(movement.actor, self.warehouse)

    def test_sales_cannot_receive(self):
        with self.assertRaises(PermissionDenied):
            inventory.receive_stock(self.sales, self.product.id, 10, 'Tidak sah', uuid4())
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 10)

    def test_invalid_quantity_or_empty_reason_has_no_effect(self):
        for quantity, reason in [(0, 'Masuk'), (-1, 'Masuk'), (1.5, 'Masuk'), (True, 'Masuk'), (10, '   ')]:
            with self.subTest(quantity=quantity, reason=reason):
                with self.assertRaises(BusinessError) as caught:
                    inventory.receive_stock(self.warehouse, self.product.id, quantity, reason, uuid4())
                self.assertEqual(caught.exception.code, 'INVALID_INPUT')
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 10)
        self.assertEqual(models.StockMovement.objects.count(), 0)

    def test_same_operation_has_one_movement(self):
        operation = uuid4()
        one = inventory.receive_stock(self.warehouse, self.product.id, 10, 'Masuk', operation)
        two = inventory.receive_stock(self.warehouse, self.product.id, 10, 'Masuk', operation)
        self.assertEqual(one.id, two.id)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 20)
        with self.assertRaises(BusinessError) as caught:
            inventory.receive_stock(self.warehouse, self.product.id, 11, 'Masuk', operation)
        self.assertEqual(caught.exception.code, 'IDEMPOTENCY_CONFLICT')
        self.assertEqual(models.StockMovement.objects.count(), 1)

    def test_reconcile_below_reservation_records_conflict(self):
        balance = self.product.balance
        balance.reserved = 8
        balance.save()
        movement = inventory.reconcile_stock(self.warehouse, self.product.id, 5, 'Hitung fisik, selisih ditemukan', uuid4())
        balance.refresh_from_db()
        self.assertEqual((balance.on_hand, balance.reserved, balance.available), (5, 8, -3))
        self.assertEqual(movement.delta, -5)
        self.assertIn('selisih', movement.reason)

    def test_reconcile_retry_does_not_overwrite_later_receipt(self):
        operation = uuid4()
        original = inventory.reconcile_stock(self.warehouse, self.product.id, 5, 'Hitung', operation)
        inventory.receive_stock(self.warehouse, self.product.id, 7, 'Masuk', uuid4())
        retry = inventory.reconcile_stock(self.warehouse, self.product.id, 5, 'Hitung', operation)
        self.assertEqual(original.id, retry.id)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 12)
        with self.assertRaises(BusinessError):
            inventory.reconcile_stock(self.warehouse, self.product.id, 6, 'Hitung', operation)

    def test_zero_delta_adjustment_is_recorded(self):
        movement = inventory.reconcile_stock(self.warehouse, self.product.id, 10, 'Pemeriksaan sesuai', uuid4())
        self.assertEqual(movement.delta, 0)
        self.assertEqual(models.StockMovement.objects.count(), 1)

    def test_ledger_matches_stock_from_zero(self):
        product = make_product('ZERO01')
        inventory.receive_stock(self.warehouse, product.id, 10, 'Saldo awal', uuid4())
        inventory.reconcile_stock(self.warehouse, product.id, 7, 'Hitung', uuid4())
        product.balance.refresh_from_db()
        self.assertEqual(models.StockMovement.objects.filter(product=product).aggregate(total=Sum('delta'))['total'], product.balance.on_hand)

    def test_http_stock_mutations_require_post_and_role(self):
        self.client.force_login(self.sales)
        self.assertEqual(self.client.get(f'/stock/{self.product.id}/receive/').status_code, 403)
        self.assertNotContains(self.client.get('/stock/'), 'Barang masuk')
        self.client.force_login(self.warehouse)
        self.assertEqual(self.client.get(f'/stock/{self.product.id}/receive/').status_code, 200)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 10)
        self.assertEqual(models.StockMovement.objects.count(), 0)
