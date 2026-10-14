from datetime import timedelta
from django.test import TestCase, override_settings
from django.utils import timezone
from crm.models import Activity
from crm.selectors import dashboard_metrics
from crm.services.actions import list_actions
from crm.services.orders import confirm_order
from crm.tests.factories import make_user, make_customer, make_product, make_order

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class RoleDashboardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('role-sales', 'SALES')
        cls.other = make_user('role-other', 'SALES')
        cls.manager = make_user('role-manager', 'MANAGER')
        cls.warehouse = make_user('role-warehouse', 'WAREHOUSE')
        cls.customer = make_customer(cls.sales)
        cls.product = make_product(on_hand=30)

    def setUp(self):
        self.today = timezone.localdate()
        self.activity = Activity.objects.create(customer=self.customer, sales=self.sales, kind='FOLLOWUP', followup_date=self.today-timedelta(days=1), note='Hubungi pelanggan')
        self.client.force_login(self.sales)
        self.key = list_actions(self.sales, self.today)[0].key

    def decision(self, outcome, **extra):
        return self.client.post('/actions/decision/?return_to=%2F%3Fview%3Drecommendations', {'key':self.key, 'outcome':outcome, 'note':'Hasil uji', **extra}, follow=True, HTTP_X_ONEFLOW_PAGE='1')

    def test_snooze_keeps_activity_due_and_visible_until_reminder_returns(self):
        next_day = self.today+timedelta(days=2)
        response = self.decision('SNOOZED', next_date=next_day)
        self.assertEqual(response.status_code, 200)
        self.activity.refresh_from_db()
        self.assertEqual(self.activity.status, 'PLANNED')
        self.assertEqual(self.activity.followup_date, self.today-timedelta(days=1))
        self.assertEqual(list_actions(self.sales, self.today), [])
        self.assertEqual(list_actions(self.sales, next_day)[0].key, self.key)
        payload = response.json()
        self.assertIn(str(self.activity.id), [a['id'] for a in payload['data']['agenda']])
        self.assertIn('Jadwal dan status aktivitas tidak berubah', payload['messages'][0]['text'])

    def test_close_does_not_complete_activity_or_change_order_stock(self):
        order = make_order(self.sales, self.customer, self.product, 2)
        response = self.decision('DISMISSED')
        self.activity.refresh_from_db(); order.refresh_from_db(); self.product.balance.refresh_from_db()
        self.assertEqual(self.activity.status, 'PLANNED')
        self.assertEqual(order.status, 'DRAFT')
        self.assertEqual(self.product.balance.on_hand, 30)
        self.assertEqual(list_actions(self.sales, self.today), [])
        self.assertIn('Aktivitas tidak dibatalkan atau diselesaikan', response.json()['messages'][0]['text'])

    def test_done_with_linked_order_completes_only_activity(self):
        order = make_order(self.sales, self.customer, self.product, 2)
        response = self.decision('DONE', order_id=order.id)
        self.activity.refresh_from_db(); order.refresh_from_db()
        self.assertEqual(self.activity.status, 'DONE')
        self.assertEqual(order.status, 'DRAFT')
        self.assertEqual(self.product.balance.reserved, 0)
        self.assertIn('Aktivitas tindak lanjut ditandai selesai', response.json()['messages'][0]['text'])

    def test_manager_rows_match_scope_and_current_activity_owner(self):
        self.activity.sales = self.other; self.activity.save()
        order = make_order(self.sales, self.customer, self.product, 2)
        confirm_order(self.sales, order.id)
        metrics = dashboard_metrics(self.manager, self.today)
        rows = {r['sales_id']:r for r in metrics['sales_rows']}
        self.assertEqual(rows[self.sales.id]['overdue_activity_count'], 1)
        self.assertEqual(rows[self.other.id]['overdue_activity_count'], 0)
        self.assertEqual(rows[self.sales.id]['pending_shipment_count'], 1)
        self.assertEqual(dashboard_metrics(self.manager,self.today,self.other.id)['pending_shipment_count'], 0)
        self.assertEqual(len(dashboard_metrics(self.sales,self.today)['sales_rows']),1)

    def test_warehouse_attention_prioritizes_conflicts_and_excludes_inactive_low(self):
        conflict = make_product('ZZ-CONFLICT', on_hand=2)
        conflict.is_active=False; conflict.save()
        conflict.balance.reserved=3; conflict.balance.save()
        low = make_product('AA-LOW', on_hand=2)
        inactive = make_product('AA-INACTIVE', on_hand=1)
        inactive.is_active=False; inactive.save()
        self.client.force_login(self.warehouse)
        data = self.client.get('/?view=activities',HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertEqual([p['id'] for p in data['stock_attention']], [str(conflict.id), str(low.id)])
        self.assertNotIn('agenda',data)
        self.assertEqual(data['metrics']['sales_rows'],[])
        self.client.force_login(self.sales)
        self.assertNotIn('stock_attention', self.client.get('/',HTTP_X_ONEFLOW_PAGE='1').json()['data'])
