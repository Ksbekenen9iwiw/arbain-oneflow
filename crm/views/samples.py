"""Sample request list, workflow transitions, evaluation, and policy views."""
from urllib.parse import urlencode

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from crm.access import customers_for, require_role, sample_requests_for
from crm.errors import BusinessError
from crm.forms import (
    CancelSampleForm,
    SampleDecisionForm,
    SampleLineFormSet,
    SampleOutcomeForm,
    SamplePolicyForm,
    SampleRequestForm,
    SampleScheduleForm,
)
from crm.models import Product, SamplePolicy, SampleRequest
from crm.navigation import return_url
from crm.sample_workspace import sample_context, sample_records
from crm.services.samples import (
    cancel_request as cancel_sample_request,
    create_draft as create_sample_draft,
    decide as decide_sample,
    mark_received as receive_sample,
    record_followup as record_sample_followup,
    sample_version,
    save_policy as save_sample_policy,
    schedule_followup as schedule_sample_followup,
    ship_request as ship_sample_request,
    submit_request as submit_sample_request,
    update_draft as update_sample_draft,
)
from crm.views.common import page


def sample_return_url(request):
    return return_url(request, '/samples/')


def sample_detail_url(request, sample_id):
    back = sample_return_url(request)
    return f'/samples/{sample_id}/' + ('?' + urlencode({'return_to': back}) if back != '/samples/' else '')


@login_required
@require_GET
def samples(request):
    return page(request, 'crm/samples.html', sample_records(request.user, request.GET))


@login_required
@require_http_methods(['GET', 'POST'])
def sample_create(request, sample_id=None):
    require_role(request.user, {'SALES', 'MANAGER'})
    sample = None
    if sample_id is not None:
        sample = get_object_or_404(sample_requests_for(request.user), pk=sample_id, status=SampleRequest.Status.DRAFT)
    initial = {
        'customer': sample.customer_id if sample else request.GET.get('customer'),
        'purpose': sample.purpose if sample else '',
        'customer_need': sample.customer_need if sample else '',
        'potential_orders': sample.potential_orders if sample else '',
        'business_profile': sample.business_profile if sample else '',
        'notes': sample.notes if sample else '',
    }
    form = SampleRequestForm(request.POST or None, actor=request.user, initial=initial)
    initial_lines = [{'product': line.product_id, 'quantity': line.quantity} for line in sample.lines.all()] if sample else None
    formset = SampleLineFormSet(request.POST or None, prefix='lines', initial=initial_lines)
    status = 400 if request.method == 'POST' else 200
    if request.method == 'POST' and form.is_valid() and formset.is_valid():
        lines = [{'product_id': line['product'].id, 'quantity': line['quantity']}
                 for line in formset.cleaned_data if line and not line.get('DELETE')]
        fields = {name: form.cleaned_data[name] for name in ('purpose', 'customer_need', 'potential_orders', 'business_profile', 'notes')}
        try:
            saved = update_sample_draft(request.user, sample.pk, form.cleaned_data['customer'].id, lines,
                                        request.POST.get('draft_version'), **fields) if sample else create_sample_draft(
                                            request.user, form.cleaned_data['customer'].id, lines, **fields)
        except BusinessError as error:
            form.add_error(None, error.message)
            status = error.status_code
        else:
            messages.success(request, 'Draf pengajuan sampel tersimpan.')
            return redirect(sample_detail_url(request, saved.pk))
    catalog = [{'id': str(product.pk), 'name': product.name, 'sku': product.sku,
                'available': str(product.balance.available), 'unit': product.unit}
               for product in Product.objects.filter(is_active=True).select_related('balance')]
    return page(request, 'crm/sample_form.html', {
        'form': form, 'formset': formset, 'catalog': catalog,
        'editing': sample.number if sample else '',
        'draft_version': (request.POST.get('draft_version', '') if request.method == 'POST' else sample_version(sample)) if sample else '',
        'back_url': sample_detail_url(request, sample.pk) if sample else sample_return_url(request),
        'customer_details': list(customers_for(request.user).filter(is_active=True)),
    }, status=status)


def _sample_context(request, sample):
    context = sample_context(request.user, sample)
    context.update(
        back_url=sample_return_url(request),
        detail_url=sample_detail_url(request, sample.pk),
        canonical_url=sample_detail_url(request, sample.pk),
    )
    if context.get('can_decide'):
        context['decision_form'] = SampleDecisionForm()
    if context.get('can_cancel'):
        context['cancel_form'] = CancelSampleForm()
    if context.get('can_followup'):
        scheduled = context['evaluation']['scheduled']
        context['schedule_form'] = SampleScheduleForm(initial={
            'followup_date': scheduled['date'], 'note': scheduled['note'],
        } if scheduled else None)
        context['outcome_form'] = SampleOutcomeForm(actor=request.user, request=sample)
    return context


@login_required
@require_GET
def sample_detail(request, sample_id):
    sample = get_object_or_404(sample_requests_for(request.user), pk=sample_id)
    return page(request, 'crm/sample_detail.html', _sample_context(request, sample))


