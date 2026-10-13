from django.contrib.auth.models import Group, User
from django.core.exceptions import PermissionDenied
from django.test import TestCase

from crm.access import role_of
from crm.tests.factories import make_user


class AccessTests(TestCase):
    def test_anonymous_redirects_to_login(self):
        self.assertRedirects(self.client.get('/'), '/login/?next=/', fetch_redirect_response=False)

    def test_login_redirects_today(self):
        make_user('sales', 'SALES')
        response = self.client.post('/login/', {'username': 'sales', 'password': 'test-password-123'})
        self.assertRedirects(response, '/', fetch_redirect_response=False)
        self.assertContains(self.client.get('/'), 'sales')

    def test_logout_requires_post(self):
        self.client.force_login(make_user('sales', 'SALES'))
        self.assertEqual(self.client.get('/logout/').status_code, 405)
        self.assertRedirects(self.client.post('/logout/'), '/login/', fetch_redirect_response=False)
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_invalid_role_is_denied(self):
        user = User.objects.create_user('invalid')
        with self.assertRaises(PermissionDenied):
            role_of(user)
        user.groups.add(Group.objects.get_or_create(name='SALES')[0], Group.objects.get_or_create(name='MANAGER')[0])
        with self.assertRaises(PermissionDenied):
            role_of(user)
        self.client.force_login(user)
        self.assertEqual(self.client.get('/').status_code, 403)

    def test_inactive_user_is_denied(self):
        user = make_user('inactive', 'SALES')
        user.is_active = False
        user.save()
        with self.assertRaises(PermissionDenied):
            role_of(user)

    def test_every_menu_requires_session(self):
        for path in ['/', '/customers/', '/orders/', '/stock/']:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 302)

    def test_disallowed_menu_is_hidden_and_route_denied(self):
        self.client.force_login(make_user('warehouse', 'WAREHOUSE'))
        self.assertNotContains(self.client.get('/'), 'href="/customers/"')
        self.assertEqual(self.client.get('/customers/').status_code, 403)
        self.assertEqual(self.client.get('/orders/new/').status_code, 403)
        self.assertEqual(self.client.post('/targets/', {}).status_code, 403)
