"""Explicit demo replacement with a private, restorable pre-change fixture."""
import os
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from crm.management.commands.seed_realistic import Command as SeedCommand, validate_accounts


# Child-first for PROTECT foreign keys. Auth users/groups are never removed.
DELETE_ORDER = ['ConsignmentVisitEntry', 'ConsignmentStock', 'ProductCarryDirective', 'RawMaterial',
                'BatchSwap', 'BatchAllocation', 'SampleAllocation', 'SampleFollowUp',
                'ActionDecision', 'StockMovement', 'SampleRequestLine', 'SampleRequest',
                'OrderLine', 'Order', 'Activity', 'PurchaseOrder', 'ProductSupplySetting',
                'SamplePolicy', 'SalesTarget', 'InventoryBalance', 'StockBatch', 'Product', 'Customer']


class Command(BaseCommand):
    help = 'Ganti seluruh data CRM demo secara atomik; backup wajib, akun/password tetap.'

    def add_arguments(self, parser):
        SeedCommand().add_arguments(parser)
        parser.add_argument('--confirm-demo-reset', action='store_true')
        parser.add_argument('--backup', required=True, help='Path baru untuk fixture JSON privat sebelum perubahan.')

    def handle(self, *args, **options):
        if not settings.ONEFLOW_DEMO or not options['confirm_demo_reset']:
            raise CommandError('Perlu ONEFLOW_DEMO=1 dan --confirm-demo-reset; hanya gunakan pada database demo.')
        validate_accounts()
        models = {model.__name__: model for model in apps.get_app_config('crm').get_models()}
        if set(models) != set(DELETE_ORDER):
            raise CommandError('Skema CRM berubah; urutan reset harus ditinjau sebelum berjalan.')
        backup = Path(options['backup']).expanduser().resolve()
        backup.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError as error:
            raise CommandError('Backup sudah ada; pilih nama baru. Tidak ada perubahan.') from error
        # Run offline/in maintenance mode. SQLite IMMEDIATE and PostgreSQL table
        # locks prevent concurrent CRM writes between snapshot and replacement.
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as stream, transaction.atomic():
                if connection.vendor == 'postgresql':
                    tables = sorted(model._meta.db_table for model in models.values())
                    quoted = ', '.join(connection.ops.quote_name(table) for table in tables)
                    with connection.cursor() as cursor:
                        cursor.execute("SET LOCAL lock_timeout = '10s'")
                        cursor.execute(f'LOCK TABLE {quoted} IN ACCESS EXCLUSIVE MODE')
                call_command('dumpdata', 'auth.group', 'auth.user', 'crm', natural_foreign=True,
                             natural_primary=True, indent=2, stdout=stream)
                stream.flush()
                os.fsync(stream.fileno())
                models['Activity'].objects.update(followup_of=None)
                for name in DELETE_ORDER:
                    models[name].objects.all().delete()
                call_command('seed_realistic', as_of=options['as_of'], seed=options['seed'],
                             show_demo_credentials=options['show_demo_credentials'], stdout=self.stdout)
        except Exception as error:
            # Retain even an incomplete snapshot for diagnosis; transaction rolls
            # back all CRM writes. Do not expose connection strings in errors.
            raise CommandError(f'Reseed gagal; perubahan database dibatalkan. Periksa backup {backup}. {error}') from error
        self.stdout.write(self.style.SUCCESS(f'Reseed selesai. Backup sebelum perubahan: {backup}'))