def _sample_transition(request, sample_id, operation, *args, extra=None):
    try:
        sample = operation(request.user, sample_id, *args)
    except BusinessError as error:
        sample = sample_requests_for(request.user).filter(pk=sample_id).first()
        if not sample:
            return page(request, 'crm/error.html', {'error': error, 'back_url': '/samples/'}, status=error.status_code)
        context = _sample_context(request, sample)
        context['error'] = error
        if extra:
            context.update(extra)
        return page(request, 'crm/sample_detail.html', context, status=error.status_code)
    if operation == schedule_sample_followup:
        message = f'Jadwal evaluasi {sample.number} tersimpan pada aktivitas pelanggan.'
    elif operation == record_sample_followup:
        message = (f'Evaluasi {sample.number} tersimpan. Pesanan terkirim telah ditautkan.'
                   if sample.outcome == SampleRequest.Outcome.PURCHASED else
                   f'Evaluasi {sample.number} tersimpan. Jadwalkan tindak lanjut berikutnya jika masih diperlukan.')
    else:
        message = f'Pengajuan {sample.number} diperbarui: {sample.get_status_display()} · {sample.get_fulfillment_status_display()}.'
    messages.success(request, message)
    return redirect(sample_detail_url(request, sample_id))


@login_required
@require_POST
def sample_submit(request, sample_id):
    return _sample_transition(request, sample_id, submit_sample_request, extra={"dialog": "submit"})


@login_required
@require_POST
def sample_cancel(request, sample_id):
    require_role(request.user, {'SALES', 'MANAGER'})
    form = CancelSampleForm(request.POST)
    if not form.is_valid():
        sample = get_object_or_404(sample_requests_for(request.user), pk=sample_id)
        context = _sample_context(request, sample)
        context.update(cancel_form=form, dialog='cancel')
        return page(request, 'crm/sample_detail.html', context, status=400)
    return _sample_transition(request, sample_id, cancel_sample_request, form.cleaned_data['reason'], extra={'dialog': 'cancel', 'cancel_form': form})


@login_required
@require_POST
def sample_decide(request, sample_id):
    require_role(request.user, {'MANAGER'})
    form = SampleDecisionForm(request.POST)
    if not form.is_valid():
        sample = get_object_or_404(sample_requests_for(request.user), pk=sample_id)
        context = _sample_context(request, sample)
        context.update(decision_form=form, dialog='decision')
        return page(request, 'crm/sample_detail.html', context, status=400)
    return _sample_transition(request, sample_id, decide_sample, form.cleaned_data['decision'], form.cleaned_data['note'], extra={'dialog': 'decision', 'decision_form': form})


@login_required
@require_POST
def sample_ship(request, sample_id):
    return _sample_transition(request, sample_id, ship_sample_request, extra={"dialog": "ship"})


@login_required
@require_POST
def sample_receive(request, sample_id):
    return _sample_transition(request, sample_id, receive_sample, extra={"dialog": "receive"})


@login_required
@require_POST
def sample_schedule(request, sample_id):
    require_role(request.user, {'SALES', 'MANAGER'})
    sample = get_object_or_404(sample_requests_for(request.user), pk=sample_id)
    form = SampleScheduleForm(request.POST)
    if not form.is_valid():
        context = _sample_context(request, sample)
        context.update(schedule_form=form, dialog='schedule')
        return page(request, 'crm/sample_detail.html', context, status=400)
    return _sample_transition(request, sample_id, schedule_sample_followup, form.cleaned_data['followup_date'], form.cleaned_data['note'], extra={'dialog': 'schedule', 'schedule_form': form})


@login_required
@require_POST
def sample_outcome(request, sample_id):
    require_role(request.user, {'SALES', 'MANAGER'})
    sample = get_object_or_404(sample_requests_for(request.user), pk=sample_id)
    form = SampleOutcomeForm(request.POST, actor=request.user, request=sample)
    if not form.is_valid():
        context = _sample_context(request, sample)
        context.update(outcome_form=form, dialog='outcome')
        return page(request, 'crm/sample_detail.html', context, status=400)
    order = form.cleaned_data['order_id']
    return _sample_transition(request, sample_id, record_sample_followup, form.cleaned_data['response'],
                              form.cleaned_data['outcome'], form.cleaned_data['note'], order.pk if order else None, extra={'dialog': 'outcome', 'outcome_form': form})


@login_required
@require_http_methods(['GET', 'POST'])
def sample_policy(request):
    require_role(request.user, {'MANAGER'})
    policy = SamplePolicy.objects.filter(pk=1).first()
    initial = {
        'repeat_threshold': policy.repeat_threshold if policy else None,
        'review_period_days': policy.review_period_days if policy else None,
        'evaluation_days': policy.evaluation_days if policy else None,
    }
    form = SamplePolicyForm(request.POST or None, actor=request.user, initial=initial)
    if request.method == 'POST' and form.is_valid():
        save_sample_policy(request.user, **form.cleaned_data)
        messages.success(request, 'Kebijakan pengajuan sampel tersimpan.')
        return redirect(sample_return_url(request))
    return page(request, 'crm/sample_policy.html', {
        'form': form, 'back_url': sample_return_url(request), 'heading': 'Kebijakan pengajuan sampel',
        'submit_label': 'Simpan kebijakan', 'policy_configured': bool(policy and policy.is_configured),
    }, status=400 if request.method == 'POST' else 200)
