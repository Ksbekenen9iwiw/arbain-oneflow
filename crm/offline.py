"""Offline support: idempotent writes, the service worker and the web manifest.

A device that is offline never changes stock. It keeps the write and sends it
later with ``X-OneFlow-Key``. The server runs each key once, in arrival order,
and answers a repeat with the recorded outcome instead of running it again.
"""
import json
import re
from hashlib import sha256
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from crm.models import (
    AssistantPolicy, ClientSubmission, Product, ProductSupplySetting, SamplePolicy, StockMovement, StockPolicy,
)

KEY = re.compile(r'[A-Za-z0-9-]{16,64}')
# A worker that died mid-request must not block the key forever.
STUCK_AFTER = timedelta(seconds=60)


def _outcome(ok, message='', url='', status=200):
    return JsonResponse({'oneflow_replay': True, 'ok': ok, 'message': message, 'url': url}, status=status)


def _messages(payload):
    """Human-readable reasons from a rejected page payload."""
    data = payload.get('data') or {}
    found = []
    error = data.get('error')
    if isinstance(error, dict) and error.get('message'):
        found.append(error['message'])
    for value in data.values():
        if isinstance(value, dict) and 'fields' in value and 'errors' in value:
            found += value['errors']
            for field in value['fields']:
                found += [f"{field.get('label') or field.get('name')}: {text}" for text in field.get('errors', [])]
    found += [m['text'] for m in payload.get('messages', []) if m.get('type') in {'error', 'warning'}]
    return ' '.join(dict.fromkeys(str(text) for text in found if text))


class OfflineSubmissions:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = request.headers.get('X-OneFlow-Key', '')
        user = getattr(request, 'user', None)
        if request.method != 'POST' or not KEY.fullmatch(key) or not (user and user.is_authenticated):
            return self.get_response(request)
        ClientSubmission.objects.filter(
            key=key, completed_at__isnull=True, created_at__lt=timezone.now() - STUCK_AFTER,
        ).delete()
        try:
            with transaction.atomic():
                row = ClientSubmission.objects.create(key=key, user=user, path=request.path[:300])
        except IntegrityError:
            row = ClientSubmission.objects.filter(key=key).first()
            if row is None or row.user_id != user.id or row.completed_at is None:
                response = _outcome(None, 'Kiriman ini sedang diproses. Coba lagi sebentar.', status=409)
                response['Retry-After'] = '5'
                return response
            return _outcome(row.ok, row.message, row.result_url)
        request.oneflow_submission = row
        try:
            response = self.get_response(request)
        except Exception:
            row.delete()
            raise
        status = response.status_code
        if status < 400:
            row.ok, row.result_url = True, (response.get('Location') or '')[:300]
        elif status < 500 and 'application/json' in response.get('Content-Type', ''):
            payload = json.loads(response.content)
            row.ok = False
            row.message = payload.get('message') or _messages(payload) or 'Ditolak server. Buka halamannya untuk memeriksa.'
        else:
            # Outcome unknown (server error): let the device try again.
            row.delete()
            return response
        row.completed_at = timezone.now()
        row.save()
        return response

    def process_view(self, request, view_func, view_args, view_kwargs):
        """A stock count made against old figures is not applied blindly."""
        if not hasattr(request, 'oneflow_submission') or request.headers.get('X-OneFlow-Queued') != '1':
            return None
        based_on = parse_datetime(request.headers.get('X-OneFlow-Based-On', ''))
        if based_on is None or timezone.is_naive(based_on):
            return None
        name = request.resolver_match.url_name
        if name == 'stock_reconcile' and StockMovement.objects.filter(
            product_id=view_kwargs['product_id'], created_at__gt=based_on,
        ).exists():
            return JsonResponse({'message': (
                'Stok produk ini berubah setelah hitungan dibuat. Koreksi tidak diterapkan; '
                'hitung ulang dari angka terbaru.'
            )}, status=409)
        # Settings one person edits while another already saved: never overwrite silently.
        edited = {
            'product_edit': lambda: Product.objects.filter(pk=view_kwargs['product_id']),
            'supply_settings': lambda: ProductSupplySetting.objects.filter(product_id=view_kwargs['product_id']),
            'stock_policy': lambda: StockPolicy.objects.filter(pk=1),
            'sample_policy': lambda: SamplePolicy.objects.all(),
            'assistant_policy': lambda: AssistantPolicy.objects.filter(pk=1),
        }.get(name)
        if edited and edited().filter(updated_at__gt=based_on).exists():
            return JsonResponse({'message': (
                'Data ini sudah diubah orang lain setelah kamu membukanya. Perubahanmu tidak diterapkan; '
                'buka halamannya untuk melihat versi terbaru lalu ubah lagi bila masih perlu.'
            )}, status=409)
        return None


def sync_token(request):
    """Who is signed in, and a fresh CSRF token, before a device sends its queue."""
    user = request.user
    response = JsonResponse({
        'user': str(user.pk) if user.is_authenticated else None,
        'csrf': get_token(request) if user.is_authenticated else '',
    })
    response['Cache-Control'] = 'no-store'
    return response


def service_worker(request):
    from crm.frontend import assets
    built = assets()
    files = [path for path in [built['js'], *built['css'], *built['preload']] if path]
    source = (settings.BASE_DIR / 'crm/static/crm/sw.js').read_text(encoding='utf-8')
    version = sha256((source + ''.join(files)).encode()).hexdigest()[:12]
    body = f'const PRECACHE = {json.dumps(files)};\nconst VERSION = {json.dumps(version)};\n{source}'
    response = HttpResponse(body, content_type='application/javascript')
    response['Cache-Control'] = 'no-cache'
    response['Service-Worker-Allowed'] = '/'
    return response


def manifest(request):
    icon = settings.STATIC_URL + 'crm/icon.svg'
    response = JsonResponse({
        'name': 'Arbain OneFlow', 'short_name': 'OneFlow', 'lang': 'id',
        'start_url': '/', 'scope': '/', 'display': 'standalone',
        'background_color': '#faf7f2', 'theme_color': '#b45f06',
        'icons': [{'src': icon, 'sizes': 'any', 'type': 'image/svg+xml', 'purpose': 'any maskable'}],
    })
    response['Content-Type'] = 'application/manifest+json'
    return response
