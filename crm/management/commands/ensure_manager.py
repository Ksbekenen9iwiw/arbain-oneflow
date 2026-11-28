"""Create the first Manager from server settings, so no one needs a server shell."""
import os

from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create a Manager from ONEFLOW_ADMIN_USERNAME and ONEFLOW_ADMIN_PASSWORD when no active Manager exists.'

    def handle(self, *args, **options):
        username = os.environ.get('ONEFLOW_ADMIN_USERNAME', '').strip().lower()
        password = os.environ.get('ONEFLOW_ADMIN_PASSWORD', '')
        if not username or not password:
            return
        if User.objects.filter(is_active=True, groups__name='MANAGER').exists():
            self.stdout.write('Manajer sudah ada; tidak ada yang diubah.')
            return
        if User.objects.filter(username__iexact=username).exists():
            self.stdout.write('Nama pengguna itu sudah dipakai akun lain; tidak ada yang diubah.')
            return
        user = User.objects.create_user(username, password=password, first_name=os.environ.get('ONEFLOW_ADMIN_NAME', username))
        user.groups.add(Group.objects.get_or_create(name='MANAGER')[0])
        self.stdout.write(f'Manajer pertama dibuat: {username}')
