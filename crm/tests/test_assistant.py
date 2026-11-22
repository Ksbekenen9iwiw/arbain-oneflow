import json
from datetime import date
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings

from crm.models import Activity, ConsignmentStock
from crm.services import assistant
from crm.services.assistant_tools import run_tool, tools_for
from crm.tests.factories import make_customer, make_product, make_user


def says(text):
    return {'candidates': [{'content': {'role': 'model', 'parts': [{'text': text}]}}]}


def calls(name, **args):
    return {'candidates': [{'content': {'role': 'model', 'parts': [{'functionCall': {'name': name, 'args': args}}]}}]}


@override_settings(GEMINI_API_KEY='test-key')
class AssistantTests(TestCase):
    def setUp(self):
        cache.clear()
        self.sales, self.other = make_user('sales', 'SALES'), make_user('other', 'SALES')
        self.manager, self.warehouse = make_user('manager', 'MANAGER'), make_user('warehouse', 'WAREHOUSE')
        self.product = make_product('P1', on_hand=3)
        self.mine, self.theirs = make_customer(self.sales, 'A'), make_customer(self.other, 'B')
        for customer in (self.mine, self.theirs):
            ConsignmentStock.objects.create(customer=customer, product=self.product, total_sold=4, total_placed=4,
                                            quantity_on_display=0, last_checked_date=date(2026, 11, 1))
            Activity.objects.create(customer=customer, sales=customer.owner, status='PLANNED', scheduled_date=date(2026, 11, 1))

    def test_tools_follow_the_role(self):
        self.assertEqual(set(tools_for(self.warehouse)), {'stok_gudang', 'pesanan_menunggu_kirim'})
        self.assertNotIn('titip_jual_melambat', tools_for(self.sales))
        self.assertNotIn('sales_name', tools_for(self.sales)['kunjungan_terlambat'][3])
        self.assertIn('error', run_tool(self.warehouse, 'rencana_kunjungan', {})[0])
        self.assertIn('error', run_tool(self.sales, 'titip_jual_melambat', {})[0])
        self.assertIn('error', run_tool(self.sales, 'hapus_data', {})[0])

    def test_sales_only_gets_own_outlets_even_when_naming_another_sales(self):
        data, links = run_tool(self.sales, 'kunjungan_terlambat', {'sales_name': 'other'})
        self.assertEqual((data['jumlah'], data['per_sales']), (1, {'sales': 1}))
        self.assertIn('hanya outlet milik sales', data['cakupan'])
        self.assertEqual(run_tool(self.sales, 'saran_outlet', {'nama_outlet': 'Pelanggan B'})[0]['ditemukan'], False)
        plan, _ = run_tool(self.sales, 'rencana_kunjungan', {})
        self.assertEqual([item['outlet'] for item in plan['outlet']], ['Pelanggan A'])
        self.assertEqual(plan['outlet'][0]['bawa'], ['Produk P1 (4 unit)'])

    def test_manager_can_scope_to_one_sales(self):
        self.assertEqual(run_tool(self.manager, 'kunjungan_terlambat', {})[0]['jumlah'], 2)
        self.assertEqual(run_tool(self.manager, 'kunjungan_terlambat', {'sales_name': 'other'})[0]['per_sales'], {'other': 1})
        self.assertIn('error', run_tool(self.manager, 'kunjungan_terlambat', {'sales_name': 'budi'})[0])

    def test_stock_lookup(self):
        data, links = run_tool(self.warehouse, 'stok_gudang', {'nama_produk': 'produk p1'})
        self.assertEqual(data['produk'][0]['tersedia'], 3)
        self.assertEqual(links[0]['href'], '/stock/?q=produk+p1')
        self.assertEqual(run_tool(self.warehouse, 'stok_gudang', {})[0]['jumlah_menipis'], 1)

    def test_answer_uses_tool_result_and_returns_sources(self):
        with mock.patch.object(assistant, '_call', side_effect=[calls('kunjungan_terlambat'), says('Ada 1 kunjungan terlambat.')]) as call:
            result = assistant.ask(self.sales, 'Berapa yang terlambat?', [{'role': 'user', 'text': 'halo'}, {'role': 'model', 'text': 'Halo.'}])
        self.assertEqual(result, {'answer': 'Ada 1 kunjungan terlambat.', 'sources': [{'label': 'Agenda terlambat', 'href': '/?all=1'}]})
        sent = call.call_args_list[1].args[0]['contents']
        self.assertEqual(sent[-1]['parts'][0]['functionResponse']['response']['result']['jumlah'], 1)
        self.assertEqual([tool['name'] for tool in call.call_args_list[0].args[0]['tools'][0]['functionDeclarations']], list(tools_for(self.sales)))

    def test_endpoint(self):
        post = lambda body: self.client.post('/assistant/ask/', json.dumps(body), content_type='application/json')
        self.assertEqual(post({'question': 'x'}).status_code, 302)
        self.client.force_login(self.sales)
        self.assertEqual(post({'question': ' '}).status_code, 400)
        self.assertEqual(post({'question': 'x' * 401}).status_code, 400)
        with mock.patch.object(assistant, '_call', return_value=says('Baik.')):
            self.assertEqual(post({'question': 'Halo'}).json(), {'answer': 'Baik.', 'sources': []})
            self.assertEqual(self.client.get('/', HTTP_X_ONEFLOW_PAGE='1').json()['data']['assistant_suggestions'], assistant.SUGGESTIONS['SALES'])
        with mock.patch.object(assistant, '_call', return_value={'candidates': []}):
            self.assertEqual(post({'question': 'Halo'}).status_code, 503)
        with override_settings(GEMINI_API_KEY=''):
            self.assertEqual(post({'question': 'Halo'}).status_code, 503)
            self.assertEqual(self.client.get('/', HTTP_X_ONEFLOW_PAGE='1').json()['data']['assistant_suggestions'], [])
