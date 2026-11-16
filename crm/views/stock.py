"""Product, stock ledger, batch status, and supply planning views."""
from urllib.parse import urlencode
from uuid import uuid4

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from crm.access import require_role
from crm.errors import BusinessError
from crm.forms import (
    BatchStatusForm,
    CancelOrderForm,
    ProductEditForm,
    ProductForm,
    PurchaseOrderForm,
    ReceivePurchaseForm,
    StockCountForm,
    StockReceiptForm,
    SupplySettingForm,
)
from crm.models import InventoryBalance, Product, PurchaseOrder
from crm.services.inventory import receive_stock, reconcile_stock, set_batch_status
from crm.services.supply import (
    cancel_purchase_order,
    create_purchase_order,
    receive_purchase_order,
    save_settings,
)
from crm.stock_workspace import product_workspace, stock_records, stock_return_url
from crm.views.common import page


@login_required
@require_http_methods(['GET', 'POST'])
def product_create(request):
    form = ProductForm(request.POST or None, actor=request.user)
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            product = form.save()
            InventoryBalance.objects.create(product=product)
        messages.success(request, 'Produk tersimpan dengan saldo awal nol. Catat barang masuk untuk mengisi stok.')
        return redirect(stock_return_url(request))
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Tambah produk', 'submit_label': 'Simpan produk', 'back_url': stock_return_url(request), 'stock_form_kind': 'product_create'}, status=400 if request.method == 'POST' else 200)


@login_required
@require_http_methods(['GET', 'POST'])
def product_edit(request, product_id):
    require_role(request.user, {'WAREHOUSE', 'MANAGER'})
    product = get_object_or_404(Product.objects.select_related('balance'), pk=product_id)
    original_price = product.price_rupiah
    form = ProductEditForm(request.POST or None, actor=request.user, instance=product)
    if request.method == 'POST' and form.is_valid():
        form.save()
        messages.success(request, 'Perubahan produk tersimpan. Harga katalog berlaku untuk pesanan baru.')
        return redirect(stock_return_url(request, product_id))
    return page(request, 'crm/product_edit.html', {'form': form, 'product': product, 'original_price': original_price, 'back_url': stock_return_url(request, product_id), 'stock_form_kind': 'product_edit'}, status=400 if request.method == 'POST' else 200)


@login_required
@require_GET
def stock(request):
    return page(request, 'crm/stock.html', stock_records(request.user, request.GET))


@login_required
@require_GET
def product_detail(request, product_id):
    product = get_object_or_404(Product.objects.select_related('balance'), pk=product_id)
    context = product_workspace(request.user, product, request.GET)
    context['back_url'] = stock_return_url(request)
    return page(request, 'crm/product_detail.html', context)


def _stock_form(request, product_id, reconcile=False):
    require_role(request.user, {'WAREHOUSE', 'MANAGER'})
    product = get_object_or_404(Product.objects.select_related('balance'), pk=product_id)
    form_type = StockCountForm if reconcile else StockReceiptForm
    form = form_type(request.POST or None, initial={'operation_id': uuid4()})
    status = 400 if request.method == 'POST' else 200
    if request.method == 'POST' and form.is_valid():
        try:
            if reconcile:
                reconcile_stock(request.user, product_id, **form.cleaned_data)
            else:
                receive_stock(request.user, product_id, **form.cleaned_data)
        except BusinessError as error:
            form.add_error(None, error.message)
            status = error.status_code
        else:
            messages.success(request, 'Mutasi stok tersimpan.')
            return redirect(stock_return_url(request, product_id))
    heading = ('Hitung & koreksi fisik' if reconcile else 'Barang masuk') + f' · {product.name}'
    return page(request, 'crm/form.html', {'form': form, 'heading': heading, 'back_url': stock_return_url(request, product_id), 'stock_form_kind': 'mutation', 'form_section': 'MUTASI STOK', 'stock_product': product, 'stock_on_hand': str(product.balance.on_hand), 'stock_reserved': str(product.balance.reserved), 'stock_mode': 'count' if reconcile else 'receive', 'help_text': 'Masukkan jumlah fisik hasil penghitungan, bukan selisihnya.' if reconcile else 'Tambahkan jumlah barang yang benar-benar diterima gudang.'}, status=status)


