from urllib.parse import urlencode

from django.test import TestCase, override_settings

from crm.models import Order
from crm.services.orders import confirm_order
from crm.tests.factories import make_customer, make_order, make_product, make_shipped_order, make_user


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class OrderWorkspaceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.manager = make_user('manager', 'MANAGER')
        cls.sales = make_user('sales', 'SALES')
        cls.other = make_user('other', 'SALES')
        cls.warehouse = make_user('warehouse', 'WAREHOUSE')
        cls.customer = make_customer(cls.sales)
        cls.foreign = make_customer(cls.other, 'OTHER')
        cls.product = make_product(on_hand=30)
        cls.draft = make_order(cls.sales, cls.customer, cls.product, 2)
        cls.pending = make_order(cls.sales, cls.customer, cls.product, 3)
        confirm_order(cls.sales, cls.pending.pk)
        cls.other_draft = make_order(cls.other, cls.foreign, cls.product, 1)

    def setUp(self):
        self.client.force_login(self.manager)
        self.headers = {'HTTP_X_ONEFLOW_PAGE': '1'}

    def get(self, path, params=None):
        return self.client.get(path, params or {}, **self.headers)

    def test_combined_filters_counts_and_owner_only_reset_contract(self):
        data = self.get('/orders/', {'sales': self.sales.pk, 'q': 'CUS001', 'status': 'CONFIRMED'}).json()['data']
        self.assertEqual([o['id'] for o in data['orders']], [str(self.pending.pk)])
        self.assertEqual(data['status_counts'], {'DRAFT': '1', 'CONFIRMED': '1', 'SHIPPED': '0', 'CANCELLED': '0', 'all': '2'})
        empty = self.get('/orders/', {'sales': self.sales.pk, 'q': 'no match'}).json()['data']
        self.assertEqual(len(empty['sales_options']), 2)
        self.assertEqual(empty['orders'], [])
        self.assertEqual(len(self.get('/orders/').json()['data']['orders']), 3)
        found = self.get('/orders/', {'q': f'OF-{self.draft.pk:04d}'}).json()['data']['orders']
        self.assertEqual([o['id'] for o in found], [str(self.draft.pk)])

    def test_role_scope_and_warehouse_tabs(self):
        self.client.force_login(self.warehouse)
        data = self.get('/orders/', {'status': 'DRAFT'}).json()['data']
        self.assertEqual(data['allowed_statuses'], ['CONFIRMED', 'SHIPPED'])
        self.assertEqual(data['selected_status'], '')
        self.assertEqual([o['id'] for o in data['orders']], [str(self.pending.pk)])
        self.client.force_login(self.sales)
        self.assertEqual(len(self.get('/orders/').json()['data']['orders']), 2)
        self.assertEqual(self.get('/orders/', {'sales': self.other.pk}).status_code, 403)
        self.assertEqual(self.get(f'/orders/{self.other_draft.pk}/').status_code, 404)
        details = self.get('/orders/new/').json()['data']['customer_details']
        self.assertEqual([c['id'] for c in details], [str(self.customer.pk)])

    def test_server_sort_keeps_large_integer_precision_and_stable_ties(self):
        Order.objects.filter(pk=self.draft.pk).update(total_rupiah=9007199254740993)
        Order.objects.filter(pk=self.pending.pk).update(total_rupiah=9007199254740992)
        data = self.get('/orders/', {'sort': '-total'}).json()['data']
        self.assertEqual([o['id'] for o in data['orders']][:2], [str(self.draft.pk), str(self.pending.pk)])
        Order.objects.update(created_at=self.draft.created_at)
        data = self.get('/orders/', {'sort': '-created_at'}).json()['data']
        self.assertEqual([o['id'] for o in data['orders']], [str(self.other_draft.pk), str(self.pending.pk), str(self.draft.pk)])
        self.assertEqual(self.get('/orders/', {'sort': 'invalid'}).json()['data']['selected_sort'], '-created_at')

    def test_shipping_range_uses_actual_wib_shipping_date_and_recovers_invalid_input(self):
        before = make_shipped_order(self.sales, self.customer, self.product, 1, '2026-10-01T16:59:00+00:00')
        inside = make_shipped_order(self.sales, self.customer, self.product, 1, '2026-10-01T17:00:00+00:00')
        params = {'status': 'SHIPPED', 'shipped_from': '2026-10-02', 'shipped_to': '2026-10-02'}
        data = self.get('/orders/', params).json()['data']
        self.assertEqual([o['id'] for o in data['orders']], [str(inside.pk)])
        self.assertEqual(data['status_counts']['SHIPPED'], '1')
        self.assertEqual(data['status_counts']['all'], '5')
        self.assertEqual(data['selected_sort'], '-shipped_at')
        params['shipped_to'] = '2026-02-30'
        invalid = self.get('/orders/', params).json()['data']
        self.assertTrue(invalid['date_error'])
        self.assertEqual(len(invalid['orders']), 2)
        self.assertIsNone(invalid['shipped_from'])
        self.assertNotEqual(before.pk, inside.pk)

    def test_return_context_survives_create_and_transitions_and_rejects_external_urls(self):
        back = f'/orders/?sales={self.sales.pk}&status=DRAFT&sort=-total'
        query = '?' + urlencode({'return_to': back})
        payload = {'customer': self.customer.pk, 'lines-TOTAL_FORMS': '1', 'lines-INITIAL_FORMS': '0', 'lines-0-product': self.product.pk, 'lines-0-quantity': '1'}
        response = self.client.post('/orders/new/' + query, payload, follow=True, **self.headers)
        data = response.json()['data']
        self.assertEqual(data['back_url'], back)
        order_id = data['order']['id']
        for action in ['confirm', 'ship']:
            response = self.client.post(f'/orders/{order_id}/{action}/' + query, {}, follow=True, **self.headers)
            self.assertEqual(response.json()['data']['back_url'], back)
            self.assertEqual(response.redirect_chain[0][0], f'/orders/{order_id}/' + query)
        for unsafe in ['https://evil.example/orders/', '//evil.example/orders/', '/customers/new/', '/orders/\\evil', '/orders/#fragment']:
            self.assertEqual(self.get(f'/orders/{order_id}/', {'return_to': unsafe}).json()['data']['back_url'], '/orders/')

    def test_changed_stock_returns_inline_error_latest_values_and_canonical_get_url(self):
        self.product.balance.refresh_from_db()
        self.product.balance.on_hand = 4
        self.product.balance.save()
        back = '/orders/?status=DRAFT'
        query = '?' + urlencode({'return_to': back})
        response = self.client.post(f'/orders/{self.draft.pk}/confirm/' + query, {}, **self.headers)
        self.assertEqual(response.status_code, 409)
        page = response.json()
        self.assertEqual(page['screen'], 'order_detail')
        data = page['data']
        self.assertEqual(data['error']['code'], 'INSUFFICIENT_STOCK')
        self.assertEqual(data['detail_url'], f'/orders/{self.draft.pk}/' + query)
        self.assertEqual(data['line_checks'][str(self.draft.lines.get().pk)], {'available': '1', 'shortage': '1'})
        self.assertTrue(data['blockers'])
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.reserved, 3)
        self.assertEqual(self.get(data['detail_url']).status_code, 200)

    def test_cancel_validation_stays_in_detail_and_warehouse_cancel_returns_to_scoped_list(self):
        response = self.client.post(f'/orders/{self.pending.pk}/cancel/', {'reason': ''}, **self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['screen'], 'order_detail')
        data = response.json()['data']
        self.assertEqual(data['dialog'], 'cancel')
        self.assertTrue(data['cancel_form']['fields'][0]['errors'])
        self.client.force_login(self.warehouse)
        back = '/orders/?status=CONFIRMED&sort=-total'
        query = '?' + urlencode({'return_to': back})
        response = self.client.post(f'/orders/{self.pending.pk}/cancel/' + query, {'reason': 'Pelanggan membatalkan'}, **self.headers)
        self.assertEqual(response['Location'], back)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.reserved, 0)

    def test_detail_blockers_match_inactive_records_and_shipping_stock_conflict(self):
        self.customer.is_active = False
        self.customer.save()
        self.product.is_active = False
        self.product.save()
        data = self.get(f'/orders/{self.draft.pk}/').json()['data']
        self.assertEqual(len(data['blockers']), 2)
        self.product.balance.refresh_from_db()
        self.product.balance.on_hand = 2
        self.product.balance.save()
        self.client.force_login(self.warehouse)
        data = self.get(f'/orders/{self.pending.pk}/').json()['data']
        self.assertTrue(data['blockers'])
        self.assertEqual(data['line_checks'], {})

    def test_list_expansion_uses_order_snapshot_and_preserves_role_scope(self):
        # The list preview must show the agreed price, not today's catalogue price.
        line = self.draft.lines.get()
        original_price = line.unit_price_rupiah
        self.product.price_rupiah += 1000
        self.product.save()
        self.client.force_login(self.sales)
        records = self.get('/orders/').json()['data']['orders']
        self.assertNotIn(str(self.other_draft.pk), [r['id'] for r in records])
        draft = next(r for r in records if r['id'] == str(self.draft.pk))
        self.assertEqual(draft['items'], [{
            'id': str(line.pk), 'name': self.product.name, 'sku': self.product.sku,
            'unit': self.product.unit, 'quantity': str(line.quantity),
            'price': str(original_price), 'subtotal': str(line.subtotal_rupiah),
        }])
        self.client.force_login(self.warehouse)
        records = self.get('/orders/').json()['data']['orders']
        self.assertEqual([r['id'] for r in records], [str(self.pending.pk)])
        self.assertEqual(records[0]['items'][0]['quantity'], '3')
        self.assertNotIn('on_hand', records[0]['items'][0])

    def test_list_expansion_prefetches_lines_in_one_query(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as queries:
            records = self.get('/orders/').json()['data']['orders']
        self.assertEqual(len(records), 3)
        line_queries = [q['sql'] for q in queries if 'FROM "crm_orderline"' in q['sql']]
        self.assertEqual(len(line_queries), 1)
