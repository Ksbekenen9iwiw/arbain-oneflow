"""Public judging credentials supplied for the demo workspace, never for live data.

Only returned on the sign-in page when ONEFLOW_DEMO is enabled. Override with
ONEFLOW_DEMO_ACCOUNTS JSON when a demo installation uses different credentials.
This module does not create accounts or change passwords.
"""
import json
import os
from functools import lru_cache
from django.contrib.auth.hashers import check_password
from django.contrib.auth.models import User
from django.conf import settings

JUDGING_ACCOUNTS = [
    {'username': 'nadia', 'password': 'zn_cvCjg9jHDpq5gmfen8hFq', 'name': 'Nadia', 'role': 'Sales', 'description': 'Pelanggan, pembelian ulang, pesanan, dan pengajuan sampel.'},
    {'username': 'rafi', 'password': 'eAI4R-k9G9GzZFVYO1U1POsI', 'name': 'Rafi', 'role': 'Sales', 'description': 'Coba cakupan pelanggan milik sales yang berbeda.'},
    {'username': 'gudang', 'password': '6ZspPfmGtBIcQT_kPMBYND-K', 'name': 'Dewi', 'role': 'Gudang', 'description': 'Batch FEFO, penerimaan stok, pengiriman pesanan dan sampel.'},
    {'username': 'manajer', 'password': '1SEJlbK1fDURRIxi3ws8yLIA', 'name': 'Arif', 'role': 'Manajer', 'description': 'Tinjau sampel, rencana pengadaan, dan capaian seluruh tim.'},
]


@lru_cache(maxsize=32)
def _matches(password, encoded):
    return check_password(password, encoded)


def demo_accounts():
    if not settings.ONEFLOW_DEMO:
        return []
    raw = os.environ.get('ONEFLOW_DEMO_ACCOUNTS')
    try:
        rows = json.loads(raw) if raw is not None else JUDGING_ACCOUNTS
        if not isinstance(rows, list):
            return []
        accounts = [{key: str(row.get(key, '')) for key in ('username', 'password', 'name', 'role', 'description')}
                for row in rows if isinstance(row, dict) and row.get('username') and row.get('password')]
    except (ValueError, TypeError):
        return []
    users = {user.username: user for user in User.objects.filter(
        username__in=[row['username'] for row in accounts], is_active=True,
        is_staff=False, is_superuser=False)}
    # Never advertise credentials that do not work on this installation.
    return [row for row in accounts if row['username'] in users
            and _matches(row['password'], users[row['username']].password)]
