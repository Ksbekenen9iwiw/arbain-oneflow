from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from crm.models import Activity, SampleFollowUp, SampleRequest, SampleRequestLine
from crm.tests.factories import make_customer, make_product, make_user, make_order


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class RoleJourneyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('sales-journey', 'SALES')
        cls.other = make_user('other-journey', 'SALES')
        cls.manager = make_user('manager-journey', 'MANAGER')
        cls.warehouse = make_user('warehouse-journey', 'WAREHOUSE')
        cls.customer = make_customer(cls.sales)
        cls.product = make_product(on_hand=30)
        cls.sample = SampleRequest.objects.create(
            customer=cls.customer, sales=cls.sales, status='APPROVED', fulfillment_status='WAITING',
            purpose='PRIVATE-purpose', customer_need='PRIVATE-need', notes='PRIVATE-note',
            potential_orders='PRIVATE-potential', business_profile='PRIVATE-profile',
            decision_note='PRIVATE-decision', evidence_snapshot={'reason': 'PRIVATE-evidence'},
            policy_snapshot={'secret': 'PRIVATE-policy'},
        )
        SampleRequestLine.objects.create(request=cls.sample, product=cls.product, quantity=1)

    def page(self, path):
        return self.client.get(path, HTTP_X_ONEFLOW_PAGE='1')

    def detail(self):
        return self.page(f'/customers/{self.customer.pk}/').json()['data']

    def test_warehouse_list_and_detail_exclude_commercial_data_in_html_and_json(self):
        self.client.force_login(self.warehouse)
        for path in ['/samples/', f'/samples/{self.sample.pk}/?tab=evidence']:
            for headers in [{}, {'HTTP_X_ONEFLOW_PAGE': '1'}]:
                response = self.client.get(path, **headers)
                self.assertEqual(response.status_code, 200)
                self.assertNotContains(response, 'PRIVATE-')
        data = self.page(f'/samples/{self.sample.pk}/').json()['data']
        self.assertFalse(data['can_view_commercial'])
        for key in ['history', 'policy', 'recommendation', 'decision_form', 'outcome_form', 'schedule_form', 'cancel_form']:
            self.assertNotIn(key, data)
        self.assertEqual(data['sample']['customer']['address'], self.customer.address)
        self.assertEqual(data['sample']['lines'][0]['quantity'], '1')
        self.assertTrue(data['can_ship'])
        self.assertIn('allocations', data['sample']['lines'][0])
        # A fulfillment error must use the same safe contract.
        response = self.client.post(f'/samples/{self.sample.pk}/ship/', HTTP_X_ONEFLOW_PAGE='1')
        self.assertEqual(response.status_code, 409)  # no reservation exists on this fixture
        self.assertNotContains(response, 'PRIVATE-', status_code=409)

    def test_sales_and_manager_keep_evidence_but_only_manager_can_decide(self):
        self.sample.status = 'SUBMITTED'
        self.sample.save()
        for actor in [self.sales, self.manager]:
            self.client.force_login(actor)
            data = self.page(f'/samples/{self.sample.pk}/').json()['data']
            self.assertTrue(data['can_view_commercial'])
            self.assertEqual(data['sample']['purpose'], 'PRIVATE-purpose')
            self.assertIn('history', data)
            self.assertEqual('decision_form' in data, actor == self.manager)
        self.client.force_login(self.warehouse)
        self.assertEqual(self.page(f'/samples/{self.sample.pk}/').status_code, 404)

    def test_direct_routes_and_mutations_enforce_role_boundaries(self):
        self.client.force_login(self.warehouse)
        for path in ['/customers/', f'/customers/{self.customer.pk}/', '/samples/new/', '/samples/policy/']:
            self.assertEqual(self.page(path).status_code, 403)
        for action in ['decide', 'schedule', 'outcome', 'cancel']:
            response = self.client.post(f'/samples/{self.sample.pk}/{action}/', {}, HTTP_X_ONEFLOW_PAGE='1')
            self.assertEqual(response.status_code, 403)
            self.assertNotIn('sample', response.json()['data'])
        self.client.force_login(self.other)
        self.assertEqual(self.page(f'/samples/{self.sample.pk}/').status_code, 404)
        self.assertEqual(self.page(f'/customers/{self.customer.pk}/').status_code, 404)
        self.client.force_login(self.sales)
        self.assertEqual(self.page('/stock/?tab=planning').status_code, 403)
        self.assertEqual(self.page('/stock/').status_code, 200)

    def test_warehouse_order_contact_has_no_customer_profile(self):
        order = make_order(self.sales, self.customer, self.product, 1)
        order.status = 'CONFIRMED'
        order.save()
        self.client.force_login(self.warehouse)
        customer = self.page(f'/orders/{order.pk}/').json()['data']['order']['customer']
        self.assertEqual(set(customer), {'id', 'code', 'name', 'phone', 'address'})

    def test_next_action_prioritizes_due_work_and_does_not_write_data(self):
        today = timezone.localdate()
        future = Activity.objects.create(customer=self.customer, sales=self.sales, kind='FOLLOWUP', followup_date=today + timedelta(days=2))
        overdue = Activity.objects.create(customer=self.customer, sales=self.sales, scheduled_date=today - timedelta(days=1))
        self.client.force_login(self.sales)
        actions = self.detail()['next_actions']
        self.assertEqual(actions[0]['key'], f'activity-{overdue.pk}')
        self.assertEqual(actions[0]['urgency'], 'OVERDUE')
        self.assertEqual(actions[-1]['key'], f'activity-{future.pk}')
        self.assertEqual(Activity.objects.count(), 2)
        self.assertEqual(self.page(actions[0]['href']).status_code, 200)
        overdue.status = 'DONE'
        overdue.result = 'Sudah dihubungi'
        overdue.save()
        self.assertNotIn(f'activity-{overdue.pk}', [a['key'] for a in self.detail()['next_actions']])

    def test_received_sample_suggests_evaluation_without_duplicating_scheduled_activity(self):
        self.sample.fulfillment_status = 'RECEIVED'
        self.sample.save()
        self.client.force_login(self.sales)
        self.assertEqual(self.detail()['next_actions'][0]['key'], f'sample-{self.sample.pk}')
        scheduled = Activity.objects.create(customer=self.customer, sales=self.sales, kind='FOLLOWUP', followup_date=timezone.localdate() + timedelta(days=1))
        SampleFollowUp.objects.create(request=self.sample, actor=self.sales, activity=scheduled, followup_date=scheduled.followup_date)
        actions = self.detail()['next_actions']
        self.assertEqual([a['key'] for a in actions], [f'activity-{scheduled.pk}'])

    def test_reorder_shortage_keeps_action_and_explains_evidence(self):
        from crm.services.actions import Candidate
        today = timezone.localdate()
        candidate = Candidate('REORDER:1:1', self.customer.pk, self.product.pk, 'REORDER', today,
                              5, 0, 10, 'WAITING_STOCK', {
                                  'product_name': self.product.name, 'product_sku': self.product.sku,
                                  'purchase_dates': [], 'purchase_date_count': 3, 'intervals_days': [7, 7],
                                  'interval_days': 7, 'last_purchase_date': today - timedelta(days=7), 'unit': 'botol',
                              })
        self.client.force_login(self.sales)
        with patch('crm.services.actions.compute_candidates', return_value=[candidate]):
            action = self.detail()['next_actions'][0]
            form = self.page(action['href']).json()['data']['form']
            self.assertIn(self.product.name, next(f['value'] for f in form['fields'] if f['key'] == 'note'))
        self.assertEqual(action['key'], f'reorder-{self.product.pk}')
        self.assertEqual(action['urgency'], 'STOCK_LOW')
        self.assertIn('3 tanggal pembelian', action['reason'])
        self.assertIn('Stok bebas kurang', action['reason'])
        self.assertIn('intent=followup', action['href'])
        self.assertFalse(Activity.objects.exists())

    def test_unrelated_product_cannot_inject_followup_context(self):
        self.client.force_login(self.sales)
        form = self.page(f'/customers/{self.customer.pk}/activities/new/?intent=followup&source_product=999999').json()['data']['form']
        self.assertEqual(next(f['value'] for f in form['fields'] if f['key'] == 'note'), '')

    def test_inactive_customer_does_not_get_new_sales_suggestions(self):
        make_order(self.sales, self.customer, self.product, 1)
        self.customer.is_active = False
        self.customer.save()
        self.client.force_login(self.sales)
        actions = self.detail()['next_actions']
        self.assertEqual(len(actions), 1)
        self.assertIn('intent=done', actions[0]['href'])
        self.assertEqual(actions[0]['label'], 'Catat interaksi')
