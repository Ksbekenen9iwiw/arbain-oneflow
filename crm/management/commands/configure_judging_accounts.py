"""Explicitly opt an existing simulation workspace into public judging access."""
from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from crm.access import role_of
from crm.demo_access import JUDGING_ACCOUNTS


class Command(BaseCommand):
    help = 'Setel sandi akun simulasi untuk akses juri; hanya untuk workspace demo.'

    def add_arguments(self, parser):
        parser.add_argument('--confirm-demo-reset', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.ONEFLOW_DEMO or not options['confirm_demo_reset']:
            raise CommandError('Perlu ONEFLOW_DEMO=1 dan --confirm-demo-reset pada database simulasi.')
        expected = {'nadia': 'SALES', 'rafi': 'SALES', 'gudang': 'WAREHOUSE', 'manajer': 'MANAGER'}
        users = {user.username: user for user in User.objects.filter(username__in=expected)}
        for name, role in expected.items():
            user = users.get(name)
            if not user or not user.is_active or user.is_staff or user.is_superuser or role_of(user) != role:
                raise CommandError(f'Akun demo {name} belum tersedia atau tidak sesuai perannya. Tidak ada perubahan.')
        for account in JUDGING_ACCOUNTS:
            user = users[account['username']]
            user.set_password(account['password'])
            user.save(update_fields=['password'])
        self.stdout.write(self.style.SUCCESS('Empat akun demo siap. Akses juri tersedia di halaman masuk.'))
