from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from crm.models import Activity, SampleRequest, SampleRequestLine
from crm.services.samples import schedule_followup, record_followup
from crm.tests.factories import make_user, make_customer, make_product, make_order, make_shipped_order


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class SampleJourneyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('sample-flow-sales', 'SALES')
        cls.other = make_user('sample-flow-other', 'SALES')
        cls.manager = make_user('sample-flow-manager', 'MANAGER')
        cls.warehouse = make_user('sample-flow-warehouse', 'WAREHOUSE')
        cls.customer = make_customer(cls.sales)
        cls.product = make_product(on_hand=40)
        cls.sample = SampleRequest.objects.create(customer=cls.customer, sales=cls.sales,
            status='APPROVED', fulfillment_status='RECEIVED', received_at=timezone.now() - timedelta(days=2))
        SampleRequestLine.objects.create(request=cls.sample, product=cls.product, quantity=1)

    def setUp(self):
        self.client.force_login(self.sales)

    def page(self, path):
        return self.client.get(path, HTTP_X_ONEFLOW_PAGE='1')

    def test_schedule_edit_and_evaluation_complete_one_linked_activity(self):
        today = timezone.localdate()
        schedule_followup(self.sales, self.sample.pk, today, 'Tanyakan hasil uji')
        schedule_followup(self.sales, self.sample.pk, today + timedelta(days=1), 'Sesuai permintaan pelanggan')
        self.assertEqual(self.sample.followups.count(), 1)
        activity = Activity.objects.get()
        self.assertEqual(activity.followup_date, today + timedelta(days=1))
        response = self.page(f'/activities/{activity.pk}/complete/?return_to=%2Fcustomers%2F')
        self.assertEqual(response.status_code, 302)
        self.assertIn(f'/samples/{self.sample.pk}/?tab=evaluation', response.url)
        record_followup(self.sales, self.sample.pk, 'Butuh waktu untuk menguji', 'EVALUATING', '')
        activity.refresh_from_db()
        self.assertEqual(activity.status, 'DONE')
        detail = self.page(f'/samples/{self.sample.pk}/').json()['data']
        self.assertIsNone(detail['evaluation']['scheduled'])
        self.assertEqual(detail['evaluation']['events'][0]['response'], 'Butuh waktu untuk menguji')
        self.assertEqual(detail['evaluation']['events'][0]['date'], today.isoformat())
        self.assertTrue(detail['can_schedule'])
        schedule_followup(self.sales, self.sample.pk, today + timedelta(days=3))
        self.assertEqual(Activity.objects.filter(status='PLANNED').count(), 1)

    def test_customer_samples_show_evaluation_and_only_explicit_purchase_link(self):
        draft = make_order(self.sales, self.customer, self.product, 2)
        record_followup(self.sales, self.sample.pk, 'Cocok, ingin memesan', 'EVALUATING')
        detail = self.page(f'/samples/{self.sample.pk}/').json()['data']
        self.assertEqual(detail['evaluation']['orders'][0]['id'], str(draft.pk))
        self.assertIsNone(detail['sample']['order'])
        row = self.page(f'/customers/{self.customer.pk}/?tab=samples').json()['data']['samples'][0]
        self.assertEqual(row['last_response'], 'Cocok, ingin memesan')
        self.assertIsNone(row['order_id'])
        shipped = make_shipped_order(self.sales, self.customer, self.product, 2, timezone.now())
        response = self.client.post(f'/samples/{self.sample.pk}/outcome/', {
            'outcome': 'PURCHASED', 'response': 'Pelanggan memesan setelah uji', 'order_id': shipped.pk,
        })
        self.assertEqual(response.status_code, 302)
        detail = self.page(f'/samples/{self.sample.pk}/').json()['data']
        self.assertEqual(detail['sample']['order']['id'], str(shipped.pk))
        self.assertFalse(detail['can_create_order'])
        self.assertFalse(detail['can_schedule'])
        row = self.page(f'/customers/{self.customer.pk}/?tab=samples').json()['data']['samples'][0]
        self.assertEqual(row['order_id'], str(shipped.pk))
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 40)  # linking never issues sample stock twice

    def test_missing_draft_and_foreign_orders_cannot_be_purchase_evidence(self):
        draft = make_order(self.sales, self.customer, self.product)
        foreign = make_shipped_order(self.other, make_customer(self.other, 'OTHER'), self.product, 1, timezone.now())
        for order_id in ['', draft.pk, foreign.pk]:
            response = self.client.post(f'/samples/{self.sample.pk}/outcome/',
                {'outcome': 'PURCHASED', 'response': 'Tetap tersimpan saat error', 'order_id': order_id},
                HTTP_X_ONEFLOW_PAGE='1')
            self.assertEqual(response.status_code, 400)
            fields = {f['key']: f for f in response.json()['data']['outcome_form']['fields']}
            self.assertTrue(fields['order_id']['errors'])
            self.assertEqual(fields['response']['value'], 'Tetap tersimpan saat error')
        self.sample.refresh_from_db()
        self.assertIsNone(self.sample.order_id)
        self.assertEqual(self.sample.followups.count(), 0)

    def test_closed_evaluation_cannot_accidentally_create_more_tasks(self):
        record_followup(self.sales, self.sample.pk, 'Belum cocok', 'NOT_INTERESTED')
        response = self.client.post(f'/samples/{self.sample.pk}/schedule/',
            {'followup_date': timezone.localdate()}, HTTP_X_ONEFLOW_PAGE='1')
        self.assertGreaterEqual(response.status_code, 400)
        self.assertFalse(Activity.objects.exists())
        record_followup(self.sales, self.sample.pk, 'Ingin mencoba kembali', 'EVALUATING')
        schedule_followup(self.sales, self.sample.pk, timezone.localdate())
        self.assertEqual(Activity.objects.count(), 1)

    def test_role_boundaries_apply_to_new_evaluation_and_customer_contracts(self):
        self.client.force_login(self.warehouse)
        data = self.page(f'/samples/{self.sample.pk}/?tab=evaluation').json()['data']
        self.assertNotIn('evaluation', data)
        self.assertNotIn('can_create_order', data)
        self.client.force_login(self.other)
        self.assertEqual(self.page(f'/customers/{self.customer.pk}/?tab=samples').status_code, 404)
        self.assertEqual(self.page(f'/samples/{self.sample.pk}/').status_code, 404)
        self.client.force_login(self.manager)
        self.assertEqual(len(self.page(f'/customers/{self.customer.pk}/?tab=samples').json()['data']['samples']), 1)

    def test_order_wizard_keeps_sample_return_context_and_does_not_auto_link(self):
        back = f'/samples/{self.sample.pk}/?tab=evaluation'
        from urllib.parse import urlencode
        page = self.page('/orders/new/?' + urlencode({'customer': self.customer.pk, 'return_to': back})).json()['data']
        self.assertEqual(page['back_url'], back)
        self.assertEqual(next(f['value'] for f in page['form']['fields'] if f['key'] == 'customer'), str(self.customer.pk))
        self.sample.refresh_from_db()
        self.assertIsNone(self.sample.order_id)
