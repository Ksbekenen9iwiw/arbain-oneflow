import json
import os
import subprocess
import sys
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db.models import Count
from django.test import TestCase, override_settings
from django.utils import timezone

from crm.models import Customer, Order, Product, SampleRequest, StockMovement
from crm.synthetic_validation import validate_synthetic


class RealisticSeedTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_realistic', as_of='2026-11-06', stdout=StringIO())

    def snapshot(self):
        return list(Order.objects.order_by('created_at', 'pk').values_list(
            'customer__code', 'status', 'total_rupiah', 'created_at', 'confirmed_at', 'shipped_at'))

    def test_business_ledger_and_realistic_coverage(self):
        validate_synthetic()
        self.assertEqual(Customer.objects.count(), 48)

        self.assertEqual(Customer.objects.filter(is_active=False).count(), 4)
        self.assertEqual(Product.objects.count(), 8)
        self.assertGreater(Order.objects.count(), 300)
        self.assertEqual(set(Order.objects.values_list('status', flat=True)), {'DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED'})
        self.assertGreater(Order.objects.annotate(n=Count('lines')).filter(n__gt=1).count(), 100)
        self.assertEqual(SampleRequest.objects.filter(outcome='PURCHASED').count(), 2)
        self.assertTrue(StockMovement.objects.filter(created_at__month=11).exists())
        self.assertTrue(StockMovement.objects.filter(created_at__month=6).exists())

    def test_seed_refuses_populated_database(self):
        before = self.snapshot()
        with self.assertRaises(CommandError):
            call_command('seed_realistic', stdout=StringIO())
        self.assertEqual(self.snapshot(), before)

    def test_reset_preserves_passwords_and_is_repeatable(self):
        before = self.snapshot()
        accounts = list(User.objects.order_by('pk').values_list('pk', 'username', 'password'))
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'backup.json'
            call_command('reseed_realistic', as_of='2026-11-06', confirm_demo_reset=True,
                         backup=str(path), stdout=StringIO())
            fixture = json.loads(path.read_text())
            self.assertEqual(sum(row['model'] == 'crm.order' for row in fixture), len(before))
            if os.name == 'posix':
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(list(User.objects.order_by('pk').values_list('pk', 'username', 'password')), accounts)
        validate_synthetic()

    def test_failed_reset_rolls_back_old_data_and_keeps_backup(self):
        before = self.snapshot()
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'backup.json'
            with patch('crm.management.commands.seed_realistic.Simulation.run', side_effect=RuntimeError('simulated failure')):
                with self.assertRaises(CommandError):
                    call_command('reseed_realistic', confirm_demo_reset=True, backup=str(path), stdout=StringIO())
            self.assertTrue(json.loads(path.read_text()))
        self.assertEqual(self.snapshot(), before)
        validate_synthetic()

    def test_reset_requires_explicit_demo_confirmation_and_new_backup(self):
        before = self.snapshot()
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'backup.json'
            with self.assertRaises(CommandError):
                call_command('reseed_realistic', backup=str(path), stdout=StringIO())
            self.assertFalse(path.exists())
            with override_settings(ONEFLOW_DEMO=False):
                with self.assertRaises(CommandError):
                    call_command('reseed_realistic', confirm_demo_reset=True, backup=str(path), stdout=StringIO())
            self.assertFalse(path.exists())
            path.write_text('do not overwrite')
            with self.assertRaises(CommandError):
                call_command('reseed_realistic', confirm_demo_reset=True, backup=str(path), stdout=StringIO())
            self.assertEqual(path.read_text(), 'do not overwrite')
        self.assertEqual(self.snapshot(), before)

    def test_backup_restores_into_a_fresh_migrated_database(self):
        with TemporaryDirectory() as directory:
            backup = Path(directory) / 'backup.json'
            call_command('reseed_realistic', confirm_demo_reset=True, backup=str(backup),
                         as_of='2026-11-06', stdout=StringIO())
            env = {**os.environ, 'DATABASE_URL': '', 'ONEFLOW_DB': str(Path(directory) / 'restore.sqlite3')}
            def manage(*args):
                result = subprocess.run([sys.executable, 'manage.py', *args], cwd=settings.BASE_DIR,
                                        env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
            manage('migrate', '--noinput')
            manage('loaddata', str(backup))
            manage('shell', '-c', 'from crm.synthetic_validation import validate_synthetic; validate_synthetic(); '
                   'from crm.models import Customer, Order; assert Customer.objects.count() == 48; assert Order.objects.count() == 335')

    def test_invalid_date_or_conflicting_account_leaves_existing_data(self):
        with self.assertRaises(CommandError):
            call_command('seed_realistic', as_of='0001-01-01', stdout=StringIO())
        User.objects.filter(username='nadia').update(is_superuser=True)
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'backup.json'
            with self.assertRaises(CommandError):
                call_command('reseed_realistic', confirm_demo_reset=True, backup=str(path), stdout=StringIO())
            self.assertFalse(path.exists())
        self.assertEqual(Customer.objects.count(), 48)


class LegacyReseedTests(TestCase):
    def test_replaces_original_demo_with_all_optional_scenarios(self):
        call_command('seed_demo', as_of=timezone.localdate().isoformat(), fefo_demo=True,
                     samples_demo=True, supply_demo=True, reorder_demo=True, stdout=StringIO())
        self.assertEqual(Customer.objects.count(), 12)
        credentials = list(User.objects.order_by('username').values_list('username', 'password'))
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'legacy.json'
            call_command('reseed_realistic', confirm_demo_reset=True, backup=str(path),
                         as_of='2026-11-06', stdout=StringIO())
            snapshot = json.loads(path.read_text())
            self.assertEqual(sum(row['model'] == 'crm.customer' for row in snapshot), 12)
        self.assertEqual(Customer.objects.count(), 48)
        self.assertEqual(Order.objects.count(), 335)
        self.assertEqual(credentials, list(User.objects.order_by('username').values_list('username', 'password')))
        validate_synthetic()
