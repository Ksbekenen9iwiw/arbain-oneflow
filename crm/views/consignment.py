"""Consignment visit entry, carry directive, and raw-material EWS views."""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_POST

from crm.access import customers_for
from crm.errors import BusinessError
from crm.forms import CarryDirectiveForm, ConsignmentVisitForm, RawMaterialForm
from crm.selectors import customer_history
from crm.services.consignment import (
    record_consignment_visit,
    save_carry_directive,
    save_raw_material,
)
from crm.views.common import page
from crm.views.customers import customer_return_url
from crm.views.today import _dashboard_error, _dashboard_return


@login_required
@require_POST
def consignment_visit_record(request, customer_id):
    customer = get_object_or_404(customers_for(request.user), pk=customer_id)
    form = ConsignmentVisitForm(request.POST, actor=request.user, customer=customer)
    if not form.is_valid():
        context = customer_history(request.user, customer.id)
        context['back_url'] = customer_return_url(request)
        context['consignment_form'] = form
        context['dialog'] = 'consignment'
        context['canonical_url'] = f'/customers/{customer.id}/?tab=consignment'
        return page(request, 'crm/customer_detail.html', context, status=400)
    try:
        entry = record_consignment_visit(
            request.user,
            customer.id,
            int(form.cleaned_data['product_id']),
            form.cleaned_data['sold_quantity'],
            form.cleaned_data['remaining_stock'],
            form.cleaned_data['added_quantity'],
            form.cleaned_data['returned_quantity'],
            form.cleaned_data['visit_date'],
            form.cleaned_data.get('note', ''),
            return_reason=form.cleaned_data.get('return_reason') or 'NONE',
            nearest_expiry_date=form.cleaned_data.get('nearest_expiry_date'),
            billing_status=form.cleaned_data.get('billing_status') or 'BILLED_PAID',
            physical_stamp_verified=bool(form.cleaned_data.get('physical_stamp_verified')),
        )
    except BusinessError as error:
        context = customer_history(request.user, customer.id)
        context['back_url'] = customer_return_url(request)
        context['consignment_form'] = form
        context['error'] = error
        context['dialog'] = 'consignment'
        context['canonical_url'] = f'/customers/{customer.id}/?tab=consignment'
        return page(request, 'crm/customer_detail.html', context, status=400)
    messages.success(
        request,
        f'Kunjungan titip jual {entry.product.name} di {customer.name} tercatat (stok akhir di apotek: {entry.closing_stock} {entry.product.unit}).',
    )
    return redirect(f'/customers/{customer.id}/?tab=consignment')


@login_required
@require_POST
def carry_directive_save(request):
    form = CarryDirectiveForm(request.POST, actor=request.user)
    if not form.is_valid():
        return _dashboard_error(request, {'directive_form': form, 'directive_dialog': True})
    try:
        sub_id = form.cleaned_data.get('substitute_product_id')
        directive = save_carry_directive(
            request.user,
            int(form.cleaned_data['product_id']),
            form.cleaned_data['directive'],
            int(sub_id) if sub_id else None,
            form.cleaned_data.get('reason', ''),
        )
    except BusinessError as error:
        return _dashboard_error(request, {'directive_form': form, 'directive_dialog': True, 'error': error})
    if directive is None:
        messages.success(request, 'Arahan khusus produk dihapus.')
    else:
        messages.success(request, f'Arahan bawaan sales untuk {directive.product.name} tersimpan ({directive.get_directive_display()}).')
    return redirect(_dashboard_return(request))


@login_required
@require_POST
def raw_material_save(request):
    form = RawMaterialForm(request.POST, actor=request.user)
    if not form.is_valid():
        return _dashboard_error(request, {'raw_material_form': form, 'raw_material_dialog': True})
    try:
        mat = save_raw_material(
            request.user,
            int(form.cleaned_data['material_id']),
            form.cleaned_data['on_hand'],
            form.cleaned_data['min_threshold'],
            form.cleaned_data['fast_moving_threshold'],
            form.cleaned_data.get('note', ''),
        )
    except BusinessError as error:
        return _dashboard_error(request, {'raw_material_form': form, 'raw_material_dialog': True, 'error': error})
    messages.success(request, f'Stok & batas alarm bahan baku {mat.name} diperbarui ({mat.on_hand} {mat.unit}).')
    return redirect(_dashboard_return(request))
