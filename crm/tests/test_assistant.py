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
        data, links, cards = run_tool(self.sales, 'kunjungan_terlambat', {'sales_name': 'other'})
        self.assertEqual((data['jumlah'], data['per_sales']), (1, {'sales': 1}))
        self.assertIn('hanya outlet milik sales', data['cakupan'])
        self.assertEqual(run_tool(self.sales, 'saran_outlet', {'nama_outlet': 'Pelanggan B'})[0]['ditemukan'], False)
        plan, _, cards = run_tool(self.sales, 'rencana_kunjungan', {})
        self.assertEqual([item['outlet'] for item in plan['outlet']], ['Pelanggan A'])
        self.assertEqual(plan['outlet'][0]['bawa'], ['Produk P1 (4 unit)'])
        self.assertEqual(cards[0]['stops'][0]['rows'], [{'label': 'Produk P1', 'value': '4 unit'}])
        self.assertEqual(run_tool(self.sales, 'saran_outlet', {'nama_outlet': 'Pelanggan A'})[2][0]['groups'][0]['label'], 'Bawa')

    def test_manager_can_scope_to_one_sales(self):
        self.assertEqual(run_tool(self.manager, 'kunjungan_terlambat', {})[0]['jumlah'], 2)
        self.assertEqual(run_tool(self.manager, 'kunjungan_terlambat', {'sales_name': 'other'})[0]['per_sales'], {'other': 1})
        self.assertIn('error', run_tool(self.manager, 'kunjungan_terlambat', {'sales_name': 'budi'})[0])

    def test_stock_lookup(self):
        data, links, cards = run_tool(self.warehouse, 'stok_gudang', {'nama_produk': 'produk p1'})
        self.assertEqual(data['produk'][0]['tersedia'], 3)
        self.assertEqual(links[0]['href'], '/stock/?q=produk+p1')
        data, _, cards = run_tool(self.warehouse, 'stok_gudang', {})
        self.assertEqual((data['jumlah_menipis'], cards[0]['value'], cards[1]['items'][0]['tone']), (1, 1, 'warning'))

    def test_answer_uses_tool_result_and_returns_sources(self):
        with mock.patch.object(assistant, '_call', side_effect=[calls('kunjungan_terlambat'), says('Ada 1 kunjungan terlambat.')]) as call:
            result = assistant.ask(self.sales, 'Berapa yang terlambat?', [{'role': 'user', 'text': 'halo'}, {'role': 'model', 'text': 'Halo.'}])
        self.assertEqual((result['answer'], result['sources']), ('Ada 1 kunjungan terlambat.', [{'label': 'Agenda terlambat', 'href': '/?all=1'}]))
        self.assertEqual(result['tools'], ['Agenda kunjungan'])
        self.assertEqual([(card['kind'], card.get('value')) for card in result['cards']], [('stat', 1), ('ranking', None)])
        self.assertEqual(result['cards'][1]['items'][0]['name'], 'Pelanggan A')
        self.assertEqual(result['follow_ups'], ['Bagaimana capaian target bulan ini?', 'Hari ini sebaiknya ke outlet mana?'])
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
            self.assertEqual(post({'question': 'Halo'}).json(), {'answer': 'Baik.', 'sources': [], 'cards': [], 'tools': [], 'follow_ups': []})
            self.assertEqual(self.client.get('/', HTTP_X_ONEFLOW_PAGE='1').json()['data']['assistant_suggestions'], assistant.SUGGESTIONS['SALES'])
        with mock.patch.object(assistant, '_call', return_value={'candidates': []}):
            self.assertEqual(post({'question': 'Lain'}).status_code, 503)
        with override_settings(GEMINI_API_KEY=''):
            self.assertEqual(post({'question': 'Lain'}).status_code, 503)
            self.assertEqual(self.client.get('/', HTTP_X_ONEFLOW_PAGE='1').json()['data']['assistant_suggestions'], [])

    def test_usage_is_counted_cached_and_limited(self):
        from crm.models import AssistantPolicy, AssistantUsage
        post = lambda body: self.client.post('/assistant/ask/', json.dumps(body), content_type='application/json')
        reply = {**says('Baik.'), 'usageMetadata': {'promptTokenCount': 900, 'candidatesTokenCount': 100}}
        self.client.force_login(self.sales)
        with mock.patch.object(assistant, '_call', return_value=reply) as call:
            self.assertEqual(post({'question': 'Halo'}).json()['answer'], 'Baik.')
            # Same question, same data: answered from the saved copy, Gemini is not called again.
            self.assertEqual(post({'question': '  halo '}).json()['answer'], 'Baik.')
            self.assertEqual(call.call_count, 1)
            # New data makes the saved answer stale.
            Activity.objects.create(customer=self.mine, sales=self.sales, status='PLANNED', scheduled_date=date(2026, 12, 1))
            post({'question': 'Halo'})
            self.assertEqual(call.call_count, 2)
        row = AssistantUsage.objects.get(user=self.sales)
        self.assertEqual((row.questions, row.from_cache, row.input_tokens, row.output_tokens), (3, 1, 1800, 200))
        AssistantPolicy.objects.create(pk=1, daily_per_user=2, monthly_company=100, input_price_rupiah=2000, output_price_rupiah=8000)
        with mock.patch.object(assistant, '_call', return_value=reply) as call:
            blocked = post({'question': 'Pertanyaan baru'})
            self.assertEqual((blocked.status_code, call.call_count), (429, 0))
        self.assertIn('besok', blocked.json()['error'])
        AssistantPolicy.objects.filter(pk=1).update(daily_per_user=50, monthly_company=2)
        self.client.force_login(self.other)
        self.assertEqual(post({'question': 'Halo juga'}).status_code, 429)

    def test_usage_page_is_for_the_manager(self):
        from crm.models import AssistantPolicy
        from crm.services import assistant_usage
        assistant_usage.record(self.sales, 1_000_000, 500_000)
        self.client.force_login(self.sales)
        self.assertEqual(self.client.get('/assistant/usage/').status_code, 403)
        self.client.force_login(self.manager)
        usage = self.client.get('/assistant/usage/', HTTP_X_ONEFLOW_PAGE='1').json()['data']['usage']
        self.assertEqual((usage['billed'], usage['priced'], usage['cost_rupiah']), ('1', False, None))
        self.assertLess(self.client.post('/assistant/policy/', {'daily_per_user': 10, 'monthly_company': 500,
                                                                'input_price_rupiah': 2000, 'output_price_rupiah': 8000}).status_code, 400)
        self.assertEqual(AssistantPolicy.objects.get(pk=1).daily_per_user, 10)
        usage = self.client.get('/assistant/usage/', HTTP_X_ONEFLOW_PAGE='1').json()['data']['usage']
        self.assertEqual((usage['cost_rupiah'], usage['people'][0]['name']), ('6000', 'sales'))
