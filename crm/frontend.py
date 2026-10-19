"""Explicit, role-scoped page contracts for the React client.

All mutations still run through the existing Django forms and services.
Large integers travel as decimal strings so JavaScript cannot round money/IDs.
"""
import json
from hashlib import sha256
from dataclasses import asdict
from datetime import date, datetime
from pathlib import Path

from django import forms
from django.conf import settings
from django.contrib.auth.views import LoginView
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UsernameField
from django.core.cache import cache
from django.contrib.messages import get_messages
from django.http import JsonResponse, Http404
from django.core.exceptions import PermissionDenied
from django.utils.deprecation import MiddlewareMixin
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.utils import timezone
from django.utils.cache import patch_vary_headers

from crm.access import role_of
from crm.forms import ActionDecisionForm
from crm.models import Activity, Customer, Order, OrderLine, Product, StockMovement


def person(user):
    return {'id': str(user.pk), 'name': user.get_full_name() or user.username}


def form_data(form):
    fields = []
    for bound in form:
        field, widget = bound.field, bound.field.widget
        value = bound.value()
        kind = getattr(widget, 'input_type', 'text')
        if isinstance(widget, forms.Textarea):
            kind = 'textarea'
        elif isinstance(widget, forms.Select):
            kind = 'select'
        elif isinstance(widget, forms.CheckboxInput):
            kind = 'checkbox'
        if kind in {'date', 'month'} and isinstance(value, (date, datetime)):
            value = value.strftime('%Y-%m' if kind == 'month' else '%Y-%m-%d')
        elif kind == 'password':
            value = ''
        elif kind == 'checkbox':
            value = bool(value)
        else:
            value = widget.format_value(value)
            if isinstance(value, (list, tuple)):
                value = value[0] if value else ''
        fields.append({'name': bound.html_name, 'key': bound.name, 'label': str(bound.label),
                       'type': kind, 'hidden': bound.is_hidden, 'value': value if isinstance(value, bool) else str(value or ''),
                       'required': field.required, 'help': str(field.help_text), 'errors': [str(e) for e in bound.errors],
                       'min': str(field.min_value) if isinstance(field, forms.IntegerField) and field.min_value is not None else None,
                       'max': str(field.max_value) if isinstance(field, forms.IntegerField) and field.max_value is not None else None,
                       'choices': [{'value': str(v), 'label': str(label)} for v, label in field.choices] if hasattr(field, 'choices') else []})
    return {'fields': fields, 'errors': [str(e) for e in form.non_field_errors()]}


def encode(value, role):
    if value is None or isinstance(value, (str, bool, float)):
        return value
    if isinstance(value, int):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, forms.BaseForm):
        return form_data(value)
    if isinstance(value, Customer):
        return dict(id=str(value.pk), code=value.code, name=value.name, phone=value.phone,
                    address=value.address, owner=person(value.owner), is_active=value.is_active,
                    summary=encode(getattr(value, "summary", None), role))
    if isinstance(value, Product):
        from crm.stock_workspace import stock_state
        result = dict(id=str(value.pk), sku=value.sku, name=value.name, unit=value.unit,
                      price=str(value.price_rupiah), min_stock=str(value.min_stock), is_active=value.is_active, stock_state=stock_state(value),
                      available=str(value.balance.available), updated_at=encode(value.balance.updated_at, role))
        if role != 'SALES':
            result.update(on_hand=str(value.balance.on_hand), reserved=str(value.balance.reserved))
        return result
    if isinstance(value, Order):
        result = dict(id=str(value.pk), number=f'OF-{value.pk:04d}', customer=encode(value.customer, role),
                      sales=person(value.sales), status=value.status, status_label="Menunggu pengiriman" if value.status == "CONFIRMED" else value.get_status_display(),
                      total=str(value.total_rupiah), cancel_reason=value.cancel_reason)
        if hasattr(value, 'list_lines'):
            result['items'] = [dict(id=str(line.pk), name=line.product.name, sku=line.product.sku,
                                    unit=line.product.unit, quantity=str(line.quantity),
                                    price=str(line.unit_price_rupiah), subtotal=str(line.subtotal_rupiah))
                               for line in value.list_lines]
        for phase in ['created', 'confirmed', 'shipped', 'cancelled']:
            result[phase + '_at'] = encode(getattr(value, phase + '_at'), role)
            if phase != 'created':
                actor = getattr(value, phase + '_by')
                result[phase + '_by'] = person(actor) if actor else None
        return result
    if isinstance(value, OrderLine):
        return dict(id=str(value.pk), product=encode(value.product, role), quantity=str(value.quantity),
                    price=str(value.unit_price_rupiah), subtotal=str(value.subtotal_rupiah))
    if isinstance(value, Activity):
        return dict(id=str(value.pk), customer=encode(value.customer, role), sales=person(value.sales),
                    kind=value.kind, kind_label=value.get_kind_display(), stage=value.get_stage_display(),
                    status=value.status, status_label=value.get_status_display(), note=value.note, result=value.result,
                    scheduled_date=encode(value.scheduled_date, role), followup_date=encode(value.followup_date, role),
                    due=encode(getattr(value, 'due', None), role), created_at=encode(value.created_at, role),
                    completed_at=encode(value.completed_at, role), followup_of_id=str(value.followup_of_id) if value.followup_of_id else None)
    if isinstance(value, StockMovement):
        return dict(id=str(value.pk), product=encode(value.product, role), delta=str(value.delta),
                    kind=value.get_kind_display(), actor=person(value.actor), reason=value.reason,
                    order_id=str(value.order_id) if value.order_id else None,
                    sample_request_id=str(value.sample_request_id) if value.sample_request_id else None,
                    input_quantity=str(value.input_quantity), created_at=encode(value.created_at, role))
    if isinstance(value, dict):
        return {k: encode(v, role) for k, v in value.items()}
    return [encode(item, role) for item in value]


