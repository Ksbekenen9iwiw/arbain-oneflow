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


class CustomerWorkspaceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('workspace-sales', 'SALES')
        cls.other = make_user('workspace-other', 'SALES')
        cls.manager = make_user('workspace-manager', 'MANAGER')
        cls.a = make_customer(cls.sales, 'ALPHA')
        cls.b = make_customer(cls.other, 'BETA')
        cls.c = make_customer(cls.other, 'GAMMA')
        cls.c.is_active = False
        cls.c.save()

    def setUp(self):
        self.client.force_login(self.manager)
        self.headers = {'HTTP_X_ONEFLOW_PAGE': '1'}

    def data(self, params=None):
        return self.client.get('/customers/', params or {}, **self.headers).json()['data']

    def test_search_preserves_owner_and_full_owner_choices_even_when_empty(self):
        result = self.data({'sales': self.other.pk, 'q': 'ALPHA'})
        self.assertEqual(result['customers'], [])
        self.assertEqual(result['selected_sales'], str(self.other.pk))
        self.assertEqual({s['value'] for s in result['sales_options']}, {str(self.sales.pk), str(self.other.pk)})
        result = self.data({'sales': self.other.pk, 'q': 'BETA', 'status': 'active'})
        self.assertEqual([c['id'] for c in result['customers']], [str(self.b.pk)])
        self.assertEqual(self.data({'status': 'inactive'})['customers'][0]['id'], str(self.c.pk))

    def test_sales_scope_and_invalid_owner(self):
        for owner in ('abc', '9' * 100, '999999999'):
            self.assertEqual(self.client.get('/customers/', {'sales': owner}).status_code, 404)
        self.client.force_login(self.sales)
        self.assertEqual(self.client.get('/customers/', {'sales': self.other.pk}).status_code, 403)
        self.assertEqual(self.data()['sales_options'], [])
        self.assertEqual([c['id'] for c in self.data()['customers']], [str(self.a.pk)])

    def test_activity_priority_counts_latest_stage_and_undated_sorting(self):
        from datetime import timedelta
        today = timezone.localdate()
        old = models.Activity.objects.create(customer=self.a, sales=self.sales, kind='VISIT', scheduled_date=today - timedelta(days=2))
        models.Activity.objects.create(customer=self.a, sales=self.sales, kind='FOLLOWUP', followup_date=today)
        models.Activity.objects.create(customer=self.a, sales=self.sales, kind='INTERACTION', status='DONE', stage='WON', result='Selesai')
        models.Activity.objects.create(customer=self.b, sales=self.other, kind='VISIT', scheduled_date=today + timedelta(days=1))
        models.Activity.objects.create(customer=self.c, sales=self.other, kind='INTERACTION')
        result = self.data({'view': 'overdue'})
        self.assertEqual(result['view_counts'], {'all': '3', 'overdue': '1', 'today': '1'})
        summary = result['customers'][0]['summary']
        self.assertEqual(summary['next_activity']['id'], str(old.pk))
        self.assertEqual(summary['latest_stage'], models.Activity.Stage.WON.label)
        self.assertEqual(summary['open_count'], '2')
        self.assertEqual([c['id'] for c in self.data({'view': 'today'})['customers']], [str(self.a.pk)])
        self.assertEqual([c['id'] for c in self.data({'sort': '-next_due'})['customers']], [str(self.b.pk), str(self.a.pk), str(self.c.pk)])
        detail = self.client.get(f'/customers/{self.c.pk}/', **self.headers).json()['data']
        self.assertIsNone(detail['open_activities'][0]['due'])
        detail = self.client.get(f'/customers/{self.a.pk}/', **self.headers).json()['data']
        self.assertEqual(detail['open_activities'][0]['id'], str(old.pk))
        self.assertEqual(len(detail['completed_activities']), 1)

    def test_return_context_survives_create_and_completion_without_external_redirects(self):
        from urllib.parse import urlencode
        back = f'/customers/?sales={self.other.pk}&q=BETA&sort=-name&view=overdue'
        query = '?' + urlencode({'return_to': back})
        detail = f'/customers/{self.b.pk}/' + query
        self.assertEqual(self.client.get(detail, **self.headers).json()['data']['back_url'], back)
        create = f'/customers/{self.b.pk}/activities/new/' + query
        response = self.client.post(create, {'kind': 'INTERACTION', 'stage': 'NEW', 'status': 'PLANNED'})
        self.assertEqual(response.url, detail)
        activity = models.Activity.objects.get(customer=self.b)
        response = self.client.post(f'/activities/{activity.pk}/complete/' + query, {'stage': 'CONTACTED', 'result': 'Dihubungi'})
        # Completion honors the originating list; create still returns to the profile.
        self.assertEqual(response.url, back)
        for invalid in ('https://example.com/customers/', '//example.com/customers/', '/orders/new/', '/customers/\\evil', '/customers/\n'):
            result = self.client.get(f'/customers/{self.b.pk}/', {'return_to': invalid}, **self.headers).json()['data']
            self.assertEqual(result['back_url'], '/customers/')

    def test_creation_preserves_filter_and_rejects_duplicate_customer(self):
        from urllib.parse import urlencode
        query = '?' + urlencode({'return_to': '/customers/?q=New'})
        payload = {'name': 'New', 'code': 'UNIQUE', 'owner': self.other.pk, 'is_active': 'on'}
        response = self.client.post('/customers/new/' + query, payload)
        customer = models.Customer.objects.get(code='UNIQUE')
        self.assertEqual(response.url, f'/customers/{customer.pk}/' + query)
        response = self.client.post('/customers/new/' + query, payload, **self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['data']['back_url'], '/customers/?q=New')
        self.assertTrue(next(f for f in response.json()['data']['form']['fields'] if f['key'] == 'code')['errors'])