@login_required
@require_http_methods(['GET', 'POST'])
def stock_receive(request, product_id):
    return _stock_form(request, product_id)


@login_required
@require_http_methods(['GET', 'POST'])
def stock_reconcile(request, product_id):
    return _stock_form(request, product_id, reconcile=True)


@login_required
@require_POST
def batch_status(request, product_id, batch_id):
    form = BatchStatusForm(request.POST)
    if not form.is_valid():
        messages.error(request, 'Status batch tidak dikenal.')
        return redirect(f'/products/{product_id}/')
    try:
        set_batch_status(request.user, product_id, batch_id, form.cleaned_data['status'])
    except BusinessError as error:
        messages.error(request, error.message)
    else:
        messages.success(request, 'Status batch tersimpan. Batch ditahan tidak lagi dipilih FEFO.')
    return redirect(f'/products/{product_id}/')


def _product_detail_url(request, product_id):
    back = stock_return_url(request)
    base = f'/products/{product_id}/'
    params = {'section': 'supply'}
    if back != '/stock/':
        params['return_to'] = back
    return base + '?' + urlencode(params)


def _supply_failure(request, product_id, error=None, status=400, **overrides):
    product = get_object_or_404(Product.objects.select_related('balance'), pk=product_id)
    context = product_workspace(request.user, product, request.GET)
    context['back_url'] = stock_return_url(request)
    context['selected_section'] = 'supply'
    context['canonical_url'] = _product_detail_url(request, product_id)
    if error is not None:
        context['error'] = error
    context.update(overrides)
    return page(request, 'crm/product_detail.html', context, status=status)


@login_required
@require_POST
def supply_settings_save(request, product_id):
    form = SupplySettingForm(request.POST, actor=request.user)
    if not form.is_valid():
        return _supply_failure(request, product_id, supply_form=form, dialog="settings")
    try:
        save_settings(request.user, product_id, **form.cleaned_data)
    except BusinessError as error:
        return _supply_failure(request, product_id, error=error, supply_form=form, dialog="settings")
    messages.success(request, 'Pengaturan pasokan tersimpan.')
    return redirect(_product_detail_url(request, product_id))


@login_required
@require_POST
def supply_order_create(request, product_id):
    form = PurchaseOrderForm(request.POST, actor=request.user)
    if not form.is_valid():
        return _supply_failure(request, product_id, purchase_form=form, dialog='purchase')
    try:
        order = create_purchase_order(request.user, product_id, **form.cleaned_data)
    except BusinessError as error:
        return _supply_failure(request, product_id, error=error, purchase_form=form, dialog='purchase')
    messages.success(request, f'Pengadaan {order.number} dicatat. Stok fisik belum berubah.')
    return redirect(_product_detail_url(request, product_id))


def _supply_order_action(request, purchase_order_id, operation, form_class):
    order = get_object_or_404(PurchaseOrder.objects.select_related('product'), pk=purchase_order_id)
    kind = 'receive' if form_class is ReceivePurchaseForm else 'cancel'
    form = form_class(request.POST)
    if not form.is_valid():
        return _supply_failure(request, order.product_id, **{f'{kind}_form': form, 'dialog': kind, 'dialog_po': str(order.pk)})
    try:
        order = operation(request.user, order.pk, **form.cleaned_data)
    except BusinessError as error:
        return _supply_failure(request, order.product_id, error=error, dialog=kind, dialog_po=str(order.pk), **{f'{kind}_form': form})
    messages.success(request, f'Pengadaan {order.number} diperbarui: {order.get_status_display()}.')
    return redirect(_product_detail_url(request, order.product_id))


@login_required
@require_POST
def supply_order_receive(request, purchase_order_id):
    return _supply_order_action(request, purchase_order_id, receive_purchase_order, ReceivePurchaseForm)


@login_required
@require_POST
def supply_order_cancel(request, purchase_order_id):
    return _supply_order_action(request, purchase_order_id, cancel_purchase_order, CancelOrderForm)
