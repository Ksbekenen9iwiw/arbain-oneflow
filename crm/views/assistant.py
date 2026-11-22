import json

from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from crm.errors import BusinessError
from crm.services import assistant

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
    try:
        return JsonResponse(assistant.ask(request.user, question, history))
    except BusinessError as error:
        return JsonResponse({'error': error.message}, status=503)
