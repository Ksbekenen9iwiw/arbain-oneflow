import gzip
import json

from django.contrib.auth.models import User
from django.test import TestCase

from crm.tests.factories import make_customer, make_user


class TeamTests(TestCase):
    def setUp(self):
        self.manager, self.sales = make_user('manager', 'MANAGER'), make_user('sales', 'SALES')
        make_customer(self.sales)

    def team(self):
        return self.client.get('/team/', HTTP_X_ONEFLOW_PAGE='1').json()['data']

    def test_only_the_manager_manages_people(self):
        self.client.force_login(self.sales)
        for url in ('/team/', '/team/add/', '/team/backup/'):
            self.assertEqual(self.client.get(url).status_code, 403)
        self.assertEqual(self.client.post(f'/team/{self.manager.pk}/reset/').status_code, 403)
        self.assertEqual(self.client.post(f'/team/{self.manager.pk}/active/').status_code, 403)
        self.assertTrue(User.objects.get(pk=self.manager.pk).is_active)

    def test_add_person_shows_password_once(self):
        self.client.force_login(self.manager)
        self.assertEqual(self.client.post('/team/add/', {'full_name': 'Endri', 'username': 'Sales', 'role': 'SALES'}).status_code, 400)
        self.assertEqual(self.client.post('/team/add/', {'full_name': ' Endri  Saputra ', 'username': 'Endri', 'role': 'WAREHOUSE'}).status_code, 302)
        secret = self.team()['secret']
        self.assertEqual((secret['username'], secret['name'], secret['created']), ('endri', 'Endri Saputra', True))
        self.assertIsNone(self.team()['secret'])
        self.client.logout()
        self.assertTrue(self.client.login(username='endri', password=secret['password']))
        self.assertEqual(self.client.get('/', HTTP_X_ONEFLOW_PAGE='1').status_code, 200)

    def test_reset_and_change_password(self):
        self.client.force_login(self.manager)
        self.client.post(f'/team/{self.sales.pk}/reset/')
        password = self.team()['secret']['password']
        self.client.logout()
        self.assertFalse(self.client.login(username='sales', password='test-password-123'))
        self.assertTrue(self.client.login(username='sales', password=password))
        changed = self.client.post('/account/password/', {'old_password': password, 'new_password1': 'kunci-baru-881', 'new_password2': 'kunci-baru-881'})
        self.assertEqual(changed.status_code, 302)
        # The person stays signed in on this device after changing it.
        self.assertEqual(self.client.get('/', HTTP_X_ONEFLOW_PAGE='1').status_code, 200)
        self.client.logout()
        self.assertTrue(self.client.login(username='sales', password='kunci-baru-881'))

    def test_deactivate_closes_access_and_keeps_data(self):
        self.client.force_login(self.manager)
        self.client.post(f'/team/{self.manager.pk}/active/')
        self.assertTrue(User.objects.get(pk=self.manager.pk).is_active)
        self.client.post(f'/team/{self.sales.pk}/active/')
        self.assertFalse(User.objects.get(pk=self.sales.pk).is_active)
        other = self.client_class()
        self.assertFalse(other.login(username='sales', password='test-password-123'))
        self.client.post(f'/team/{self.sales.pk}/active/')
        self.assertTrue(other.login(username='sales', password='test-password-123'))

    def test_backup_has_data_without_passwords(self):
        self.client.force_login(self.manager)
        response = self.client.get('/team/backup/')
        self.assertIn('oneflow-cadangan-', response['Content-Disposition'])
        records = json.loads(gzip.decompress(response.content))
        users = [r for r in records if r['model'] == 'auth.user']
        self.assertEqual({u['fields']['password'] for u in users}, {''})
        self.assertTrue(any(r['model'] == 'crm.customer' for r in records))
        self.assertNotIn('pbkdf2', gzip.decompress(response.content).decode())

    def test_health_check_needs_no_login(self):
        self.assertEqual(self.client.get('/healthz/').json(), {'ok': True})

    def test_first_manager_comes_from_server_settings(self):
        import os
        from unittest import mock
        from django.core.management import call_command
        env = {'ONEFLOW_ADMIN_USERNAME': 'Pemilik', 'ONEFLOW_ADMIN_PASSWORD': 'kunci-awal-552'}
        with mock.patch.dict(os.environ, env):
            call_command('ensure_manager')
            self.assertFalse(User.objects.filter(username='pemilik').exists())
            User.objects.filter(pk=self.manager.pk).update(is_active=False)
            call_command('ensure_manager')
            call_command('ensure_manager')
        self.assertTrue(self.client.login(username='pemilik', password='kunci-awal-552'))
        self.assertEqual(self.client.get('/team/').status_code, 200)
