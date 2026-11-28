from datetime import date, timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from crm import models
from crm.services import inventory
from crm.tests.factories import make_customer, make_order, make_product, make_user

PAGE = {'HTTP_X_ONEFLOW_PAGE': '1'}


def queued(key, based_on=None):
    headers = {**PAGE, 'HTTP_X_ONEFLOW_KEY': key, 'HTTP_X_ONEFLOW_QUEUED': '1'}
    if based_on:
        headers['HTTP_X_ONEFLOW_BASED_ON'] = based_on.isoformat()
    return headers


class OfflineSubmissionTests(TestCase):
    def setUp(self):
        models.StockPolicy.objects.create(pk=1, min_shelf_life_days=0)
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.endri = make_user('endri', 'SALES')
        self.monic = make_user('monic', 'SALES')
        self.product = make_product(on_hand=0)
        inventory.receive_stock(self.warehouse, self.product.id, 10, 'Masuk', uuid4(), batch_code='LOT-A',
                                received_date=date.today(), expiry_date=date.today() + timedelta(days=400))

    def note(self, customer, key):
        return self.client.post(
            f'/customers/{customer.id}/activities/new/',
            {'kind': 'INTERACTION', 'stage': 'INTERESTED', 'status': 'DONE', 'result': 'Minta penawaran', 'followup_date': date.today() + timedelta(days=2)},
            **queued(key))

    def test_a_retried_write_runs_once(self):
        customer = make_customer(self.endri)
        self.client.force_login(self.endri)
        key = str(uuid4())
        first = self.note(customer, key)
        self.assertLess(first.status_code, 400)
        recorded = models.Activity.objects.filter(customer=customer).count()
        self.assertGreater(recorded, 0)
        again = self.note(customer, key)
        self.assertEqual(again.json()['oneflow_replay'], True)
        self.assertEqual(again.json()['ok'], True)
        self.assertEqual(models.Activity.objects.filter(customer=customer).count(), recorded)

    def test_a_refused_write_is_remembered_with_its_reason(self):
        customer = make_customer(self.endri)
        self.client.force_login(self.endri)
        key = str(uuid4())
        response = self.client.post(f'/customers/{customer.id}/activities/new/', {'kind': 'INTERACTION'}, **queued(key))
        self.assertEqual(response.status_code, 400)
        again = self.client.post(f'/customers/{customer.id}/activities/new/', {'kind': 'INTERACTION'}, **queued(key))
        self.assertEqual(again.json()['ok'], False)
        self.assertTrue(again.json()['message'])

    def test_a_key_belongs_to_the_user_who_sent_it(self):
        customer = make_customer(self.endri)
        self.client.force_login(self.endri)
        key = str(uuid4())
        self.note(customer, key)
        self.client.force_login(self.monic)
        response = self.note(customer, key)
        self.assertEqual(response.status_code, 409)

    def test_two_offline_orders_for_the_same_stock_first_arrival_wins(self):
        first = make_order(self.endri, make_customer(self.endri, 'CUS001'), self.product, 8)
        second = make_order(self.monic, make_customer(self.monic, 'CUS002'), self.product, 8)
        # Monic wrote hers first on her phone, but Endri's reaches the server first.
        self.client.force_login(self.endri)
        self.assertLess(self.client.post(f'/orders/{first.id}/confirm/', {}, **queued(str(uuid4()))).status_code, 400)
        self.client.force_login(self.monic)
        key = str(uuid4())
        lost = self.client.post(f'/orders/{second.id}/confirm/', {}, **queued(key))
        self.assertGreaterEqual(lost.status_code, 400)
        first.refresh_from_db(), second.refresh_from_db()
        self.assertEqual(first.status, models.Order.Status.CONFIRMED)
        self.assertEqual(second.status, models.Order.Status.DRAFT)
        self.assertEqual(models.BatchAllocation.objects.filter(line__order=second).count(), 0)
        # The loser keeps her order and is told why.
        replay = self.client.post(f'/orders/{second.id}/confirm/', {}, **queued(key)).json()
        self.assertEqual(replay['ok'], False)
        self.assertTrue(replay['message'])

    def test_a_stale_stock_count_is_not_applied(self):
        counted_at = timezone.now() - timedelta(hours=2)
        self.client.force_login(self.warehouse)
        response = self.client.post(
            f'/stock/{self.product.id}/reconcile/',
            {'counted_quantity': 3, 'reason': 'Hitung fisik', 'operation_id': str(uuid4())},
            **queued(str(uuid4()), counted_at))
        self.assertEqual(response.status_code, 409)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 10)

    def test_a_fresh_stock_count_is_applied(self):
        self.client.force_login(self.warehouse)
        response = self.client.post(
            f'/stock/{self.product.id}/reconcile/',
            {'counted_quantity': 3, 'reason': 'Hitung fisik', 'operation_id': str(uuid4())},
            **queued(str(uuid4()), timezone.now()))
        self.assertLess(response.status_code, 400)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.on_hand, 3)

    def test_a_setting_changed_by_someone_else_is_not_overwritten(self):
        manager = make_user('manager', 'MANAGER')
        opened_at = timezone.now() - timedelta(hours=1)
        models.StockPolicy.objects.filter(pk=1).update(min_shelf_life_days=90, updated_at=timezone.now())
        self.client.force_login(manager)
        response = self.client.post('/stock/policy/', {'min_shelf_life_days': 30}, **queued(str(uuid4()), opened_at))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(models.StockPolicy.objects.get(pk=1).min_shelf_life_days, 90)

    def test_sync_token_names_the_signed_in_user(self):
        self.assertIsNone(self.client.get('/sync/token/').json()['user'])
        self.client.force_login(self.endri)
        data = self.client.get('/sync/token/').json()
        self.assertEqual(data['user'], str(self.endri.pk))
        self.assertTrue(data['csrf'])

    def test_service_worker_and_manifest_are_served(self):
        worker = self.client.get('/sw.js')
        self.assertEqual(worker.status_code, 200)
        self.assertIn('const PRECACHE', worker.content.decode())
        self.assertEqual(self.client.get('/manifest.webmanifest').json()['display'], 'standalone')
