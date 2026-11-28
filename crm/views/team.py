"""Work a company without IT staff still has to do: accounts, passwords, backups, health."""
import gzip
import json
import secrets
from io import StringIO

from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.db import connection, transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from crm.access import BUSINESS_ROLES, require_role, role_of
from crm.forms import TeamMemberForm
from crm.views.common import page

ROLE_LABELS = {'SALES': 'Sales', 'WAREHOUSE': 'Gudang', 'MANAGER': 'Manajer'}
# No 0/O, 1/l/I: the password is read aloud or typed from a chat message.
ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def temporary_password():
    return '-'.join(''.join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(3))


def _members():
    return User.objects.filter(groups__name__in=BUSINESS_ROLES).distinct().order_by('-is_active', 'first_name', 'username')


def _hand_over(request, user, password, created):
    # Shown once on the next page, never stored anywhere else.
    request.session['team_secret'] = {'name': user.get_full_name() or user.username, 'username': user.username,
                                      'password': password, 'created': created}


@login_required
@require_GET
def team(request):
    require_role(request.user, {'MANAGER'})
    members = []
    for user in _members().prefetch_related('groups'):
        roles = [g.name for g in user.groups.all() if g.name in BUSINESS_ROLES]
        members.append({
            'id': str(user.pk), 'name': user.get_full_name() or user.username, 'username': user.username,
            'role': ROLE_LABELS.get(roles[0], roles[0]) if len(roles) == 1 else 'Perlu diperbaiki',
            'active': user.is_active, 'is_me': user.pk == request.user.pk,
            'last_login': user.last_login.isoformat() if user.last_login else '',
        })
    response = page(request, 'crm/team.html', {'members': members, 'secret': request.session.pop('team_secret', None)})
    response['Cache-Control'] = 'no-store'
    return response


@login_required
@require_http_methods(['GET', 'POST'])
def team_add(request):
    require_role(request.user, {'MANAGER'})
    form = TeamMemberForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        password = temporary_password()
        with transaction.atomic():
            user = User.objects.create_user(form.cleaned_data['username'], password=password, first_name=form.cleaned_data['full_name'])
            user.groups.add(Group.objects.get_or_create(name=form.cleaned_data['role'])[0])
        _hand_over(request, user, password, True)
        return redirect('/team/')
    return page(request, 'crm/form.html', {
        'form': form, 'heading': 'Tambah pengguna', 'submit_label': 'Buat akun', 'back_url': '/team/',
        'help_text': 'OneFlow membuat password sementara dan menampilkannya sekali setelah akun dibuat. Minta pengguna menggantinya di menu Ganti password.',
    }, status=400 if request.method == 'POST' else 200)


@login_required
@require_POST
def team_reset(request, user_id):
    require_role(request.user, {'MANAGER'})
    user = get_object_or_404(_members(), pk=user_id)
    password = temporary_password()
    user.set_password(password)
    user.save(update_fields=['password'])
    if user.pk == request.user.pk:
        update_session_auth_hash(request, user)
    _hand_over(request, user, password, False)
    return redirect('/team/')


@login_required
@require_POST
def team_active(request, user_id):
    require_role(request.user, {'MANAGER'})
    with transaction.atomic():
        user = get_object_or_404(_members().select_for_update(), pk=user_id)
        if user.is_active:
            if user.pk == request.user.pk:
                messages.error(request, 'Kamu tidak bisa menonaktifkan akunmu sendiri.')
                return redirect('/team/')
            user.is_active = False
            messages.success(request, f'{user.get_full_name() or user.username} dinonaktifkan dan tidak bisa masuk lagi. Datanya tetap tersimpan.')
        else:
            user.is_active = True
            messages.success(request, f'{user.get_full_name() or user.username} diaktifkan kembali.')
        user.save(update_fields=['is_active'])
    return redirect('/team/')


@login_required
@require_http_methods(['GET', 'POST'])
def account_password(request):
    role_of(request.user)
    form = PasswordChangeForm(request.user, request.POST or None)
    labels = {'old_password': 'Password sekarang', 'new_password1': 'Password baru', 'new_password2': 'Ulangi password baru'}
    for name, label in labels.items():
        form.fields[name].label = label
        form.fields[name].help_text = ''
    form.fields['new_password1'].help_text = 'Minimal 8 karakter, bukan hanya angka, dan tidak mirip nama pengguna.'
    if request.method == 'POST' and form.is_valid():
        update_session_auth_hash(request, form.save())
        messages.success(request, 'Password diganti.')
        return redirect('/')
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Ganti password', 'submit_label': 'Ganti password', 'back_url': '/'},
                status=400 if request.method == 'POST' else 200)


@login_required
@require_GET
def team_backup(request):
    """Everything the business recorded, as one file. Passwords and login sessions are left out."""
    require_role(request.user, {'MANAGER'})
    out = StringIO()
    call_command('dumpdata', 'auth.group', 'auth.user', 'crm', exclude=['crm.clientsubmission'],
                 natural_foreign=True, natural_primary=False, stdout=out)
    records = json.loads(out.getvalue())
    for record in records:
        if record['model'] == 'auth.user':
            record['fields']['password'] = ''
    response = HttpResponse(gzip.compress(json.dumps(records, ensure_ascii=False).encode()), content_type='application/gzip')
    response['Content-Disposition'] = f'attachment; filename="oneflow-cadangan-{timezone.localdate().isoformat()}.json.gz"'
    response['Cache-Control'] = 'no-store'
    return response


@require_GET
def healthz(request):
    """For an uptime monitor: 200 only when the app can reach its database."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:
        return JsonResponse({'ok': False}, status=503)
    return JsonResponse({'ok': True})
