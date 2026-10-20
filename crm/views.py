from uuid import uuid4
from urllib.parse import urlencode, urlsplit
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from crm.access import customers_for, orders_for, require_role, role_of, sample_requests_for
from crm.stock_workspace import stock_records, stock_return_url, product_workspace
from crm.sample_workspace import sample_context, sample_records, sample_tasks
from crm.errors import BusinessError
from crm.navigation import return_url
from crm.forms import ActionDecisionForm, ActivityCompletionForm, ActivityForm, BatchStatusForm, BatchSwapForm, CancelOrderForm, CancelSampleForm, ConfirmOrderForm, CustomerForm, OrderForm, OrderLineFormSet, ProductEditForm, ProductForm, PurchaseOrderForm, ReceivePurchaseForm, SampleDecisionForm, SampleLineFormSet, SampleOutcomeForm, SamplePolicyForm, SampleRequestForm, SampleScheduleForm, StockCountForm, StockReceiptForm, SupplySettingForm
from crm.models import Activity, InventoryBalance, Product, PurchaseOrder, SalesTarget, SamplePolicy, SampleRequest, StockMovement
from crm.selectors import order_records, customer_records, customer_history, dashboard_metrics, dashboard_sales, dashboard_activities
from crm.forms import SalesTargetForm
from crm.services.inventory import receive_stock, reconcile_stock, set_batch_status
from crm.services.orders import cancel_order, confirm_order, create_draft, ship_order, swap_batch, update_draft, draft_version
from crm.services.actions import list_actions, record_action
from crm.services.samples import cancel_request as cancel_sample_request, create_draft as create_sample_draft, decide as decide_sample, mark_received as receive_sample, record_followup as record_sample_followup, sample_version, save_policy as save_sample_policy, schedule_followup as schedule_sample_followup, ship_request as ship_sample_request, submit_request as submit_sample_request, update_draft as update_sample_draft
from crm.services.supply import cancel_purchase_order, create_purchase_order, receive_purchase_order, save_settings, supply_alerts


def page(request, template, context=None, status=200):
    from crm.frontend import render_page
    return render_page(request, template, context, status)


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
        agenda = list(dashboard_activities(request.user, selected_sales or None).filter(status='PLANNED').select_related('customer', 'sales'))
        for activity in agenda:
            dates = [date for date in (activity.scheduled_date, activity.followup_date) if date]
            activity.due = min(dates) if dates else None
        context['agenda'] = sorted(agenda, key=lambda item: (item.due is None, item.due or as_of, item.pk))
    context['action_orders'] = list(orders_for(request.user).exclude(status='CANCELLED')) if role != 'WAREHOUSE' else []
    context['sample_tasks'] = sample_tasks(request.user)
    context['supply_alerts'] = supply_alerts(request.user)
    if role == 'MANAGER':
        context['saved_targets'] = [{'sales': str(t.sales_id), 'month': t.month.strftime('%Y-%m'), 'amount': str(t.target_rupiah)} for t in SalesTarget.objects.filter(sales__in=sales_options)]
    if role == 'MANAGER':
        context['target_form_default'] = context['target_form']
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
    from django.http import QueryDict
    back = return_url(request, '/')
    if urlsplit(back).path != '/':
        back = '/'
    request.GET = QueryDict(urlsplit(back).query)
    return _today_page(request, dict(overrides, canonical_url=back), status)


def _dashboard_return(request):
    back = return_url(request, '/')
    return back if urlsplit(back).path == '/' else '/'


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
@require_GET
def orders(request):
    return page(request, 'crm/orders.html', order_records(request.user, request.GET))


def order_return_url(request):
    return return_url(request, '/orders/')


def order_detail_url(request, order_id):
    back = order_return_url(request)
    return f'/orders/{order_id}/' + ('?' + urlencode({'return_to': back}) if back != '/orders/' else '')


