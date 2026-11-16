"""Customer and activity views."""
from urllib.parse import urlencode

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods

from crm.access import customers_for, sample_requests_for
from crm.forms import ActivityCompletionForm, ActivityForm, CustomerForm
from crm.models import Activity
from crm.navigation import return_url
from crm.selectors import customer_history, customer_records
from crm.views.common import page


@login_required
@require_GET
def customers(request):
    return page(request, 'crm/customers.html', customer_records(request.user, request.GET, timezone.localdate()))


def customer_return_url(request):
    return return_url(request, '/customers/')


def customer_detail_url(request, customer_id):
    url = f'/customers/{customer_id}/'
    back = customer_return_url(request)
    if back.split('?')[0] in ('/', url):
        return back
    return url + ('?' + urlencode({'return_to': back}) if back != '/customers/' else '')


@login_required
@require_http_methods(['GET', 'POST'])
def customer_create(request):
    form = CustomerForm(request.POST or None, actor=request.user)
    if request.method == 'POST' and form.is_valid():
        customer = form.save()
        messages.success(request, 'Pelanggan tersimpan.')
        return redirect(customer_detail_url(request, customer.id))
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Tambah pelanggan', 'submit_label': 'Simpan pelanggan', 'form_kind': 'customer', 'back_url': customer_return_url(request)}, status=400 if request.method == 'POST' else 200)


@login_required
@require_GET
def customer_detail(request, customer_id):
    context = customer_history(request.user, customer_id)
    context['back_url'] = customer_return_url(request)
    return page(request, 'crm/customer_detail.html', context)


@login_required
@require_http_methods(['GET', 'POST'])
def activity_create(request, customer_id):
    customer = get_object_or_404(customers_for(request.user), pk=customer_id)
    from django.db.models.functions import Coalesce
    latest = customer.activities.order_by(Coalesce('completed_at', 'created_at').desc(), '-pk').first()
    form = ActivityForm(request.POST or None, actor=request.user, initial={'stage': latest.stage if latest else 'NEW', 'status': 'DONE' if request.GET.get('intent') == 'done' else 'PLANNED', 'kind': 'INTERACTION' if request.GET.get('intent') == 'done' else ('FOLLOWUP' if request.GET.get('intent') == 'followup' else 'VISIT')})
    if request.method == 'GET' and request.GET.get('intent') == 'followup' and request.GET.get('source_product'):
        # Resolve the context from authorized Django records, never from query-string copy.
        patterns = customer_history(request.user, customer.pk)['reorder_patterns']
        pattern = next((p for p in patterns if str(p['product_id']) == request.GET['source_product']), None)
        if pattern:
            form.initial['note'] = (
                f"Konfirmasi kebutuhan {pattern['product_name']} ({pattern['product_sku']}). "
                f"Perkiraan pembelian ulang {pattern['next_due']:%d/%m/%Y}, berdasarkan "
                f"{pattern['purchase_date_count']} tanggal pembelian. "
                "Periksa kesiapan barang sebelum menjanjikan pengiriman."
            )
    if request.method == 'POST' and form.is_valid():
        activity = form.save(commit=False)
        activity.customer = customer
        activity.sales = customer.owner
        if activity.status == 'DONE':
            activity.completed_at = timezone.now()
        with transaction.atomic():
            activity.save()
            if activity.status == 'DONE' and activity.followup_date:
                Activity.objects.create(customer=customer, sales=customer.owner, kind='FOLLOWUP', stage=activity.stage, followup_date=activity.followup_date, note=activity.result, followup_of=activity)
        messages.success(request, 'Jadwal aktivitas tersimpan.' if activity.status == 'PLANNED' else ('Hasil interaksi tersimpan dan tindak lanjut baru dijadwalkan.' if activity.followup_date else 'Hasil interaksi tersimpan.'))
        return redirect(customer_detail_url(request, customer.id))
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Catat aktivitas', 'customer': customer, 'submit_label': 'Simpan aktivitas', 'form_kind': 'activity', 'back_url': customer_detail_url(request, customer.id)}, status=400 if request.method == 'POST' else 200)


@login_required
@require_http_methods(['GET', 'POST'])
def activity_complete(request, activity_id):
    activity = get_object_or_404(Activity.objects.filter(customer__in=customers_for(request.user)), pk=activity_id)
    back_url = return_url(request, f'/customers/{activity.customer_id}/')
    if request.method == 'GET' and activity.status == 'PLANNED':
        related = activity.sample_followups.filter(request__in=sample_requests_for(request.user)).first()
        if related:
            return redirect(f'/samples/{related.request_id}/?' + urlencode({'tab': 'evaluation', 'return_to': back_url}))
    form = ActivityCompletionForm(request.POST or None, initial={'stage': activity.stage})
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            activity.refresh_from_db()
            already_done = activity.status == Activity.Status.DONE
            if activity.status == Activity.Status.PLANNED:
                activity.status = Activity.Status.DONE
                activity.result = form.cleaned_data['result']
                activity.stage = form.cleaned_data['stage']
                activity.completed_at = timezone.now()
                activity.save(update_fields=['status', 'result', 'stage', 'completed_at'])
                if form.cleaned_data['followup_date']:
                    Activity.objects.create(customer=activity.customer, sales=activity.sales, kind='FOLLOWUP', stage=activity.stage, followup_date=form.cleaned_data['followup_date'], note=activity.result, followup_of=activity)
        messages.success(request, 'Aktivitas sudah selesai. Hasil sebelumnya tetap tersimpan; tidak ada tindak lanjut tambahan.' if already_done else ('Aktivitas selesai dan tindak lanjut baru dijadwalkan.' if form.cleaned_data['followup_date'] else 'Aktivitas ditandai selesai. Hasil interaksi tersimpan.'))
        return redirect(back_url)
    # Keep linked history scoped to this customer, including malformed legacy links.
    previous = Activity.objects.filter(pk=activity.followup_of_id, customer_id=activity.customer_id).first()
    followups = Activity.objects.filter(followup_of=activity, customer_id=activity.customer_id).select_related('sales', 'customer').order_by('created_at', 'pk')
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Detail aktivitas', 'activity': activity, 'customer': activity.customer, 'previous_activity': previous, 'followups': followups, 'submit_label': 'Simpan hasil aktivitas', 'back_url': back_url}, status=400 if request.method == 'POST' else 200)
