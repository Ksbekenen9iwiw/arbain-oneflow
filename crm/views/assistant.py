import json

from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from django.contrib import messages
from django.shortcuts import redirect

from crm.access import require_role
from crm.forms import AssistantPolicyForm
from crm.frontend import render_page as page
from crm.models import AssistantPolicy

from crm.errors import BusinessError
from crm.services import assistant, assistant_usage

QUESTION_LIMIT = 400
HISTORY_TURNS = 6
PER_MINUTE = 10


@login_required
@require_POST
def assistant_ask(request):
    try:
        payload = json.loads(request.body or b'{}')
        question = str(payload['question']).strip()
        history = [{'role': 'model' if turn['role'] == 'model' else 'user', 'text': str(turn['text'])[:2000]}
                   for turn in list(payload.get('history') or [])[-HISTORY_TURNS:]]
    except (ValueError, KeyError, TypeError, AttributeError):
        return JsonResponse({'error': 'Pertanyaan tidak terbaca.'}, status=400)
    if not question or len(question) > QUESTION_LIMIT:
        return JsonResponse({'error': f'Tulis pertanyaan, paling panjang {QUESTION_LIMIT} karakter.'}, status=400)
    key = f'assistant:{request.user.pk}'
    if cache.get(key, 0) >= PER_MINUTE:
        return JsonResponse({'error': 'Terlalu banyak pertanyaan. Tunggu sebentar.'}, status=429)
    cache.add(key, 0, 60)
    cache.incr(key)
    # A stand-alone question over unchanged data is answered from the saved copy, at no cost.
    saved = None if history else assistant_usage.cached_answer(request.user, question)
    if saved is not None:
        assistant_usage.record(request.user, cached=True)
        return JsonResponse(saved)
    try:
        assistant_usage.check_limits(request.user)
        answer = assistant.ask(request.user, question, history)
    except BusinessError as error:
        return JsonResponse({'error': error.message}, status=429 if error.code == 'ASSISTANT_LIMIT' else 503)
    spent = answer.pop('usage', {})
    assistant_usage.record(request.user, spent.get('input', 0), spent.get('output', 0))
    if not history:
        assistant_usage.remember(request.user, question, answer)
    return JsonResponse(answer)


@login_required
@require_GET
def assistant_usage_page(request):
    require_role(request.user, {'MANAGER'})
    return page(request, 'crm/assistant_usage.html', {'usage': assistant_usage.summary(), 'enabled': assistant.enabled()})


@login_required
@require_http_methods(['GET', 'POST'])
def assistant_policy(request):
    require_role(request.user, {'MANAGER'})
    current = assistant_usage.policy()
    form = AssistantPolicyForm(request.POST or None, initial={
        'daily_per_user': current.daily_per_user, 'monthly_company': current.monthly_company,
        'input_price_rupiah': current.input_price_rupiah, 'output_price_rupiah': current.output_price_rupiah})
    if request.method == 'POST' and form.is_valid():
        AssistantPolicy.objects.update_or_create(pk=1, defaults={**form.cleaned_data, 'updated_by': request.user})
        messages.success(request, 'Batas pemakaian tersimpan.')
        return redirect('/assistant/usage/')
    return page(request, 'crm/form.html', {
        'form': form, 'heading': 'Batas pemakaian Tanya OneFlow', 'submit_label': 'Simpan batas', 'back_url': '/assistant/usage/',
        'help_text': 'Saat batas tercapai, Tanya OneFlow berhenti menjawab sampai hari atau bulan berganti. Rencana kunjungan dan Perlu perhatian tidak memakai AI dan tetap berjalan. Harga token diisi dari halaman harga Google AI agar perkiraan biaya bisa dihitung.',
    }, status=400 if request.method == 'POST' else 200)
