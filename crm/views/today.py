"""Dashboard ('Today') views, action decisions, and sales target updates."""
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import QueryDict
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from crm.access import customers_for, orders_for, require_role, role_of
from crm.errors import BusinessError
from crm.forms import (
    ActionDecisionForm,
    CarryDirectiveForm,
    RawMaterialForm,
    SalesTargetForm,
)
from crm.models import CompanyReportRow, Customer, Product, SalesTarget
from crm.navigation import return_url
from crm.sample_workspace import sample_tasks
from crm.selectors import (
    dashboard_activities,
    dashboard_metrics,
    dashboard_sales,
)
from crm.services.actions import list_actions, record_action
from crm.services.consignment import (
    pharmacy_consignment_overview,
    product_traction_analysis,
    raw_material_alerts,
    sales_attendance_recap,
)
from crm.services.supply import supply_alerts
from crm.views.common import page


@login_required
@require_GET
def today(request):
    return _today_page(request)


def _today_page(request, overrides=None, status=200):
    as_of, role = timezone.localdate(), role_of(request.user)
    selected_sales = request.GET.get('sales', '')
    sales_options = dashboard_sales() if role == 'MANAGER' else []
    if selected_sales:
        require_role(request.user, {'MANAGER'})
        if not selected_sales.isascii() or not selected_sales.isdecimal() or len(selected_sales) > 18:
            from django.http import Http404
            raise Http404
        selected_sales = str(get_object_or_404(sales_options, pk=selected_sales).pk)
    all_actions = list_actions(request.user, as_of, limit=None)
    if selected_sales:
        customer_ids = set(customers_for(request.user).filter(owner_id=selected_sales).values_list('id', flat=True))
        all_actions = [a for a in all_actions if a.customer_id in customer_ids]
    shown = all_actions if request.GET.get('all') == '1' else all_actions[:5]
    pending = orders_for(request.user).filter(status='CONFIRMED')
    if selected_sales:
        pending = pending.filter(sales_id=selected_sales)
    context = {
        'actions': shown, 'action_count': len(all_actions), 'show_all': request.GET.get('all') == '1',
        'updated_at': timezone.now(), 'metrics': dashboard_metrics(request.user, as_of, selected_sales or None),
        'pending_orders': pending.order_by('confirmed_at', 'pk')[:5],
        'selected_sales': selected_sales,
        'sales_options': [{'value': str(s.pk), 'label': s.get_full_name() or s.username} for s in sales_options],
    }
    if role == 'WAREHOUSE':
        from django.db.models import F, Q, Case, When, Value, IntegerField
        attention = Product.objects.select_related('balance').filter(
            Q(balance__on_hand__lt=F('balance__reserved')) |
            Q(is_active=True, balance__on_hand__lt=F('balance__reserved') + F('min_stock'))
        ).annotate(urgency=Case(When(balance__on_hand__lt=F('balance__reserved'), then=Value(0)), default=Value(1), output_field=IntegerField()))
        context['stock_attention'] = attention.order_by('urgency', 'sku')[:5]
    if role == 'MANAGER':
        saved_target = SalesTarget.objects.filter(sales_id=selected_sales, month=as_of.replace(day=1)).first() if selected_sales else None
        context['target_form'] = SalesTargetForm(actor=request.user, initial={'month': as_of.replace(day=1), 'sales': selected_sales or None, 'target_rupiah': saved_target.target_rupiah if saved_target else None})
    if role != 'WAREHOUSE':
        agenda = list(dashboard_activities(request.user, selected_sales or None).filter(status='PLANNED').select_related('customer__owner', 'sales'))
        for activity in agenda:
            dates = [date for date in (activity.scheduled_date, activity.followup_date) if date]
            activity.due = min(dates) if dates else None
        context['agenda'] = sorted(agenda, key=lambda item: (item.due is None, item.due or as_of, item.pk))
    context['action_orders'] = list(orders_for(request.user).exclude(status='CANCELLED')) if role != 'WAREHOUSE' else []
    context['sample_tasks'] = sample_tasks(request.user)
    context['supply_alerts'] = supply_alerts(request.user)
    context['attendance_recaps'] = sales_attendance_recap(request.user, as_of, selected_sales or None)
    context['consignment_outlets'] = pharmacy_consignment_overview(request.user, selected_sales or None)
    context['product_traction'] = product_traction_analysis(as_of)
    context['raw_material_alerts'] = raw_material_alerts(as_of)
    if role == 'MANAGER':
        context['saved_targets'] = [{'sales': str(t.sales_id), 'month': t.month.strftime('%Y-%m'), 'amount': str(t.target_rupiah)} for t in SalesTarget.objects.filter(sales__in=sales_options)]
        context['target_form_default'] = context['target_form']
        context['directive_form'] = CarryDirectiveForm(actor=request.user)
        context['directive_form_default'] = context['directive_form']
    if role in {'MANAGER', 'WAREHOUSE'}:
        context['raw_material_form'] = RawMaterialForm(actor=request.user)
        context['raw_material_form_default'] = context['raw_material_form']
    if role == 'MANAGER' and settings.ONEFLOW_COMPANY_ARCHIVE:
        context['company_setup'] = {
            'products': Product.objects.filter(opening_stock_pending=True).count(),
            'outlets': Customer.objects.filter(source_pending=True).count(),
            'visits': CompanyReportRow.objects.filter(visited_customer__isnull=False).count(),
        }
    if overrides:
        context.update(overrides)
        if 'action_form' in overrides:
            key = overrides['action_form']['key'].value()
            context['action_dialog'] = next((a for a in all_actions if a.key == key), None)
            if context['action_dialog']:
                from dataclasses import asdict
                context['action_dialog'] = asdict(context['action_dialog'])
            else:
                context['action_dialog'] = {'key': key, 'state': 'DRAFT', 'kind': 'FOLLOWUP', 'reasons': {'customer_name': 'Tinjau tindakan', 'note': 'Pemicu mungkin sudah berubah. Tutup dialog untuk memuat daftar terbaru.'}}
    return page(request, 'crm/today.html', context, status=status)