@login_required
@require_http_methods(['GET', 'POST'])
def order_create(request, order_id=None):
    order = None
    if order_id is not None:
        require_role(request.user, {'SALES', 'MANAGER'})
        order = get_object_or_404(orders_for(request.user), pk=order_id)
        if order.status != 'DRAFT':
            messages.error(request, 'Hanya pesanan draft yang dapat diedit.')
            return redirect(order_detail_url(request, order_id))
    form = OrderForm(request.POST or None, actor=request.user, initial={'customer': order.customer_id if order else request.GET.get('customer')})
    initial_lines = None
    # Only carry a suggestion through for a customer visible to this actor.
    customer_id = request.GET.get('customer', '')
    product_id = request.GET.get('product', '')
    quantity = request.GET.get('quantity', '')
    if all(value.isascii() and value.isdigit() and len(value) <= 18 for value in (customer_id, product_id, quantity)):
        if customers_for(request.user).filter(pk=int(customer_id), is_active=True).exists() and Product.objects.filter(pk=int(product_id), is_active=True).exists() and 0 < int(quantity) <= 2**63 - 1:
            initial_lines = [{'product': int(product_id), 'quantity': int(quantity)}]
    suggested = bool(initial_lines) and not order
    if order:
        initial_lines = [{'product': line.product_id, 'quantity': line.quantity} for line in order.lines.all()]
    formset = OrderLineFormSet(request.POST or None, prefix='lines', initial=initial_lines)
    status = 400 if request.method == 'POST' else 200
    if request.method == 'POST' and form.is_valid() and formset.is_valid():
        lines = [{'product_id': line['product'].id, 'quantity': line['quantity']} for line in formset.cleaned_data if line and not line.get('DELETE')]
        try:
            saved = update_draft(request.user, order.pk, form.cleaned_data['customer'].id, lines, request.POST.get('draft_version')) if order else create_draft(request.user, form.cleaned_data['customer'].id, lines)
        except BusinessError as error:
            form.add_error(None, error.message)
            status = error.status_code
        else:
            messages.success(request, 'Draft tersimpan. Stok baru direservasi setelah konfirmasi.')
            return redirect(order_detail_url(request, saved.id))
    catalog = [{'id': str(product.id), 'name': product.name, 'sku': product.sku, 'price': str(product.price_rupiah), 'available': str(product.balance.available), 'unit': product.unit} for product in Product.objects.filter(is_active=True).select_related('balance')]
    if order:
        prices = dict(order.lines.values_list('product_id', 'unit_price_rupiah'))
        for product in catalog:
            if int(product['id']) in prices:
                product['price'] = str(prices[int(product['id'])])
    return page(request, 'crm/order_form.html', {'form': form, 'formset': formset, 'catalog': catalog, 'suggested': suggested,
        'editing': f'OF-{order.pk:04d}' if order else '', 'draft_version': (request.POST.get('draft_version', '') if request.method == 'POST' else draft_version(order)) if order else '',
        'back_url': order_detail_url(request, order.pk) if order else order_return_url(request),
        'customer_details': list(customers_for(request.user).filter(is_active=True))}, status=status)


def _order_context(request, order):
    role = role_of(request.user)
    lines = list(order.lines.select_related('product', 'product__balance'))
    blockers, checks = [], {}
    if order.status == 'DRAFT' and not order.customer.is_active:
        blockers.append('Pelanggan sudah nonaktif. Pesanan ini belum dapat dikonfirmasi.')
    for line in lines:
        balance = line.product.balance
        if order.status == 'DRAFT':
            available = balance.available
            shortage = max(0, line.quantity - max(0, available))
            checks[str(line.pk)] = {'available': available, 'shortage': shortage}
            if not line.product.is_active:
                blockers.append(f'{line.product.name} sudah nonaktif.')
            if available < 0:
                blockers.append(f'{line.product.name}: ada konflik stok. Koordinasikan dengan gudang.')
            elif shortage:
                blockers.append(f'{line.product.name}: diminta {line.quantity}, tersedia {available}, kurang {shortage} {line.product.unit}.')
        elif order.status == 'CONFIRMED' and role in {'MANAGER', 'WAREHOUSE'}:
            if balance.on_hand < line.quantity or balance.reserved < line.quantity:
                blockers.append(f'{line.product.name}: dibutuhkan {line.quantity}, fisik {balance.on_hand}, reservasi {balance.reserved} {line.product.unit}. Kekurangan fisik {max(0, line.quantity - balance.on_hand)}, kekurangan reservasi {max(0, line.quantity - balance.reserved)}. Periksa stok dan alokasi pesanan.')
    allocations, swaps = {}, []
    if role != 'SALES':
        for line in lines:
            allocations[str(line.pk)] = [
                {'id': str(allocation.pk), 'batch_code': allocation.batch.code, 'quantity': str(allocation.quantity),
                 'expiry_date': allocation.batch.expiry_date, 'status': allocation.batch.status,
                 'status_label': allocation.batch.get_status_display()}
                for allocation in line.allocations.select_related('batch')
            ]
            swaps.extend(
                {'id': str(swap.pk), 'product_sku': line.product.sku, 'from_code': swap.from_batch.code,
                 'to_code': swap.to_batch.code, 'quantity': str(swap.quantity), 'reason': swap.reason,
                 'actor': swap.actor.get_full_name() or swap.actor.username, 'created_at': swap.created_at}
                for swap in line.batch_swaps.select_related('from_batch', 'to_batch', 'actor')
            )
    swaps.sort(key=lambda swap: (swap['created_at'], swap['id']), reverse=True)
    can_swap = role in {'WAREHOUSE', 'MANAGER'} and order.status == 'CONFIRMED' and bool(lines)
    return {'order': order, 'lines': lines, 'line_checks': checks, 'blockers': blockers,
            'back_url': order_return_url(request), 'detail_url': order_detail_url(request, order.pk),
            'can_confirm': role in {'SALES', 'MANAGER'} and order.status == 'DRAFT',
            'can_ship': role in {'WAREHOUSE', 'MANAGER'} and order.status == 'CONFIRMED',
            'can_cancel': order.status in {'DRAFT', 'CONFIRMED'} and (role != 'WAREHOUSE' or order.status == 'CONFIRMED'),
            'cancel_form': CancelOrderForm(),
            'confirm_form': ConfirmOrderForm(initial={'expected_receipt_date': order.expected_receipt_date}),
            'allocations': allocations, 'batch_swaps': swaps, 'can_swap': can_swap,
            'swap_form': BatchSwapForm(order=order) if can_swap else None}


