from datetime import timedelta

from django.test import Client, TestCase
from django.utils import timezone

from crm import models
from crm.services.orders import confirm_order
from crm.tests.factories import make_customer, make_order, make_product, make_user


class ProductEditTests(TestCase):
    def setUp(self):
        self.manager = make_user('manager', 'MANAGER')
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.sales = make_user('sales', 'SALES')
        self.customer = make_customer(self.sales)
        self.product = make_product(on_hand=10)
        self.order = make_order(self.sales, self.customer, self.product, quantity=2)
        confirm_order(self.sales, self.order.id)
        self.url = f'/products/{self.product.id}/edit/'
        self.client.force_login(self.manager)

    def payload(self, **changes):
        data = {'name': 'Madu Premium', 'price_rupiah': '75000', 'min_stock': '4', 'is_active': 'on'}
        data.update(changes)
        return data

    def assert_stock_unchanged(self):
        self.product.balance.refresh_from_db()
        self.assertEqual((self.product.balance.on_hand, self.product.balance.reserved, self.product.balance.available), (10, 2, 8))
        self.assertEqual(models.StockMovement.objects.count(), 0)

    def test_edit_get_is_prefilled_without_mutation(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context['form'].initial['price_rupiah'], 50000)
        self.assertContains(response, 'name="price_rupiah"')
        self.assertContains(response, 'Rp 50.000')
        self.product.refresh_from_db()
        self.assertEqual(self.product.price_rupiah, 50000)
        self.assert_stock_unchanged()

    def test_manager_changes_catalog_price_but_existing_order_keeps_snapshot(self):
        self.assertRedirects(self.client.post(self.url, self.payload()), '/stock/')
        self.product.refresh_from_db()
        self.assertEqual((self.product.name, self.product.price_rupiah, self.product.min_stock), ('Madu Premium', 75000, 4))
        self.order.refresh_from_db()
        self.assertEqual((self.order.total_rupiah, self.order.lines.get().unit_price_rupiah), (100000, 50000))
        new = make_order(self.sales, self.customer, self.product, quantity=2)
        self.assertEqual((new.total_rupiah, new.lines.get().unit_price_rupiah), (150000, 75000))
        self.assert_stock_unchanged()

    def test_warehouse_can_edit_and_deactivate_a_product(self):
        self.client.force_login(self.warehouse)
        data = self.payload()
        data.pop('is_active')
        self.assertRedirects(self.client.post(self.url, data), '/stock/')
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_active)
        self.assertEqual(self.product.price_rupiah, 75000)
        self.assertTrue(models.OrderLine.objects.filter(order=self.order, product=self.product).exists())
        self.assert_stock_unchanged()

    def test_sales_cannot_forge_an_edit_role(self):
        self.client.force_login(self.sales)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        response = self.client.post(self.url, self.payload(role='MANAGER', actor_id=self.manager.id))
        self.assertEqual(response.status_code, 403)
        self.product.refresh_from_db()
        self.assertEqual(self.product.price_rupiah, 50000)
        self.assert_stock_unchanged()

    def test_invalid_prices_do_not_update_catalog(self):
        for value in ['-1', '2.5', '2.0', str(2**63), 'abc', '']:
            with self.subTest(price=value):
                response = self.client.post(self.url, self.payload(price_rupiah=value))
                self.assertEqual(response.status_code, 400)
                self.assertIn('price_rupiah', response.context['form'].errors)
                self.product.refresh_from_db()
                self.assertEqual(self.product.price_rupiah, 50000)
        self.assert_stock_unchanged()

    def test_blank_name_and_invalid_minimum_are_rejected(self):
        for changes, field in [({'name': '  '}, 'name'), ({'min_stock': '-1'}, 'min_stock'), ({'min_stock': '1.5'}, 'min_stock')]:
            with self.subTest(changes=changes):
                response = self.client.post(self.url, self.payload(**changes))
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.context['form'].errors)
                self.product.refresh_from_db()
                self.assertEqual(self.product.price_rupiah, 50000)

    def test_sku_and_unit_cannot_be_changed_by_a_forged_payload(self):
        self.assertRedirects(self.client.post(self.url, self.payload(sku='FORGED', unit='kg')), '/stock/')
        self.product.refresh_from_db()
        self.assertEqual((self.product.sku, self.product.unit), ('MADU01', 'botol'))
        self.assert_stock_unchanged()

    def test_invalid_post_preserves_original_price_for_comparison(self):
        response = self.client.post(self.url, self.payload(min_stock='-1'))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.context['original_price'], 50000)
        self.assertContains(response, 'Rp 50.000', status_code=400)
        self.assertEqual(response.context['form']['price_rupiah'].value(), '75000')
        self.product.refresh_from_db()
        self.assertEqual(self.product.price_rupiah, 50000)

    def test_edit_post_requires_csrf(self):
        protected = Client(enforce_csrf_checks=True)
        protected.force_login(self.manager)
        self.assertEqual(protected.post(self.url, self.payload()).status_code, 403)
        page = protected.get(self.url)
        self.assertEqual(page.status_code, 200)
        data = self.payload(csrfmiddlewaretoken=protected.cookies['csrftoken'].value)
        self.assertEqual(protected.post(self.url, data).status_code, 302)

    def test_unknown_product_returns_404(self):
        self.assertEqual(self.client.get('/products/999999/edit/').status_code, 404)

    def test_stock_has_edit_link_for_large_ids_only_for_editors(self):
        product = models.Product.objects.create(id=1000, sku='LARGE01', name='Produk Seribu', unit='botol', price_rupiah=80000, min_stock=1)
        models.InventoryBalance.objects.create(product=product)
        link = f'href="/products/{product.id}/edit/"'
        for actor in [self.manager, self.warehouse]:
            self.client.force_login(actor)
            self.assertContains(self.client.get('/stock/'), link)
        self.client.force_login(self.sales)
        self.assertNotContains(self.client.get('/stock/'), '/edit/')

    def test_stock_summary_uses_actual_balances_and_active_minimums(self):
        make_product('LOW01', on_hand=2)
        conflict = make_product('CONFLICT01', on_hand=2)
        conflict.balance.reserved = 3
        conflict.balance.save()
        inactive = make_product('INACTIVE01', on_hand=0)
        inactive.is_active = False
        inactive.save()
        response = self.client.get('/stock/')
        self.assertIn('stock_summary', response.context)
        self.assertEqual(response.context['stock_summary'], {'product_count': 4, 'low_stock_count': 2, 'conflict_count': 1})

    def test_empty_recommendations_do_not_claim_overdue_visits_are_complete(self):
        models.Activity.objects.create(customer=self.customer, sales=self.sales, kind='VISIT', scheduled_date=timezone.localdate() - timedelta(days=1))
        self.client.force_login(self.sales)
        response = self.client.get('/')
        self.assertEqual(response.context['metrics']['overdue_activity_count'], 1)
        self.assertEqual(response.context['actions'], [])
        self.assertNotContains(response, 'Semua prioritas sudah tertangani.')
