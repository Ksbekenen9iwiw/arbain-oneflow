from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from django.core.exceptions import PermissionDenied
from django.db import close_old_connections, connections
from django.http import Http404
from django.test import TestCase, TransactionTestCase

from crm import models
from crm.errors import BusinessError
from crm.services import orders
from crm.services.inventory import reconcile_stock
from crm.tests.factories import make_customer, make_order, make_product, make_user


class OrderTests(TestCase):
    def setUp(self):
        self.assertTrue(hasattr(orders, 'create_draft'), 'create_draft not implemented')
        self.sales = make_user('sales', 'SALES')
        self.other = make_user('other', 'SALES')
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.customer = make_customer(self.sales)
        self.other_customer = make_customer(self.other, 'CUS002')
        self.product = make_product(on_hand=10)
        self.order = make_order(self.sales, self.customer, self.product)

    def balance(self):
        self.product.balance.refresh_from_db()
        b = self.product.balance
        return b.on_hand, b.reserved, b.available

    def test_draft_does_not_reserve(self):
        self.assertEqual(self.balance(), (10, 0, 10))
        self.assertEqual(self.order.total_rupiah, 400000)

    def test_confirm_cancel_and_ship_balances(self):
        orders.confirm_order(self.sales, self.order.id)
        self.assertEqual(self.balance(), (10, 8, 2))
        orders.confirm_order(self.sales, self.order.id)
        self.assertEqual(self.balance(), (10, 8, 2))
        orders.cancel_order(self.sales, self.order.id, 'Pelanggan menunda')
        orders.cancel_order(self.sales, self.order.id, 'Pelanggan menunda')
        self.assertEqual(self.balance(), (10, 0, 10))
        new = make_order(self.sales, self.customer, self.product)
        orders.confirm_order(self.sales, new.id)
        shipped = orders.ship_order(self.warehouse, new.id)
        self.assertEqual(self.balance(), (2, 0, 2))
        self.assertEqual(shipped.shipped_by, self.warehouse)
        self.assertIsNotNone(shipped.shipped_at)
        with self.assertRaises(BusinessError) as caught:
            orders.cancel_order(self.sales, new.id, 'Tidak sah')
        self.assertEqual(caught.exception.code, 'INVALID_STATE')

    def test_cancel_requires_reason(self):
        orders.confirm_order(self.sales, self.order.id)
        with self.assertRaises(BusinessError) as caught:
            orders.cancel_order(self.sales, self.order.id, '  ')
        self.assertEqual(caught.exception.code, 'INVALID_INPUT')
        self.assertEqual(self.balance(), (10, 8, 2))

    def test_multi_sku_failure_rolls_back(self):
        other_product = make_product('HERBAL01', on_hand=1)
        multi = orders.create_draft(self.sales, self.customer.id, [{'product_id': self.product.id, 'quantity': 8}, {'product_id': other_product.id, 'quantity': 2}])
        with self.assertRaises(BusinessError):
            orders.confirm_order(self.sales, multi.id)
        self.assertEqual(self.balance(), (10, 0, 10))
        other_product.balance.refresh_from_db()
        self.assertEqual(other_product.balance.reserved, 0)
        multi.refresh_from_db()
        self.assertEqual(multi.status, 'DRAFT')

    def test_double_ship_has_one_movement(self):
        orders.confirm_order(self.sales, self.order.id)
        orders.ship_order(self.warehouse, self.order.id)
        orders.ship_order(self.warehouse, self.order.id)
        self.assertEqual(self.balance(), (2, 0, 2))
        self.assertEqual(models.StockMovement.objects.filter(source_ref=f'SHIP:{self.order.id}:{self.product.id}').count(), 1)

    def test_stale_page_rechecks_stock(self):
        stale = make_order(self.other, self.other_customer, self.product)
        orders.confirm_order(self.sales, self.order.id)
        with self.assertRaises(BusinessError) as caught:
            orders.confirm_order(self.other, stale.id)
        self.assertEqual(caught.exception.code, 'INSUFFICIENT_STOCK')
        self.assertEqual(self.balance(), (10, 8, 2))

    def test_physical_conflict_blocks_new_confirmation(self):
        orders.confirm_order(self.sales, self.order.id)
        reconcile_stock(self.warehouse, self.product.id, 5, 'Hitung kurang', uuid4())
        new = make_order(self.sales, self.customer, self.product, quantity=1)
        with self.assertRaises(BusinessError) as caught:
            orders.confirm_order(self.sales, new.id)
        self.assertEqual(caught.exception.code, 'PHYSICAL_CONFLICT')
        with self.assertRaises(BusinessError):
            orders.ship_order(self.warehouse, self.order.id)
        self.assertEqual(self.balance(), (5, 8, -3))
        self.assertEqual(models.StockMovement.objects.filter(kind='SHIPMENT').count(), 0)

    def test_sales_cannot_forge_price_or_customer(self):
        with self.assertRaises(Http404):
            orders.create_draft(self.sales, self.other_customer.id, [{'product_id': self.product.id, 'quantity': 1}])
        with self.assertRaises(BusinessError):
            orders.create_draft(self.sales, self.customer.id, [{'product_id': self.product.id, 'quantity': 1, 'unit_price_rupiah': 1}])
        with self.assertRaises(Http404):
            orders.confirm_order(self.other, self.order.id)
        self.assertEqual(self.balance(), (10, 0, 10))

    def test_invalid_lines_do_not_create_order(self):
        for lines in [[], None, ['invalid'], [{'quantity': 1}]]:
            with self.subTest(lines=lines):
                with self.assertRaises(BusinessError):
                    orders.create_draft(self.sales, self.customer.id, lines)
        self.assertEqual(models.Order.objects.count(), 1)

    def test_non_integer_quantities_and_duplicates_are_rejected(self):
        for quantity in [0, -1, 1.5, True, 2**64]:
            with self.subTest(quantity=quantity):
                with self.assertRaises(BusinessError):
                    orders.create_draft(self.sales, self.customer.id, [{'product_id': self.product.id, 'quantity': quantity}])
        with self.assertRaises(BusinessError):
            orders.create_draft(self.sales, self.customer.id, [{'product_id': self.product.id, 'quantity': 1}, {'product_id': self.product.id, 'quantity': 1}])
        self.assertEqual(models.Order.objects.count(), 1)

    def test_sales_cannot_ship_and_warehouse_cannot_read_draft_customer(self):
        with self.assertRaises(PermissionDenied):
            orders.ship_order(self.sales, self.order.id)
        self.client.force_login(self.warehouse)
        self.assertEqual(self.client.get(f'/orders/{self.order.id}/').status_code, 404)
        orders.confirm_order(self.sales, self.order.id)
        self.assertContains(self.client.get(f'/orders/{self.order.id}/'), self.customer.phone)
        self.assertEqual(self.client.get(f'/orders/{self.order.id}/ship/').status_code, 405)
        self.assertEqual(self.balance(), (10, 8, 2))

    def test_order_post_ignores_client_price(self):
        self.client.force_login(self.sales)
        self.assertContains(self.client.get('/orders/new/'), 'name="lines-0-product"')
        catalog = self.client.get('/orders/new/').context['catalog']
        self.assertEqual((catalog[0]['price'], catalog[0]['available']), ('50000', '10'))
        payload = {'customer': self.customer.id, 'lines-TOTAL_FORMS': 1, 'lines-INITIAL_FORMS': 0, 'lines-MIN_NUM_FORMS': 1, 'lines-MAX_NUM_FORMS': 50, 'lines-0-product': self.product.id, 'lines-0-quantity': 8, 'lines-0-unit_price_rupiah': 1, 'role': 'MANAGER', 'actor_id': self.other.id}
        response = self.client.post('/orders/new/', payload)
        self.assertEqual(response.status_code, 302)
        created = models.Order.objects.exclude(pk=self.order.id).get()
        self.assertEqual((created.sales_id, created.total_rupiah), (self.sales.id, 400000))
        self.assertEqual(created.lines.get().unit_price_rupiah, 50000)
        self.assertEqual(self.balance(), (10, 0, 10))
        payload['customer'] = self.other_customer.id
        self.assertEqual(self.client.post('/orders/new/', payload).status_code, 400)
        self.assertEqual(models.Order.objects.count(), 2)

    def test_stock_conflict_has_visible_warning(self):
        orders.confirm_order(self.sales, self.order.id)
        reconcile_stock(self.warehouse, self.product.id, 5, 'Hitung kurang', uuid4())
        self.client.force_login(self.warehouse)
        response = self.client.get('/stock/')
        self.assertContains(response, 'Konflik fisik')
        self.assertContains(response, 'Konfirmasi baru diblokir')
        self.assertEqual(self.balance(), (5, 8, -3))


class OrderConcurrencyTests(TransactionTestCase):
    def test_two_sales_cannot_reserve_sixteen_from_ten(self):
        self.assertTrue(hasattr(orders, 'confirm_order'), 'confirm_order not implemented')
        sales_a, sales_b = make_user('a', 'SALES'), make_user('b', 'SALES')
        product = make_product(on_hand=10)
        order_a = make_order(sales_a, make_customer(sales_a, 'A'), product)
        order_b = make_order(sales_b, make_customer(sales_b, 'B'), product)
        barrier = Barrier(2)

        def worker(actor, order_id):
            close_old_connections()
            try:
                barrier.wait(timeout=5)
                try:
                    return orders.confirm_order(actor, order_id).status
                except BusinessError as error:
                    return error.code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda args: worker(*args), [(sales_a, order_a.id), (sales_b, order_b.id)]))
        self.assertCountEqual(results, ['CONFIRMED', 'INSUFFICIENT_STOCK'])
        product.balance.refresh_from_db()
        self.assertEqual((product.balance.on_hand, product.balance.reserved), (10, 8))
        self.assertCountEqual(list(models.Order.objects.values_list('status', flat=True)), ['CONFIRMED', 'DRAFT'])
