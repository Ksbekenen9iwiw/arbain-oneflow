"""Run locally by the Render account owner; never place DB credentials in chat."""
import getpass
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


def main():
    root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(root))
    url = getpass.getpass('External Database URL Render (input disembunyikan): ').strip()
    parsed = urlparse(url)
    if parsed.scheme not in {'postgres', 'postgresql'} or not parsed.hostname or not parsed.path.strip('/'):
        raise SystemExit('URL PostgreSQL tidak valid; tidak ada perubahan.')
    print(f'Target: host={parsed.hostname}, database={parsed.path.lstrip("/")}')
    print('Seluruh data CRM akan diganti. Akun/password tetap. Backup dibuat lebih dahulu.')
    print('Pastikan ini database DEMO OneFlow dan aktivitas tulis sudah dihentikan.')
    if input('Ketik RESET DEMO untuk menjalankan: ').strip() != 'RESET DEMO':
        raise SystemExit('Dibatalkan; tidak ada perubahan.')
    os.environ['DATABASE_URL'] = url
    os.environ['PGSSLMODE'] = 'require'
    os.environ['ONEFLOW_DEMO'] = '1'
    os.environ['DJANGO_SETTINGS_MODULE'] = 'oneflow.settings'
    import django
    django.setup()
    from django.core.management import call_command
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor
    # Never migrate an unidentified or uninitialized remote database implicitly.
    executor = MigrationExecutor(connection)
    if executor.migration_plan(executor.loader.graph.leaf_nodes()):
        raise SystemExit('Migrasi belum lengkap. Deploy/migrate aplikasi lebih dahulu; reseed dibatalkan.')
    from crm.models import Customer
    if not Customer.objects.exists():
        raise SystemExit('Database CRM kosong; pastikan target benar dan gunakan seed_realistic untuk instalasi baru.')
    backup = root / 'runtime' / 'backups' / f'before-reseed-{datetime.now():%Y%m%d-%H%M%S-%f}.json'
    call_command('reseed_realistic', confirm_demo_reset=True, backup=str(backup))


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit('\nDibatalkan.')
