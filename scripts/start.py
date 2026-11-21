"""Titik masuk container Render: migrasi, seed sekali, lalu jalankan gunicorn."""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def django(*args, check=True):
    return subprocess.run([sys.executable, os.path.join(ROOT, 'manage.py'), *args], cwd=ROOT, check=check).returncode


django('migrate', '--noinput')
if os.environ.setdefault('ONEFLOW_DEMO', '0') == '1':
    if django('shell', '-c', 'from crm.models import Customer; raise SystemExit(0 if Customer.objects.exists() else 1)', check=False) != 0:
        django('seed_demo', '--show-demo-credentials')
    django('configure_judging_accounts', '--confirm-demo-reset', check=False)

os.execvp('gunicorn', ['gunicorn', 'oneflow.wsgi:application',
                      '--bind', f"0.0.0.0:{os.environ.get('PORT', '8000')}",
                      '--workers', os.environ.get('WEB_CONCURRENCY', '2'),
                      '--timeout', '60',
                      '--access-logfile', '-'])
