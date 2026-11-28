"""Tanya OneFlow cost control: limits, a short answer cache, and usage figures.

Only the chat calls Gemini. Visit plans and "Perlu perhatian" are computed
from the database and never pass through here.
"""
from hashlib import sha256

from django.core.cache import cache
from django.db.models import F, Max, Sum
from django.utils import timezone

from crm.access import role_of
from crm.errors import BusinessError
from crm.models import Activity, AssistantPolicy, AssistantUsage, Order, StockMovement

CACHE_SECONDS = 300


def policy():
    return AssistantPolicy.objects.filter(pk=1).first() or AssistantPolicy(pk=1)


def _month(day):
    return AssistantUsage.objects.filter(day__year=day.year, day__month=day.month)


def check_limits(user):
    """Raise when this person, or the company, has used up the allowance."""
    rules, today = policy(), timezone.localdate()
    mine = AssistantUsage.objects.filter(user=user, day=today).first()
    if mine and mine.questions - mine.from_cache >= rules.daily_per_user:
        raise BusinessError('ASSISTANT_LIMIT', (
            f'Batas {rules.daily_per_user} pertanyaan hari ini sudah tercapai. '
            'Tanya OneFlow bisa dipakai lagi besok; layar lain tetap berjalan.'))
    totals = _month(today).aggregate(q=Sum('questions'), c=Sum('from_cache'))
    if (totals['q'] or 0) - (totals['c'] or 0) >= rules.monthly_company:
        raise BusinessError('ASSISTANT_LIMIT', (
            'Batas pertanyaan perusahaan bulan ini sudah tercapai. '
            'Manajer bisa menaikkannya di Pemakaian Tanya OneFlow; layar lain tetap berjalan.'))


def record(user, input_tokens=0, output_tokens=0, cached=False):
    row, _ = AssistantUsage.objects.get_or_create(user=user, day=timezone.localdate())
    AssistantUsage.objects.filter(pk=row.pk).update(
        questions=F('questions') + 1, from_cache=F('from_cache') + (1 if cached else 0),
        input_tokens=F('input_tokens') + input_tokens, output_tokens=F('output_tokens') + output_tokens)


def _data_version():
    """Changes whenever stock, orders or visits change, so a saved answer is never about old data."""
    return [
        StockMovement.objects.aggregate(v=Max('id'))['v'],
        Order.objects.aggregate(v=Max('id'))['v'], Order.objects.exclude(status=Order.Status.DRAFT).count(),
        Activity.objects.aggregate(v=Max('id'))['v'], Activity.objects.filter(status=Activity.Status.DONE).count(),
        timezone.localdate().isoformat(),
    ]


def cache_key(user, question):
    text = ' '.join(question.lower().split())
    raw = repr([user.pk, role_of(user), text, _data_version()])
    return 'assistant-answer:' + sha256(raw.encode()).hexdigest()


def cached_answer(user, question):
    return cache.get(cache_key(user, question))


def remember(user, question, answer):
    cache.set(cache_key(user, question), answer, CACHE_SECONDS)


def cost(rules, input_tokens, output_tokens):
    if rules.input_price_rupiah is None or rules.output_price_rupiah is None:
        return None
    return round((input_tokens * rules.input_price_rupiah + output_tokens * rules.output_price_rupiah) / 1_000_000)


def summary():
    rules, today = policy(), timezone.localdate()
    rows = list(_month(today).values('user_id', 'user__first_name', 'user__last_name', 'user__username').annotate(
        questions=Sum('questions'), from_cache=Sum('from_cache'),
        input_tokens=Sum('input_tokens'), output_tokens=Sum('output_tokens'), last_day=Max('day')).order_by('-questions'))
    today_rows = {r.user_id: r.questions - r.from_cache for r in AssistantUsage.objects.filter(day=today)}
    people = [{
        'id': str(r['user_id']),
        'name': f"{r['user__first_name']} {r['user__last_name']}".strip() or r['user__username'],
        'questions': r['questions'], 'from_cache': r['from_cache'],
        'tokens': r['input_tokens'] + r['output_tokens'],
        'cost_rupiah': cost(rules, r['input_tokens'], r['output_tokens']),
        'today': today_rows.get(r['user_id'], 0), 'last_day': r['last_day'].isoformat(),
    } for r in rows]
    questions = sum(p['questions'] for p in people)
    from_cache = sum(p['from_cache'] for p in people)
    tokens_in = sum(r['input_tokens'] for r in rows)
    tokens_out = sum(r['output_tokens'] for r in rows)
    return {
        'month': today.replace(day=1).isoformat(), 'questions': questions, 'from_cache': from_cache,
        'billed': questions - from_cache, 'input_tokens': tokens_in, 'output_tokens': tokens_out,
        'cost_rupiah': cost(rules, tokens_in, tokens_out),
        'daily_per_user': rules.daily_per_user, 'monthly_company': rules.monthly_company,
        'priced': rules.input_price_rupiah is not None and rules.output_price_rupiah is not None,
        'people': people,
    }
