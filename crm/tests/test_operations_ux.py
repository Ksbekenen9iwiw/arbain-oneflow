import os
from io import StringIO
from unittest.mock import patch
from django.core.management import call_command, CommandError
from django.test import TestCase, override_settings
from crm.demo_access import JUDGING_ACCOUNTS, demo_accounts
from crm.models import SampleRequest
from crm.tests.factories import make_user, make_customer, make_product


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class OperationsUXTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('nadia', 'SALES')
        cls.other = make_user('rafi', 'SALES')
        cls.warehouse = make_user('gudang', 'WAREHOUSE')
        cls.manager = make_user('manajer', 'MANAGER')
        cls.customer = make_customer(cls.sales)
        cls.foreign = make_customer(cls.other, 'OTHER')
        cls.product = make_product()

    def page(self, path):
        return self.client.get(path, HTTP_X_ONEFLOW_PAGE='1')

    def test_planning_permissions_and_unconfigured_values(self):
        self.client.force_login(self.sales)
        self.assertEqual(self.page('/stock/?tab=planning').status_code, 403)
        for actor in [self.warehouse, self.manager]:
            self.client.force_login(actor)
            data = self.page('/stock/?tab=planning&risk=attention').json()['data']
            self.assertEqual(len(data['planning']), 1)
            self.assertFalse(data['planning'][0]['configured'])
            self.assertIsNone(data['planning'][0]['recommend_quantity'])
            self.assertEqual(self.page('/stock/?tab=planning&q=unmatched').json()['data']['planning'], [])

    def test_supply_invalid_form_returns_to_same_dialog_with_values(self):
        self.client.force_login(self.manager)
        response = self.client.post(f'/products/{self.product.pk}/supply/settings/?return_to=%2Fstock%2F%3Ftab%3Dplanning', {
            'analysis_period_days': '30', 'lead_time_days': '-1', 'coverage_target_days': '14', 'safety_stock_days': '2',
        }, HTTP_X_ONEFLOW_PAGE='1')
        self.assertEqual(response.status_code, 400)
        data = response.json()['data']
        self.assertEqual(data['selected_section'], 'supply')
        self.assertEqual(self.page(response.json()['url']).status_code, 200)
        self.assertEqual(data['dialog'], 'settings')
        self.assertEqual(data['back_url'], '/stock/?tab=planning')
        field = next(f for f in data['supply_form']['fields'] if f['key'] == 'lead_time_days')
        self.assertEqual(field['value'], '-1')
        self.assertTrue(field['errors'])

    def test_sample_search_keeps_sales_scope_and_counts_match_other_filters(self):
        own = SampleRequest.objects.create(customer=self.customer, sales=self.sales, purpose='Uji', status='DRAFT')
        SampleRequest.objects.create(customer=self.foreign, sales=self.other, purpose='Uji', status='DRAFT')
        self.client.force_login(self.sales)
        data = self.page(f'/samples/?q={own.number}').json()['data']
        self.assertEqual([r['id'] for r in data['samples']], [str(own.pk)])
        self.assertEqual(self.page('/samples/?q=OTHER').json()['data']['samples'], [])
        data = self.page('/samples/?fulfillment=SHIPPED').json()['data']
        self.assertEqual(sum(int(n) for n in data['status_counts'].values()), 0)

    def test_sample_business_error_keeps_dialog_values_and_refreshable_url(self):
        sample = SampleRequest.objects.create(customer=self.customer, sales=self.sales, status='SUBMITTED')
        self.client.force_login(self.manager)
        response = self.client.post(f'/samples/{sample.pk}/decide/?return_to=%2Fsamples%2F%3Fstatus%3DSUBMITTED',
                                    {'decision': 'REJECTED', 'note': ''}, HTTP_X_ONEFLOW_PAGE='1')
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload['url'], f'/samples/{sample.pk}/?return_to=%2Fsamples%2F%3Fstatus%3DSUBMITTED')
        self.assertEqual(payload['data']['dialog'], 'decision')
        self.assertEqual(next(f for f in payload['data']['decision_form']['fields'] if f['key'] == 'decision')['value'], 'REJECTED')
        self.assertEqual(self.page(payload['url']).status_code, 200)
        sample.refresh_from_db()
        self.assertEqual(sample.status, 'SUBMITTED')

    def test_followup_shortcut_prefills_followup_without_creating_activity(self):
        self.client.force_login(self.sales)
        response = self.page(f'/customers/{self.customer.pk}/activities/new/?intent=followup')
        form = response.json()['data']['form']
        self.assertEqual(next(f for f in form['fields'] if f['key'] == 'kind')['value'], 'FOLLOWUP')
        self.assertEqual(self.customer.activities.count(), 0)

    def test_first_sample_evaluation_is_visible_without_prior_purchases(self):
        from crm.models import SampleFollowUp
        from django.utils import timezone
        sample = SampleRequest.objects.create(customer=self.customer, sales=self.sales, status='APPROVED', fulfillment_status='RECEIVED')
        SampleFollowUp.objects.create(request=sample, actor=self.sales, followup_date=timezone.localdate(), outcome='EVALUATING', note='Sedang diuji pelanggan')
        self.client.force_login(self.sales)
        history = self.page(f'/samples/{sample.pk}/').json()['data']['history']
        self.assertTrue(history['has_history'])
        self.assertEqual(history['followups'][0]['note'], 'Sedang diuji pelanggan')

    def test_draft_and_submitted_samples_can_be_cancelled_without_changing_stock(self):
        self.client.force_login(self.sales)
        for status in ['DRAFT', 'SUBMITTED']:
            sample = SampleRequest.objects.create(customer=self.customer, sales=self.sales, status=status)
            self.assertTrue(self.page(f'/samples/{sample.pk}/').json()['data']['can_cancel'])
            response = self.client.post(f'/samples/{sample.pk}/cancel/', {'reason': 'Kebutuhan pelanggan berubah'})
            self.assertEqual(response.status_code, 302)
            sample.refresh_from_db()
            self.assertEqual(sample.status, 'CANCELLED')
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 0)
        self.assertEqual(self.product.balance.reserved, 0)

    def test_shipped_sample_cannot_be_cancelled(self):
        self.client.force_login(self.sales)
        sample = SampleRequest.objects.create(customer=self.customer, sales=self.sales, status='APPROVED', fulfillment_status='SHIPPED')
        self.assertFalse(self.page(f'/samples/{sample.pk}/').json()['data']['can_cancel'])
        response = self.client.post(f'/samples/{sample.pk}/cancel/', {'reason': 'Terlambat membatalkan'}, HTTP_X_ONEFLOW_PAGE='1')
        self.assertGreaterEqual(response.status_code, 400)
        sample.refresh_from_db()
        self.assertEqual(sample.status, 'APPROVED')
        self.assertEqual(sample.fulfillment_status, 'SHIPPED')

    @override_settings(ONEFLOW_DEMO=True)
    @patch.dict(os.environ, {}, clear=False)
    def test_demo_access_is_explicit_validated_and_disabled_outside_demo(self):
        with patch.dict(os.environ, {'ONEFLOW_DEMO_ACCOUNTS': ''}):
            self.assertEqual(demo_accounts(), [])
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(demo_accounts(), [])
            with self.assertRaises(CommandError):
                call_command('configure_judging_accounts', stdout=StringIO())
            call_command('configure_judging_accounts', confirm_demo_reset=True, stdout=StringIO())
            self.assertEqual(len(demo_accounts()), 4)
            for account in JUDGING_ACCOUNTS:
                self.assertTrue(self.client.login(username=account['username'], password=account['password']))
                self.client.logout()
            login = self.page('/login/').json()
            self.assertEqual(len(login['data']['demo_accounts']), 4)
            with override_settings(ONEFLOW_DEMO=False):
                self.assertEqual(demo_accounts(), [])
                self.assertEqual(self.page('/login/').json()['data']['demo_accounts'], [])
                with self.assertRaises(CommandError):
                    call_command('configure_judging_accounts', confirm_demo_reset=True, stdout=StringIO())
            self.sales.refresh_from_db()
            self.sales.set_password('changed')
            self.sales.save(update_fields=['password'])
            self.assertNotIn('nadia', [row['username'] for row in demo_accounts()])