def _dashboard_error(request, overrides, status=400):
    back = return_url(request, '/')
    if urlsplit(back).path != '/':
        back = '/'
    request.GET = QueryDict(urlsplit(back).query)
    return _today_page(request, dict(overrides, canonical_url=back), status)


def _dashboard_return(request):
    back = return_url(request, '/')
    return back if urlsplit(back).path == '/' else '/'


@login_required
@require_POST
def action_decision(request):
    require_role(request.user, {'SALES', 'MANAGER'})
    form = ActionDecisionForm(request.POST)
    status = 400
    if form.is_valid():
        try:
            record_action(request.user, **form.cleaned_data)
        except BusinessError as error:
            form.add_error(None, error.message)
            status = error.status_code
        else:
            outcome = form.cleaned_data['outcome']
            if outcome == 'SNOOZED':
                until = form.cleaned_data['next_date'].strftime('%d/%m/%Y')
                message = f'Rekomendasi ditunda sampai {until}. Jadwal dan status aktivitas tidak berubah.'
            elif outcome == 'DISMISSED':
                message = 'Rekomendasi ditutup. Aktivitas tidak dibatalkan atau diselesaikan.'
            elif form.cleaned_data['key'].startswith('FOLLOWUP:'):
                message = 'Hasil tersimpan. Aktivitas tindak lanjut ditandai selesai; status pesanan tidak berubah.'
            else:
                message = 'Hasil tersimpan dan rekomendasi selesai. Status pesanan dan stok tidak berubah.'
            messages.success(request, message)
            return redirect(_dashboard_return(request))
    return _dashboard_error(request, {'action_form': form}, status)


@login_required
@require_POST
def target_save(request):
    form = SalesTargetForm(request.POST, actor=request.user)
    if form.is_valid():
        with transaction.atomic():
            SalesTarget.objects.update_or_create(sales=form.cleaned_data['sales'], month=form.cleaned_data['month'], defaults={'target_rupiah': form.cleaned_data['target_rupiah']})
        messages.success(request, 'Target bulanan tersimpan.')
        return redirect(_dashboard_return(request))
    return _dashboard_error(request, {'target_form': form, 'target_dialog': True})
