from datetime import timedelta
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from crm.forms import ActivityForm, OrderForm
from crm.frontend import form_data
from crm.models import Activity, Order, StockMovement
from crm.tests.factories import make_user, make_customer, make_product


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ReactPageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('react-sales', 'SALES')
        cls.other = make_user('react-other', 'SALES')
        cls.warehouse = make_user('react-warehouse', 'WAREHOUSE')
        cls.manager = make_user('react-manager', 'MANAGER')
        cls.customer = make_customer(cls.sales)
        cls.foreign = make_customer(cls.other, 'FOREIGN')
        cls.product = make_product(on_hand=20, price_rupiah=9007199254740993)

    def setUp(self):
        self.client.force_login(self.sales)
        self.headers = {'HTTP_X_ONEFLOW_PAGE': '1'}

    def page(self, path, **kwargs):
        return self.client.get(path, **self.headers, **kwargs)

    def test_first_paint_has_native_skeleton_and_recovery_before_react(self):
        for path in ['/', '/customers/', '/orders/', '/stock/', '/orders/new/']:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, 'id="oneflow-boot-status"')
                self.assertContains(response, 'astryx-skeleton')
                self.assertContains(response, 'id="oneflow-boot-error"')
                self.assertContains(response, '/static/crm/bootstrap.js')
                self.assertNotContains(response, '<p>Memuat OneFlow')
        self.client.logout()
        login = self.client.get('/login/')
        self.assertContains(login, 'astryx-skeleton')
        self.assertNotContains(login, 'Side navigation')

    def post(self, path, data):
        return self.client.post(path, data, follow=True, **self.headers)

    def test_scoped_contract_and_safe_integers(self):
        response = self.page('/customers/')
        self.assertEqual([r['id'] for r in response.json()['data']['customers']], [str(self.customer.pk)])
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertIn('X-OneFlow-Page', response['Vary'])
        product = self.page('/stock/').json()['data']['products'][0]
        self.assertEqual(product['price'], '9007199254740993')
        self.assertNotIn('on_hand', product)
        self.assertNotIn('reserved', product)
        self.assertNotIn('password', response.content.decode())

    def test_prefill_values_and_form_dates_are_scalar(self):
        response = self.page(f'/orders/new/?customer={self.customer.pk}&product={self.product.pk}&quantity=2')
        data = response.json()['data']
        self.assertEqual(data['form']['fields'][0]['value'], str(self.customer.pk))
        self.assertEqual(data['formset']['forms'][0]['fields'][0]['value'], str(self.product.pk))
        self.assertEqual(data['formset']['forms'][0]['fields'][1]['value'], '2')
        form = ActivityForm(actor=self.sales, initial={'scheduled_date': timezone.localdate()})
        field = next(f for f in form_data(form)['fields'] if f['key'] == 'scheduled_date')
        self.assertEqual(field['value'], timezone.localdate().isoformat())

    def test_invalid_order_keeps_fields_and_errors(self):
        response = self.post('/orders/new/', {'customer':self.customer.pk, 'lines-TOTAL_FORMS':'1', 'lines-INITIAL_FORMS':'0', 'lines-0-product':self.product.pk, 'lines-0-quantity':'-1'})
        self.assertEqual(response.status_code, 400)
        field = response.json()['data']['formset']['forms'][0]['fields'][1]
        self.assertEqual(field['value'], '-1')
        self.assertTrue(field['errors'])
        self.assertFalse(Order.objects.exists())

    def test_full_order_lifecycle_through_json_navigation(self):
        response = self.post('/orders/new/', {'customer':self.customer.pk, 'lines-TOTAL_FORMS':'1', 'lines-INITIAL_FORMS':'0', 'lines-0-product':self.product.pk, 'lines-0-quantity':'2','price':'1'})
        order = Order.objects.get()
        self.assertEqual(response.json()['screen'], 'order_detail')
        self.assertEqual(response.json()['data']['order']['total'], '18014398509481986')
        self.assertTrue(response.json()['messages'])
        self.assertEqual(self.post(f'/orders/{order.pk}/confirm/', {}).json()['data']['order']['status'], 'CONFIRMED')
        self.client.force_login(self.warehouse)
        self.assertEqual(self.post(f'/orders/{order.pk}/ship/', {}).json()['data']['order']['status'], 'SHIPPED')
        self.product.balance.refresh_from_db()
        self.assertEqual((self.product.balance.on_hand,self.product.balance.reserved),(18,0))
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_role_denials_and_foreign_records_are_json(self):
        self.assertEqual(self.page(f'/customers/{self.foreign.pk}/').status_code,404)
        self.assertEqual(self.page('/products/new/').json()['screen'],'http_error')
        self.client.force_login(self.warehouse)
        response=self.page('/customers/')
        self.assertEqual(response.status_code,403)
        self.assertEqual(response.json()['screen'],'http_error')

    def test_login_logout_redirects_and_safe_next(self):
        self.client.logout()
        response=self.page('/orders/',follow=True)
        self.assertEqual(response.json()['screen'],'login')
        response=self.post('/login/',{'username':'react-sales','password':'wrong'})
        self.assertEqual(response.status_code,400)
        self.assertTrue(response.json()['data']['form']['errors'])
        self.assertEqual(next(f for f in response.json()['data']['form']['fields'] if f['key']=='password')['value'],'')
        response=self.post('/login/',{'username':'react-sales','password':'test-password-123','next':'https://example.com/'})
        self.assertEqual(response.json()['screen'],'today')
        self.assertEqual(self.post('/logout/',{}).json()['screen'],'login')

    def test_csrf_still_required_for_json_posts(self):
        client=Client(enforce_csrf_checks=True)
        client.force_login(self.sales)
        response=client.post('/orders/new/',{},**self.headers)
        self.assertEqual(response.status_code,403)
        self.assertEqual(response.json()['screen'],'http_error')
        self.assertFalse(Order.objects.exists())

    def test_invalid_business_role_does_not_crash_error_page(self):
        self.sales.groups.clear()
        response=self.page('/')
        self.assertEqual(response.status_code,403)
        self.assertEqual(response.json()['screen'],'http_error')

    def test_bootstrap_escapes_untrusted_text(self):
        self.customer.name='</script><script>alert(1)</script>'
        self.customer.save()
        response=self.client.get('/customers/')
        self.assertContains(response, 'id="oneflow-page"')
        self.assertContains(response, '\\u003C/script\\u003E')
        self.assertNotContains(response,'<script>alert(1)</script>')

    def test_customer_and_activity_forms_round_trip(self):
        from crm.models import Customer
        response=self.post('/customers/new/',{'code':'REACT-CUSTOMER','name':'Pelanggan React','owner':self.sales.pk,'is_active':'on'})
        customer=Customer.objects.get(code='REACT-CUSTOMER')
        self.assertEqual(response.json()['screen'],'customer_detail')
        tomorrow=timezone.localdate()+timedelta(days=1)
        response=self.post(f'/customers/{customer.pk}/activities/new/',{'kind':'VISIT','stage':'INTERESTED','scheduled_date':tomorrow.isoformat(),'status':'PLANNED','note':'Kunjungan QA'})
        activity=customer.activities.get()
        self.assertEqual(response.json()['data']['activities'][0]['scheduled_date'],tomorrow.isoformat())
        response=self.post(f'/activities/{activity.pk}/complete/',{'result':'Pelanggan tertarik','stage':'WON','followup_date':tomorrow.isoformat()})
        self.assertEqual(response.status_code,200)
        self.assertEqual(customer.activities.filter(status='DONE').count(),1)
        self.assertEqual(customer.activities.filter(kind='FOLLOWUP',status='PLANNED').count(),1)

    def test_product_receipt_count_and_target_forms_round_trip(self):
        from crm.models import Product, SalesTarget
        self.client.force_login(self.manager)
        response=self.post('/products/new/',{'sku':'REACT-PRODUCT','name':'Produk React','unit':'unit','price_rupiah':'45000','min_stock':'2','is_active':'on'})
        self.assertEqual(response.json()['screen'],'stock')
        product=Product.objects.get(sku='REACT-PRODUCT')
        response=self.post(f'/products/{product.pk}/edit/',{'name':'Produk React baru','price_rupiah':'46000','min_stock':'3','is_active':'on'})
        self.assertEqual(response.status_code,200)
        receipt=self.page(f'/stock/{product.pk}/receive/').json()['data']['form']
        operation=next(f['value'] for f in receipt['fields'] if f['key']=='operation_id')
        for _ in range(2):
            self.assertEqual(self.post(f'/stock/{product.pk}/receive/',{'quantity':'8','reason':'Penerimaan QA','operation_id':operation}).status_code,200)
        self.assertEqual(StockMovement.objects.filter(product=product).count(),1)
        count=self.page(f'/stock/{product.pk}/reconcile/').json()['data']['form']
        operation=next(f['value'] for f in count['fields'] if f['key']=='operation_id')
        self.assertEqual(self.post(f'/stock/{product.pk}/reconcile/',{'counted_quantity':'7','reason':'Hitung QA','operation_id':operation}).status_code,200)
        product.balance.refresh_from_db()
        self.assertEqual(product.balance.on_hand,7)
        self.assertEqual(self.post('/targets/',{'sales':self.sales.pk,'month':'2026-10','target_rupiah':'1000000'}).json()['screen'],'today')
        self.assertEqual(SalesTarget.objects.get().target_rupiah,1000000)

    def test_recommendation_decision_and_cancel_round_trip(self):
        activity=Activity.objects.create(customer=self.customer,sales=self.sales,kind='FOLLOWUP',followup_date=timezone.localdate(),note='QA')
        action=self.page('/').json()['data']['actions'][0]
        self.assertEqual(self.post('/actions/decision/',{'key':action['key'],'outcome':'DONE','note':'Sudah dihubungi'}).json()['screen'],'today')
        activity.refresh_from_db()
        self.assertEqual(activity.status,'DONE')
        response=self.post('/orders/new/',{'customer':self.customer.pk,'lines-TOTAL_FORMS':'1','lines-INITIAL_FORMS':'0','lines-0-product':self.product.pk,'lines-0-quantity':'1'})
        order_id=response.json()['data']['order']['id']
        self.post(f'/orders/{order_id}/confirm/',{})
        response=self.post(f'/orders/{order_id}/cancel/',{'reason':'Pembatalan QA'})
        self.assertEqual(response.json()['data']['order']['status'],'CANCELLED')
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.reserved,0)

    def test_unknown_url_is_a_react_error_even_in_debug(self):
        with override_settings(DEBUG=True):
            response=self.page('/not-a-real-screen/')
        self.assertEqual(response.status_code,404)
        self.assertEqual(response.json()['screen'],'http_error')

    def test_manifest_includes_shared_css_and_modules_once(self):
        import json
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from crm.frontend import assets
        with TemporaryDirectory() as directory:
            root=Path(directory)
            manifest=root/'crm/static/crm/react/.vite/manifest.json'
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps({
                'frontend/main.tsx': {'file':'entry.js','css':['theme.css'],'imports':['core','shared']},
                'core': {'file':'core.js','css':['core.css'],'imports':['shared']},
                'shared': {'file':'shared.js','css':['shared.css']},
            }))
            with override_settings(BASE_DIR=root):
                result=assets()
        self.assertEqual(result['css'],['/static/crm/react/shared.css','/static/crm/react/core.css','/static/crm/react/theme.css'])
        self.assertEqual(result['preload'],['/static/crm/react/shared.js','/static/crm/react/core.js'])

    def test_canonical_route_redirect_is_preserved(self):
        response=self.page('/orders',follow=True)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['screen'],'orders')
        self.assertEqual(response.redirect_chain,[('/orders/',301)])

    def test_activity_completion_context_survives_validation_and_is_scoped(self):
        activity = Activity.objects.create(customer=self.customer, sales=self.sales, kind='VISIT',
            scheduled_date=timezone.localdate(), note='Bawa katalog baru')
        url = f'/activities/{activity.pk}/complete/'
        data = self.page(url).json()['data']
        self.assertEqual(data['activity']['note'], 'Bawa katalog baru')
        self.assertEqual(data['customer']['id'], str(self.customer.pk))
        self.assertEqual(data['activity']['scheduled_date'], timezone.localdate().isoformat())
        response = self.post(url, {'result': '', 'stage': 'WON'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['data']['activity']['id'], str(activity.pk))
        self.assertTrue(next(f for f in response.json()['data']['form']['fields'] if f['key'] == 'result')['errors'])
        self.client.force_login(self.other)
        response = self.page(url)
        self.assertEqual(response.status_code, 404)
        self.assertNotIn('Bawa katalog baru', response.content.decode())

    def test_activity_create_context_is_the_authorized_customer(self):
        data = self.page(f'/customers/{self.customer.pk}/activities/new/').json()['data']
        self.assertEqual(data['customer']['id'], str(self.customer.pk))
        self.assertEqual(self.page(f'/customers/{self.foreign.pk}/activities/new/').status_code, 404)


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class LoginUsernameStepTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.user = make_user('login-step-sales', 'SALES')

    def test_lookup_only_accepts_active_existing_accounts_without_logging_in(self):
        for username in ('', 'missing-account', 'x' * 151):
            response = self.client.post('/login/', {'step': 'username', 'username': username})
            self.assertEqual(response.status_code, 400)
        response = self.client.post('/login/', {'step': 'username', 'username': ' login-step-sales '})
        self.assertEqual(response.json(), {'username': 'login-step-sales'})
        self.assertIn('no-store', response['Cache-Control'])
        self.assertNotIn('_auth_user_id', self.client.session)
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.client.post('/login/', {'step': 'username', 'username': self.user.username}).status_code, 400)

    def test_lookup_requires_csrf_and_is_rate_limited(self):
        strict = Client(enforce_csrf_checks=True)
        data = {'step': 'username', 'username': self.user.username}
        self.assertEqual(strict.post('/login/', data).status_code, 403)
        for _ in range(20):
            self.assertEqual(self.client.post('/login/', data).status_code, 200)
        response = self.client.post('/login/', data)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response['Retry-After'], '60')

    def test_password_still_required_and_safe_next_preserved(self):
        self.client.post('/login/', {'step': 'username', 'username': self.user.username})
        response = self.client.post('/login/', {'username': self.user.username, 'password': 'wrong'}, HTTP_X_ONEFLOW_PAGE='1')
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('_auth_user_id', self.client.session)
        response = self.client.post('/login/', {'username': self.user.username, 'password': 'test-password-123', 'next': '/stock/'})
        self.assertRedirects(response, '/stock/')
