from datetime import timedelta
from urllib.parse import urlencode
from django.test import TestCase, override_settings
from django.utils import timezone
from crm.errors import BusinessError
from crm.models import Activity, SalesTarget
from crm.navigation import safe_return
from crm.services.actions import list_actions
from crm.services.orders import draft_version, update_draft, confirm_order, ship_order
from crm.tests.factories import make_user, make_customer, make_product, make_order


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class AuditFixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('audit-sales', 'SALES')
        cls.other = make_user('audit-other', 'SALES')
        cls.manager = make_user('audit-manager', 'MANAGER')
        cls.warehouse = make_user('audit-warehouse', 'WAREHOUSE')
        cls.customer = make_customer(cls.sales)
        cls.product = make_product(on_hand=20)

    def setUp(self):
        self.client.force_login(self.manager)
        self.headers = {'HTTP_X_ONEFLOW_PAGE': '1'}

    def test_inactive_low_stock_filter_matches_visible_condition_and_count(self):
        self.product.is_active = False
        self.product.save()
        self.product.balance.on_hand = 1
        self.product.balance.save()
        d = self.client.get('/stock/', {'filter':'low','status':'inactive'}, **self.headers).json()['data']
        self.assertEqual(d['condition_counts']['low'], '1')
        self.assertEqual([p['stock_state'] for p in d['products']], ['low'])
        self.assertEqual(self.client.get('/stock/', {'filter':'low','status':'active'}, **self.headers).json()['data']['products'], [])

    def test_dashboard_invalid_decision_keeps_modal_customer_values_and_safe_url(self):
        Activity.objects.create(customer=self.customer, sales=self.sales, kind='FOLLOWUP', followup_date=timezone.localdate())
        action = list_actions(self.manager, timezone.localdate())[0]
        back = '/?' + urlencode({'view':'recommendations','sales':self.sales.pk,'period':'7'})
        url = '/actions/decision/?' + urlencode({'return_to':back})
        response = self.client.post(url, {'key':action.key,'outcome':'DISMISSED','note':''}, **self.headers)
        self.assertEqual(response.status_code, 400)
        payload = response.json(); d = payload['data']
        self.assertEqual(payload['screen'], 'today')
        self.assertEqual(d['canonical_url'], back)
        self.assertEqual(d['action_dialog']['reasons']['customer_name'], self.customer.name)
        fields = {f['key']:f for f in d['action_form']['fields']}
        self.assertTrue(fields['note']['errors'])
        self.assertEqual(fields['outcome']['value'], 'DISMISSED')
        self.assertNotIn('INVALID_INPUT', str(d))
        success = self.client.post(url, {'key':action.key,'outcome':'DISMISSED','note':'Tidak diperlukan'})
        self.assertEqual(success.url, back)

    def test_snooze_invalid_date_is_field_error_without_losing_note(self):
        Activity.objects.create(customer=self.customer, sales=self.sales, kind='FOLLOWUP', followup_date=timezone.localdate())
        action = list_actions(self.manager, timezone.localdate())[0]
        response = self.client.post('/actions/decision/', {'key':action.key,'outcome':'SNOOZED','note':'Hubungi besok','next_date':timezone.localdate()}, **self.headers)
        fields = {f['key']:f for f in response.json()['data']['action_form']['fields']}
        self.assertTrue(fields['next_date']['errors'])
        self.assertEqual(fields['note']['value'], 'Hubungi besok')

    def test_target_prefill_and_invalid_modal_preserve_scope(self):
        month = timezone.localdate().replace(day=1)
        SalesTarget.objects.create(sales=self.sales, month=month, target_rupiah=123456)
        back = '/?' + urlencode({'sales':self.sales.pk,'targets':'shown'})
        d = self.client.get(back, **self.headers).json()['data']
        self.assertEqual(next(f['value'] for f in d['target_form']['fields'] if f['key']=='target_rupiah'), '123456')
        invalid = self.client.post('/targets/?' + urlencode({'return_to':back}), {'sales':self.sales.pk,'month':month.strftime('%Y-%m'),'target_rupiah':'-1'}, **self.headers).json()
        self.assertEqual(invalid['screen'], 'today')
        self.assertTrue(invalid['data']['target_dialog'])
        self.assertEqual(invalid['data']['canonical_url'], back)
        self.assertEqual(SalesTarget.objects.get(sales=self.sales).target_rupiah,123456)

    def test_cross_module_back_context_and_mutation_destinations_rejected(self):
        order = make_order(self.sales, self.customer, self.product, 1)
        back = f'/customers/{self.customer.pk}/?' + urlencode({'tab':'orders','return_to':'/customers/?q=CUS'})
        for path in [f'/orders/{order.pk}/', '/orders/new/']:
            d = self.client.get(path, {'return_to':back}, **self.headers).json()['data']
            self.assertEqual(d['back_url'], back)
        product_back = f'/orders/{order.pk}/?' + urlencode({'return_to':back})
        d = self.client.get(f'/products/{self.product.pk}/', {'return_to':product_back}, **self.headers).json()['data']
        self.assertEqual(d['back_url'],product_back)
        for url in ['/samples/', '/samples/12/']:
            self.assertEqual(safe_return(url, '/'), url)
        for url in ['//evil.test/', 'https://evil.test/', '/logout/', '/targets/', '/orders/new/', '/samples/new/', '/stock/1/receive/', '/orders/1/confirm/', '/stock/\n', '/stock/?return_to=https%3A%2F%2Fevil.test']:
            self.assertEqual(safe_return(url, '/'), '/')

    def test_activity_completion_returns_to_dashboard_context(self):
        activity = Activity.objects.create(customer=self.customer,sales=self.sales,kind='VISIT')
        back = '/?view=activities&schedule=late&period=7'
        response = self.client.post(f'/activities/{activity.pk}/complete/?'+urlencode({'return_to':back}), {'stage':'CONTACTED','result':'Selesai'})
        self.assertEqual(response.url,back)

    def test_edit_draft_preserves_old_prices_and_uses_current_new_product_price(self):
        order = make_order(self.sales,self.customer,self.product,2)
        version = draft_version(order)
        self.product.price_rupiah = 90000
        self.product.save()
        second = make_product('SECOND',on_hand=10,price_rupiah=75000)
        update_draft(self.manager,order.pk,self.customer.pk,[{'product_id':self.product.pk,'quantity':3},{'product_id':second.pk,'quantity':1}],version)
        order.refresh_from_db()
        self.assertEqual(order.total_rupiah,225000)
        self.assertEqual(order.lines.get(product=self.product).unit_price_rupiah,50000)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.reserved,0)
        confirm_order(self.sales,order.pk)
        ship_order(self.warehouse,order.pk)
        self.product.balance.refresh_from_db()
        self.assertEqual((self.product.balance.on_hand,self.product.balance.reserved),(17,0))

    def test_edit_draft_blocks_stale_edits_status_changes_and_foreign_roles(self):
        order = make_order(self.sales,self.customer,self.product,2)
        version = draft_version(order)
        update_draft(self.sales,order.pk,self.customer.pk,[{'product_id':self.product.pk,'quantity':3}],version)
        with self.assertRaises(BusinessError) as stale:
            update_draft(self.sales,order.pk,self.customer.pk,[{'product_id':self.product.pk,'quantity':4}],version)
        self.assertEqual(stale.exception.code,'STALE_DRAFT')
        for actor, status in [(self.other,404),(self.warehouse,403)]:
            self.client.force_login(actor)
            self.assertEqual(self.client.get(f'/orders/{order.pk}/edit/').status_code,status)
        confirm_order(self.sales,order.pk)
        with self.assertRaises(BusinessError):
            update_draft(self.sales,order.pk,self.customer.pk,[{'product_id':self.product.pk,'quantity':4}],draft_version(order))
        order.refresh_from_db()
        self.assertEqual(order.lines.get().quantity,3)

    def test_wizard_edit_submit_preserves_identity_and_return_context(self):
        order = make_order(self.sales,self.customer,self.product,2)
        back = f'/customers/{self.customer.pk}/?tab=orders'
        path = f'/orders/{order.pk}/edit/?'+urlencode({'return_to':back})
        d = self.client.get(path,**self.headers).json()['data']
        response = self.client.post(path,{'customer':self.customer.pk,'draft_version':d['draft_version'],'lines-TOTAL_FORMS':'1','lines-INITIAL_FORMS':'1','lines-0-product':self.product.pk,'lines-0-quantity':'3'},follow=True,**self.headers)
        self.assertEqual(response.json()['data']['order']['id'],str(order.pk))
        self.assertEqual(response.json()['data']['back_url'],back)
        self.assertEqual(order.lines.get().quantity,3)

    def test_confirmed_shortage_shows_exact_physical_and_reservation_counts(self):
        order = make_order(self.sales,self.customer,self.product,3)
        confirm_order(self.sales,order.pk)
        self.product.balance.refresh_from_db()
        self.product.balance.on_hand=1
        self.product.balance.save()
        d = self.client.get(f'/orders/{order.pk}/',**self.headers).json()['data']
        self.assertIn('dibutuhkan 3, fisik 1, reservasi 3',d['blockers'][0])
        self.assertEqual(d['order']['status_label'],'Menunggu pengiriman')