@login_required
@require_GET
def order_detail(request, order_id):
    order = get_object_or_404(orders_for(request.user), pk=order_id)
    return page(request, 'crm/order_detail.html', _order_context(request, order))


def _transition(request, order_id, operation, *args, extra=None):
    try:
        order = operation(request.user, order_id, *args)
    except BusinessError as error:
        order = orders_for(request.user).filter(pk=order_id).first()
        if not order:
            return page(request, 'crm/error.html', {'error': error, 'back_url': order_return_url(request)}, status=error.status_code)
        context = _order_context(request, order)
        context['error'] = error
        if extra:
            context.update(extra)
        return page(request, 'crm/order_detail.html', context, status=error.status_code)
    messages.success(request, f'Pesanan OF-{order.id:04d}: {'Menunggu pengiriman' if order.status == 'CONFIRMED' else order.get_status_display()}.')
    if role_of(request.user) == 'WAREHOUSE' and order.status == 'CANCELLED':
        return redirect(order_return_url(request))
    return redirect(order_detail_url(request, order_id))


@login_required
@require_POST
def order_confirm(request, order_id):
    form = ConfirmOrderForm(request.POST)
    if not form.is_valid():
        order = get_object_or_404(orders_for(request.user), pk=order_id)
        context = _order_context(request, order)
        context.update(confirm_form=form, dialog='confirm')
        return page(request, 'crm/order_detail.html', context, status=400)
    extra = {'confirm_form': form, 'dialog': 'confirm'}
    return _transition(request, order_id, confirm_order, form.cleaned_data['expected_receipt_date'], extra=extra)


@login_required
@require_POST
def order_ship(request, order_id):
    return _transition(request, order_id, ship_order)


@login_required
@require_POST
def order_swap(request, order_id):
    require_role(request.user, {'WAREHOUSE', 'MANAGER'})
    order = get_object_or_404(orders_for(request.user), pk=order_id)
    form = BatchSwapForm(request.POST, order=order)
    if not form.is_valid():
        context = _order_context(request, order)
        context.update(swap_form=form, dialog='swap')
        return page(request, 'crm/order_detail.html', context, status=400)
    fields = form.cleaned_data
    extra = {'swap_form': form, 'dialog': 'swap'}
    return _transition(request, order_id, swap_batch, fields['line_id'], fields['from_batch_id'],
                       fields['to_batch_id'], fields['quantity'], fields['reason'], extra=extra)


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


@login_required
@require_POST
def order_cancel(request, order_id):
    form = CancelOrderForm(request.POST)
    if not form.is_valid():
        order = get_object_or_404(orders_for(request.user), pk=order_id)
        context = _order_context(request, order)
        context.update(cancel_form=form, dialog='cancel')
        return page(request, 'crm/order_detail.html', context, status=400)
    return _transition(request, order_id, cancel_order, form.cleaned_data['reason'])


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
        decision_form=SampleDecisionForm(),
        cancel_form=CancelSampleForm(),
        schedule_form=SampleScheduleForm(),
        outcome_form=SampleOutcomeForm(actor=request.user, request=sample) if role_of(request.user) in {'SALES', 'MANAGER'} else None,
    )
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
    messages.success(request, f'Pengajuan {sample.number} diperbarui: {sample.get_status_display()} · {sample.get_fulfillment_status_display()}.')
    return redirect(sample_detail_url(request, sample_id))


@login_required
@require_POST
def sample_submit(request, sample_id):
    return _sample_transition(request, sample_id, submit_sample_request, extra={"dialog": "submit"})


@login_required
@require_POST
def sample_cancel(request, sample_id):
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
