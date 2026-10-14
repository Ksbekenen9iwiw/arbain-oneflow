from datetime import timedelta
from urllib.parse import urlencode
from django.test import TestCase, override_settings
from django.utils import timezone
from crm.models import Activity, ActionDecision
from crm.selectors import customer_history
from crm.services.actions import record_action
from crm.services.orders import confirm_order, ship_order
from crm.tests.factories import make_user, make_customer, make_product, make_order

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class CustomerJourneyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('journey-sales', 'SALES')
        cls.other = make_user('journey-other', 'SALES')
        cls.manager = make_user('journey-manager', 'MANAGER')
        cls.warehouse = make_user('journey-warehouse', 'WAREHOUSE')
        cls.customer = make_customer(cls.sales)
        cls.product = make_product(on_hand=30)

    def setUp(self):
        self.client.force_login(self.sales)
        self.headers = {'HTTP_X_ONEFLOW_PAGE':'1'}

    def detail(self):
        return self.client.get(f'/customers/{self.customer.pk}/', **self.headers).json()['data']

    def test_legacy_result_uses_recording_time_without_inventing_completion(self):
        activity = Activity.objects.create(customer=self.customer, sales=self.sales, status='DONE', result='Catatan lama')
        data = self.detail()
        event = data['history'][0]
        self.assertEqual(event['at'], activity.created_at.isoformat())
        self.assertEqual(event['time_label'],'Dicatat')
        self.assertIsNone(data['latest_interaction']['completed_at'])
        activity.refresh_from_db(); self.assertIsNone(activity.completed_at)

    def test_new_interaction_links_followup_and_preserves_detail_context(self):
        back = f'/customers/{self.customer.pk}/?tab=history&history=interactions&return_to=%2Fcustomers%2F%3Fq%3DCUS'
        initial = self.client.get(f'/customers/{self.customer.pk}/activities/new/?intent=done', **self.headers).json()['data']['form']
        self.assertEqual(next(f['value'] for f in initial['fields'] if f['key']=='status'), 'DONE')
        self.assertFalse(Activity.objects.exists())
        response = self.client.post(f'/customers/{self.customer.pk}/activities/new/?'+urlencode({'return_to':back}), {'kind':'INTERACTION','stage':'INTERESTED','status':'DONE','result':'Minta penawaran','followup_date':timezone.localdate()+timedelta(days=2)})
        self.assertEqual(response.url,back)
        done = Activity.objects.get(status='DONE'); planned = Activity.objects.get(status='PLANNED')
        self.assertIsNotNone(done.completed_at)
        self.assertEqual(planned.followup_of_id, done.pk)
        data=self.detail(); event=data['history'][0]
        self.assertEqual(event['activity']['id'],str(done.pk))
        self.assertEqual(event['followups'][0]['id'],str(planned.pk))
        self.assertEqual(data['open_activities'][0]['followup_of_id'],str(done.pk))

    def test_completing_old_activity_becomes_latest_and_retry_cannot_duplicate_followup(self):
        old = Activity.objects.create(customer=self.customer,sales=self.sales,kind='VISIT',scheduled_date=timezone.localdate())
        Activity.objects.filter(pk=old.pk).update(created_at=timezone.now()-timedelta(days=10))
        Activity.objects.create(customer=self.customer,sales=self.sales,status='DONE',result='Catatan sebelumnya',completed_at=timezone.now()-timedelta(days=1))
        payload={'result':'Hasil terbaru','stage':'WON','followup_date':timezone.localdate()+timedelta(days=3)}
        response=self.client.post(f'/activities/{old.pk}/complete/',payload)
        self.assertEqual(response.status_code,302)
        old.refresh_from_db(); first=old.completed_at
        self.assertEqual(self.detail()['latest_interaction']['id'],str(old.pk))
        self.assertEqual(self.detail()['latest_stage'],'Sepakat')
        self.client.post(f'/activities/{old.pk}/complete/',payload)
        old.refresh_from_db(); self.assertEqual(old.completed_at,first)
        self.assertEqual(Activity.objects.filter(followup_of=old).count(),1)

    def test_invalid_completion_does_not_change_history_or_create_followup(self):
        activity=Activity.objects.create(customer=self.customer,sales=self.sales,kind='VISIT',scheduled_date=timezone.localdate())
        response=self.client.post(f'/activities/{activity.pk}/complete/',{'result':'','stage':'WON','followup_date':timezone.localdate()})
        self.assertEqual(response.status_code,400)
        activity.refresh_from_db(); self.assertIsNone(activity.completed_at)
        self.assertEqual(activity.status,'PLANNED'); self.assertFalse(activity.followups.exists())
        self.assertEqual(self.detail()['history'],[])

    def test_recommendation_completion_links_exact_order_and_records_timestamp(self):
        activity=Activity.objects.create(customer=self.customer,sales=self.sales,kind='FOLLOWUP',followup_date=timezone.localdate())
        order=make_order(self.sales,self.customer,self.product,2)
        record_action(self.sales,f'FOLLOWUP:{activity.pk}','DONE','Pelanggan memesan',order_id=order.pk)
        activity.refresh_from_db(); self.assertIsNotNone(activity.completed_at)
        event=next(e for e in self.detail()['history'] if e['category']=='interactions')
        self.assertEqual(event['related_order']['id'],str(order.pk))
        order.refresh_from_db(); self.assertEqual(order.status,'DRAFT')

    def test_history_events_follow_real_order_transitions_and_scoped_access(self):
        order=make_order(self.sales,self.customer,self.product,2)
        confirm_order(self.sales,order.pk); ship_order(self.warehouse,order.pk)
        data=self.detail()
        self.assertEqual({e['phase'] for e in data['history']},{'created','confirmed','shipped'})
        self.assertEqual(data['pending_order_count'],'0')
        self.assertEqual(data['latest_order']['id'],str(order.pk))
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(f'/customers/{self.customer.pk}/').status_code,404)
        self.client.force_login(self.warehouse)
        self.assertEqual(self.client.get(f'/customers/{self.customer.pk}/').status_code,403)

    def test_order_links_cannot_leak_previous_owners_orders_after_transfer(self):
        activity=Activity.objects.create(customer=self.customer,sales=self.sales,status='DONE',result='Riwayat')
        foreign=make_order(self.sales,self.customer,self.product,1)
        ActionDecision.objects.create(key=f'FOLLOWUP:{activity.pk}',customer=self.customer,actor=self.sales,outcome='DONE',order=foreign)
        self.customer.owner=self.other; self.customer.save()
        self.client.force_login(self.other)
        data=self.detail()
        self.assertEqual(data['orders'],[])
        self.assertIsNone(data['history'][0]['related_order'])
        self.client.force_login(self.manager)
        self.assertEqual(self.detail()['latest_order']['id'],str(foreign.pk))

    def test_activity_detail_exposes_only_same_customer_links_and_keeps_return_context(self):
        source = Activity.objects.create(customer=self.customer, sales=self.sales, status='DONE', result='Minta dihubungi kembali')
        followup = Activity.objects.create(customer=self.customer, sales=self.sales, followup_of=source, kind='FOLLOWUP', followup_date=timezone.localdate())
        path = f'/activities/{followup.pk}/complete/?' + urlencode({'return_to':'/?period=30&activity=overdue'})
        response = self.client.get(path, **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['previous_activity']['id'], str(source.pk))
        self.assertEqual(response.json()['data']['back_url'], '/?period=30&activity=overdue')
        done = self.client.get(f'/activities/{source.pk}/complete/', **self.headers).json()['data']
        self.assertEqual(done['activity']['status'], 'DONE')
        self.assertEqual([a['id'] for a in done['followups']], [str(followup.pk)])
        foreign_customer = make_customer(self.other, 'PRIVATE-ACTIVITY')
        foreign = Activity.objects.create(customer=foreign_customer, sales=self.other, status='DONE', result='Private note')
        followup.followup_of = foreign
        followup.save()
        data = self.client.get(path, **self.headers).json()['data']
        self.assertIsNone(data['previous_activity'])
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(path).status_code, 404)
        self.client.force_login(self.warehouse)
        self.assertEqual(self.client.get(path).status_code, 403)

    def test_quick_completion_returns_to_filtered_customer_list(self):
        activity = Activity.objects.create(customer=self.customer, sales=self.sales, status='PLANNED', kind='VISIT')
        back = '/customers/?view=overdue&q=CUS&sort=-next_due'
        path = f'/activities/{activity.pk}/complete/?' + urlencode({'return_to': back})
        self.assertEqual(self.client.get(path, **self.headers).json()['data']['back_url'], back)
        response = self.client.post(path, {'result': 'Pelanggan meminta penawaran', 'stage': 'INTERESTED'})
        self.assertEqual(response.url, back)
        activity.refresh_from_db()
        self.assertEqual(activity.status, 'DONE')
        unsafe = f'/activities/{activity.pk}/complete/?' + urlencode({'return_to': 'https://example.com/'})
        self.assertEqual(self.client.get(unsafe, **self.headers).json()['data']['back_url'], f'/customers/{self.customer.pk}/')
