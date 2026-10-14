from datetime import datetime, timezone as tz
from urllib.parse import urlencode
from uuid import uuid4
from django.test import TestCase, override_settings
from crm.models import Product, StockMovement
from crm.services.inventory import receive_stock
from crm.services.orders import confirm_order
from crm.tests.factories import make_user, make_product, make_customer, make_order


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class StockWorkspaceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.manager = make_user('stock-manager', 'MANAGER')
        cls.sales = make_user('stock-sales', 'SALES')
        cls.warehouse = make_user('stock-warehouse', 'WAREHOUSE')
        cls.full = make_product('A', on_hand=20, price_rupiah=9007199254740993)
        cls.low = make_product('B', on_hand=1, price_rupiah=9007199254740992)
        cls.empty = make_product('C')
        cls.empty.min_stock = 0
        cls.empty.save()
        cls.conflict = make_product('D', on_hand=1)
        cls.conflict.balance.reserved = 2
        cls.conflict.balance.save()
        cls.conflict.is_active = False
        cls.conflict.save()

    def setUp(self):
        self.client.force_login(self.manager)

    def get(self, path='/stock/', params=None):
        return self.client.get(path, params or {}, HTTP_X_ONEFLOW_PAGE='1')

    def test_conditions_independent_of_active_and_zero_minimum(self):
        products = {p['sku']: p for p in self.get().json()['data']['products']}
        self.assertEqual([products[x]['stock_state'] for x in 'ABCD'], ['ready', 'low', 'empty', 'conflict'])
        self.assertFalse(products['D']['is_active'])
        self.assertEqual(self.get(params={'filter':'empty'}).json()['data']['products'][0]['sku'], 'C')
        self.assertEqual(self.get(params={'status':'inactive', 'filter':'conflict'}).json()['data']['products'][0]['sku'], 'D')

    def test_combined_filters_counts_and_exact_server_sort(self):
        data = self.get(params={'q':'Produk B', 'filter':'low', 'status':'active', 'sort':'-available'}).json()['data']
        self.assertEqual([p['sku'] for p in data['products']], ['B'])
        self.assertEqual(data['condition_counts']['all'], '1')
        sorted_products = self.get(params={'sort':'-price'}).json()['data']['products']
        self.assertEqual([p['sku'] for p in sorted_products][:2], ['A','B'])
        self.assertEqual(sorted_products[0]['price'], '9007199254740993')
        self.assertEqual(self.get(params={'q':'missing'}).json()['data']['products'], [])

    def test_history_is_separate_and_paginated_beyond_thirty(self):
        for _ in range(41):
            receive_stock(self.manager,self.full.pk,1,'receipt',uuid4())
        receive_stock(self.manager,self.low.pk,1,'other',uuid4())
        self.assertEqual(self.get().json()['data']['movements'], [])
        params={'tab':'movements','product':str(self.full.pk),'kind':'RECEIPT'}
        first=self.get(params=params).json()['data']
        last=self.get(params={**params,'page':'3'}).json()['data']
        self.assertEqual(first['movement_total'],'41')
        self.assertEqual(len(first['movements']),20)
        self.assertEqual(len(last['movements']),1)
        self.assertFalse({x['id'] for x in first['movements']} & {x['id'] for x in last['movements']})
        self.assertTrue(all(x['product']['id']==str(self.full.pk) for x in first['movements']))

    def test_history_dates_use_wib_and_report_invalid_range(self):
        receive_stock(self.manager,self.full.pk,1,'at boundary',uuid4())
        StockMovement.objects.update(created_at=datetime(2026,10,13,18,tzinfo=tz.utc))
        params={'tab':'movements','from':'2026-10-14','to':'2026-10-14'}
        self.assertEqual(self.get(params=params).json()['data']['movement_total'],'1')
        self.assertEqual(self.get(params={**params,'from':'2026-10-13','to':'2026-10-13'}).json()['data']['movement_total'],'0')
        invalid=self.get(params={**params,'from':'2026-99-99'}).json()['data']
        self.assertTrue(invalid['date_error'])
        self.assertEqual(invalid['movement_total'],'1')

    def test_sales_cannot_access_history_or_private_stock_fields(self):
        self.client.force_login(self.sales)
        self.assertEqual(self.get(params={'tab':'movements'}).status_code,403)
        data=self.get(f'/products/{self.full.pk}/').json()['data']
        self.assertFalse(data['can_manage'])
        for key in ('movements','reservations','reservation_total'):
            self.assertNotIn(key,data)
        for key in ('on_hand','reserved'):
            self.assertNotIn(key,data['product'])
        self.assertEqual(self.get(f'/stock/{self.full.pk}/receive/').status_code,403)

    def test_detail_reservations_match_confirmed_orders_for_warehouse(self):
        customer=make_customer(self.sales)
        order=make_order(self.sales,customer,self.full,2)
        confirm_order(self.sales,order.pk)
        make_order(self.sales,customer,self.full,3)
        self.client.force_login(self.warehouse)
        data=self.get(f'/products/{self.full.pk}/',{'section':'reservations'}).json()['data']
        self.assertEqual(data['selected_section'],'reservations')
        self.assertEqual(data['reservation_total'],'2')
        self.assertEqual(data['product']['reserved'],'2')
        self.assertEqual([r['order']['id'] for r in data['reservations']],[str(order.pk)])

    def test_receive_and_count_preserve_context_and_idempotence(self):
        back='/stock/?q=Produk&filter=low&sort=-available'
        for action,payload in [('receive',{'quantity':'3'}),('reconcile',{'counted_quantity':'0'})]:
            path=f'/stock/{self.conflict.pk}/{action}/?'+urlencode({'return_to':back})
            self.assertEqual(self.get(path).json()['data']['back_url'],back)
            body={**payload,'reason':'QA','operation_id':str(uuid4())}
            self.assertRedirects(self.client.post(path,body),back,fetch_redirect_response=False)
            self.assertRedirects(self.client.post(path,body),back,fetch_redirect_response=False)
        self.conflict.balance.refresh_from_db()
        self.assertEqual(self.conflict.balance.on_hand,0)
        self.assertEqual(self.conflict.balance.reserved,2)
        self.assertEqual(StockMovement.objects.filter(product=self.conflict).count(),2)

    def test_edit_and_create_return_context_and_invalid_post(self):
        back='/stock/?status=inactive&sort=-price'
        path='/products/new/?'+urlencode({'return_to':back})
        response=self.client.post(path,{'sku':'NEW','name':'New product','unit':'unit','price_rupiah':'500','min_stock':'5','is_active':'on'})
        self.assertRedirects(response,back,fetch_redirect_response=False)
        self.assertEqual(Product.objects.get(sku='NEW').balance.available,0)
        path=f'/products/{self.full.pk}/edit/?'+urlencode({'return_to':back})
        invalid=self.client.post(path,{'name':'Changed','price_rupiah':'1.5','min_stock':'5'},HTTP_X_ONEFLOW_PAGE='1')
        self.assertEqual(invalid.status_code,400)
        self.assertEqual(invalid.json()['data']['back_url'],back)
        fields={f['key']:f for f in invalid.json()['data']['form']['fields']}
        self.assertEqual(fields['price_rupiah']['value'],'1.5')
        self.assertTrue(fields['price_rupiah']['errors'])
        response=self.client.post(path,{'name':'Changed','price_rupiah':'75000','min_stock':'5','is_active':'on'})
        self.assertRedirects(response,back,fetch_redirect_response=False)

    def test_return_url_rejects_external_and_unrelated_paths(self):
        path=f'/stock/{self.full.pk}/receive/'
        for bad in ('https://evil.example/stock/','//evil.example/stock/','/orders/new/','/stock/#fragment','/stock/\n'):
            self.assertEqual(self.get(path,{'return_to':bad}).json()['data']['back_url'],'/stock/')
        detail=f'/products/{self.full.pk}/?section=reservations'
        self.assertEqual(self.get(path,{'return_to':detail}).json()['data']['back_url'],detail)
