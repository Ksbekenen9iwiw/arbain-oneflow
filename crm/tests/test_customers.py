from django.test import TestCase
from django.utils import timezone

from crm import models
from crm.tests.factories import make_customer, make_product, make_user


class CustomerTests(TestCase):
    def setUp(self):
        self.assertTrue(hasattr(models, 'Customer'), 'Customer model not implemented')
        self.sales = make_user('sales', 'SALES')
        self.other = make_user('other', 'SALES')
        self.manager = make_user('manager', 'MANAGER')
        self.customer = make_customer(self.sales)
        self.other_customer = make_customer(self.other, 'CUS002')
        self.client.force_login(self.sales)

    def test_sales_cannot_read_other_customer(self):
        self.assertEqual(self.client.get(f'/customers/{self.other_customer.id}/').status_code, 404)
        response = self.client.get('/customers/')
        self.assertContains(response, self.customer.name)
        self.assertNotContains(response, self.other_customer.name)

    def test_negative_price_and_duplicate_sku_are_rejected(self):
        self.client.force_login(self.manager)
        payload = {'sku': 'MADU01', 'name': 'Madu', 'unit': 'botol', 'price_rupiah': -1, 'min_stock': 5, 'is_active': 'on'}
        self.assertEqual(self.client.post('/products/new/', payload).status_code, 400)
        self.assertEqual(models.Product.objects.count(), 0)
        make_product()
        payload['price_rupiah'] = 50000
        self.assertEqual(self.client.post('/products/new/', payload).status_code, 400)
        self.assertEqual(models.Product.objects.count(), 1)
        self.assertEqual(models.InventoryBalance.objects.count(), 1)

    def test_product_creation_has_zero_balance(self):
        self.client.force_login(self.manager)
        response = self.client.post('/products/new/', {'sku': 'NEW01', 'name': 'Herbal', 'unit': 'unit', 'price_rupiah': 12000, 'min_stock': 3, 'is_active': 'on'})
        self.assertEqual(response.status_code, 302)
        balance = models.InventoryBalance.objects.get(product__sku='NEW01')
        self.assertEqual((balance.on_hand, balance.reserved, balance.available), (0, 0, 0))

    def test_done_activity_requires_result(self):
        response = self.client.post(f'/customers/{self.customer.id}/activities/new/', {'kind': 'INTERACTION', 'stage': 'CONTACTED', 'status': 'DONE', 'note': 'Telepon', 'result': ''})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(models.Activity.objects.count(), 0)

    def test_done_interaction_with_next_date_creates_open_followup(self):
        from datetime import timedelta
        tomorrow = timezone.localdate() + timedelta(days=1)
        response = self.client.post(f'/customers/{self.customer.id}/activities/new/', {'kind': 'INTERACTION', 'stage': 'INTERESTED', 'status': 'DONE', 'result': 'Hubungi kembali besok', 'followup_date': tomorrow.isoformat()})
        self.assertEqual(response.status_code, 302)
        self.assertTrue(models.Activity.objects.filter(customer=self.customer, kind='FOLLOWUP', status='PLANNED', followup_date=tomorrow).exists())

    def test_customer_note_html_is_escaped(self):
        models.Activity.objects.create(customer=self.customer, sales=self.sales, kind='INTERACTION', stage='CONTACTED', status='DONE', result='Sudah dihubungi', note='<script>alert(1)</script>')
        response = self.client.get(f'/customers/{self.customer.id}/')
        self.assertContains(response, '&lt;script&gt;alert(1)&lt;/script&gt;')
        self.assertNotContains(response, '<script>alert(1)</script>')

    def test_sales_cannot_assign_customer_to_another_sales(self):
        response = self.client.post('/customers/new/', {'code': 'FORGED', 'name': 'Baru', 'owner': self.other.id, 'is_active': 'on'})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(models.Customer.objects.filter(code='FORGED').exists())

    def test_complete_activity_records_result_and_future_followup(self):
        activity = models.Activity.objects.create(customer=self.customer, sales=self.sales, kind='VISIT', scheduled_date=timezone.localdate(), status='PLANNED')
        response = self.client.post(f'/activities/{activity.id}/complete/', {'result': 'Tertarik membeli', 'stage': 'INTERESTED', 'followup_date': timezone.localdate().isoformat()})
        self.assertEqual(response.status_code, 302)
        activity.refresh_from_db()
        self.assertEqual((activity.status, activity.result), ('DONE', 'Tertarik membeli'))
        self.assertTrue(models.Activity.objects.filter(customer=self.customer, kind='FOLLOWUP', status='PLANNED', followup_date=timezone.localdate()).exists())

    def test_planned_visit_needs_date(self):
        response = self.client.post(f'/customers/{self.customer.id}/activities/new/', {'kind': 'VISIT', 'stage': 'NEW', 'status': 'PLANNED'})
        self.assertEqual(response.status_code, 400)

    def test_get_completion_does_not_mutate(self):
        activity = models.Activity.objects.create(customer=self.customer, sales=self.sales, kind='VISIT', scheduled_date=timezone.localdate())
        self.assertEqual(self.client.get(f'/activities/{activity.id}/complete/').status_code, 200)
        activity.refresh_from_db()
        self.assertEqual(activity.status, 'PLANNED')