def assets():
    manifest_path = settings.BASE_DIR / 'crm/static/crm/react/.vite/manifest.json'
    if not manifest_path.exists():
        return {'js': '', 'css': [], 'preload': []}
    manifest = json.loads(manifest_path.read_text())
    entry_key = 'frontend/main.tsx'
    prefix = settings.STATIC_URL + 'crm/react/'
    css, preload, visited = [], [], set()

    def visit(key):
        if key in visited:
            return
        visited.add(key)
        chunk = manifest[key]
        for dependency in chunk.get('imports', []):
            visit(dependency)
        for path in chunk.get('css', []):
            if prefix + path not in css:
                css.append(prefix + path)
        if key != entry_key:
            preload.append(prefix + chunk['file'])

    visit(entry_key)
    return {'js': prefix + manifest[entry_key]['file'], 'css': css, 'preload': preload}


def render_page(request, template, context=None, status=200, screen=None):
    context = dict(context or {})
    user = getattr(request, 'user', None)
    try:
        role = role_of(user) if user and user.is_authenticated else None
    except PermissionDenied:
        role = None
    data = {}
    for key, value in context.items():
        if key == 'actions':
            data[key] = [encode(asdict(action), role) for action in value]
        elif key == 'formset':
            data[key] = {'forms': [form_data(form) for form in value],
                         'management': form_data(value.management_form),
                         'errors': [str(error) for error in value.non_form_errors()]}
        elif key == 'error':
            data[key] = {'code': value.code, 'message': value.message}
        elif key not in {'role', 'demo_mode', 'today_date', 'view'}:
            data[key] = encode(value, role)
    if template == 'crm/today.html' and role != 'WAREHOUSE':
        data['action_form_default'] = form_data(ActionDecisionForm())
        data.setdefault('action_form', data['action_form_default'])
    payload = {'screen': screen or Path(template).stem, 'url': request.get_full_path(), 'data': data,
               'role': role, 'user': person(user) if user and user.is_authenticated else None,
               'csrf': get_token(request), 'demo': settings.ONEFLOW_DEMO, 'today': timezone.localdate().isoformat(),
               'messages': [{'text': str(m), 'type': m.tags} for m in get_messages(request)]}
    context.update(frontend_payload=payload, frontend_assets=assets(), role=role,
                   demo_mode=settings.ONEFLOW_DEMO, today_date=timezone.localdate())
    if request.headers.get('X-OneFlow-Page') == '1':
        response = JsonResponse(payload, status=status)
    else:
        response = render(request, template, context, status=status)
    response['Cache-Control'] = 'no-store'
    patch_vary_headers(response, ['Cookie', 'X-OneFlow-Page'])
    return response


class FrontendLoginView(LoginView):
    template_name = 'registration/login.html'

    def post(self, request, *args, **kwargs):
        if request.POST.get('step') != 'username':
            return super().post(request, *args, **kwargs)
        # This deliberate account-discovery step returns no profile or role data.
        # Use the direct peer address, never an untrusted forwarded header.
        key = 'login-lookup:' + sha256(request.META.get('REMOTE_ADDR', '').encode()).hexdigest()
        cache.add(key, 0, timeout=60)
        try:
            attempts = cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=60)
            attempts = 1
        if attempts > 20:
            response = JsonResponse({'message': 'Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi.'}, status=429)
            response['Retry-After'] = '60'
        else:
            try:
                username = UsernameField(max_length=150).clean(request.POST.get('username', ''))
            except forms.ValidationError:
                username = ''
            exists = bool(username) and get_user_model().objects.filter(username=username, is_active=True).exists()
            response = JsonResponse({'username': username} if exists else {
                'message': 'Nama pengguna tidak ditemukan. Periksa kembali atau hubungi admin.'
            }, status=200 if exists else 400)
        response['Cache-Control'] = 'no-store'
        return response

    def render_to_response(self, context, **response_kwargs):
        return render_page(self.request, self.template_name,
                           {'form': context['form'], 'next': context.get('next', '')},
                           status=400 if self.request.method == 'POST' else 200)


def error_page(request, status, title, description):
    return render_page(request, 'crm/frontend_error.html',
                       {'heading': title, 'description': description, 'back_url': '/'}, status=status, screen='http_error')


def permission_denied(request, exception=None):
    return error_page(request, 403, 'Akses terbatas', 'Akun ini tidak memiliki akses ke halaman tersebut.')


def not_found(request, exception=None):
    return error_page(request, 404, 'Halaman tidak ditemukan', 'Data mungkin sudah berubah atau tidak tersedia untuk akun ini.')


def csrf_failure(request, reason=''):
    return error_page(request, 403, 'Sesi formulir kedaluwarsa', 'Muat ulang halaman lalu kirim kembali formulir Anda.')


class FrontendErrors(MiddlewareMixin):
    """Keep domain 403/404 pages in the same UI even with DEBUG enabled."""
    def process_exception(self, request, exception):
        if isinstance(exception, PermissionDenied):
            return permission_denied(request, exception)
        if isinstance(exception, Http404):
            return not_found(request, exception)
        return None

    def process_response(self, request, response):
        # Resolver errors bypass process_exception. Let CommonMiddleware still
        # perform its normal APPEND_SLASH redirect for valid canonical routes.
        if response.status_code == 404 and getattr(request, 'resolver_match', None) is None:
            return not_found(request)
        return response
