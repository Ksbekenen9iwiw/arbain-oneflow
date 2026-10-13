from uuid import uuid4
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from crm.access import customers_for, orders_for, require_role, role_of
from crm.errors import BusinessError
from crm.forms import ActionDecisionForm, ActivityCompletionForm, ActivityForm, CancelOrderForm, CustomerForm, OrderForm, OrderLineFormSet, ProductEditForm, ProductForm, StockCountForm, StockReceiptForm
from crm.models import Activity, InventoryBalance, Product, SalesTarget, StockMovement
from crm.selectors import customer_history, dashboard_metrics
from crm.forms import SalesTargetForm
from crm.services.inventory import receive_stock, reconcile_stock
from crm.services.orders import cancel_order, confirm_order, create_draft, ship_order
from crm.services.actions import list_actions, record_action


def page(request, template, context=None, status=200):
    common = {'role': role_of(request.user), 'demo_mode': settings.ONEFLOW_DEMO, 'today_date': timezone.localdate()}
    common.update(context or {})
    return render(request, template, common, status=status)


@login_required
@require_GET
def today(request):
    all_actions = list_actions(request.user, timezone.localdate(), limit=None)
    shown = all_actions if request.GET.get('all') == '1' else all_actions[:5]
    context = {'actions': shown, 'action_count': len(all_actions), 'show_all': request.GET.get('all') == '1', 'updated_at': timezone.now(), 'metrics': dashboard_metrics(request.user, timezone.localdate()), 'pending_orders': orders_for(request.user).filter(status='CONFIRMED')[:5]}
    if role_of(request.user) == 'MANAGER':
        context['target_form'] = SalesTargetForm(actor=request.user, initial={'month': timezone.localdate().replace(day=1)})
    return page(request, 'crm/today.html', context)


@login_required
@require_GET
def customers(request):
    records = customers_for(request.user)
    query = request.GET.get('q', '').strip()
    if query:
        from django.db.models import Q
        records = records.filter(Q(name__icontains=query) | Q(code__icontains=query))
    return page(request, 'crm/customers.html', {'customers': records, 'query': query})


@login_required
@require_http_methods(['GET', 'POST'])
def customer_create(request):
    form = CustomerForm(request.POST or None, actor=request.user)
    if request.method == 'POST' and form.is_valid():
        customer = form.save()
        messages.success(request, 'Pelanggan tersimpan.')
        return redirect('customer_detail', customer_id=customer.id)
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Tambah pelanggan', 'back_url': '/customers/'}, status=400 if request.method == 'POST' else 200)


@login_required
@require_GET
def customer_detail(request, customer_id):
    return page(request, 'crm/customer_detail.html', customer_history(request.user, customer_id))


@login_required
@require_http_methods(['GET', 'POST'])
def activity_create(request, customer_id):
    customer = get_object_or_404(customers_for(request.user), pk=customer_id)
    form = ActivityForm(request.POST or None, actor=request.user)
    if request.method == 'POST' and form.is_valid():
        activity = form.save(commit=False)
        activity.customer = customer
        activity.sales = customer.owner
        with transaction.atomic():
            activity.save()
            if activity.status == 'DONE' and activity.followup_date:
                Activity.objects.create(customer=customer, sales=customer.owner, kind='FOLLOWUP', stage=activity.stage, followup_date=activity.followup_date, note=activity.result)
        messages.success(request, 'Aktivitas tersimpan.')
        return redirect('customer_detail', customer_id=customer.id)
    return page(request, 'crm/form.html', {'form': form, 'heading': f'Catat aktivitas · {customer.name}', 'back_url': f'/customers/{customer.id}/'}, status=400 if request.method == 'POST' else 200)


@login_required
@require_http_methods(['GET', 'POST'])
def activity_complete(request, activity_id):
    activity = get_object_or_404(Activity.objects.filter(customer__in=customers_for(request.user)), pk=activity_id)
    form = ActivityCompletionForm(request.POST or None, initial={'stage': activity.stage})
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            activity.refresh_from_db()
            if activity.status == Activity.Status.PLANNED:
                activity.status = Activity.Status.DONE
                activity.result = form.cleaned_data['result']
                activity.stage = form.cleaned_data['stage']
                activity.save(update_fields=['status', 'result', 'stage'])
                if form.cleaned_data['followup_date']:
                    Activity.objects.create(customer=activity.customer, sales=activity.sales, kind='FOLLOWUP', stage=activity.stage, followup_date=form.cleaned_data['followup_date'], note=activity.result)
        messages.success(request, 'Hasil aktivitas tersimpan.')
        return redirect('customer_detail', customer_id=activity.customer_id)
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Selesaikan aktivitas', 'back_url': f'/customers/{activity.customer_id}/'}, status=400 if request.method == 'POST' else 200)


@login_required
@require_http_methods(['GET', 'POST'])
def product_create(request):
    form = ProductForm(request.POST or None, actor=request.user)
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            product = form.save()
            InventoryBalance.objects.create(product=product)
        messages.success(request, 'Produk tersimpan dengan saldo awal nol. Catat barang masuk untuk mengisi stok.')
        return redirect('/stock/')
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Tambah produk', 'back_url': '/stock/'}, status=400 if request.method == 'POST' else 200)


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
        return redirect('stock')
    return page(request, 'crm/product_edit.html', {'form': form, 'product': product, 'original_price': original_price}, status=400 if request.method == 'POST' else 200)


@login_required
@require_GET
def stock(request):
    role = role_of(request.user)
    products = list(Product.objects.select_related('balance').all())
    stock_summary = {'product_count': len(products), 'low_stock_count': sum(product.is_active and product.balance.available < product.min_stock for product in products), 'conflict_count': sum(product.balance.available < 0 for product in products)}
    movements = StockMovement.objects.select_related('product', 'actor')[:30] if role != 'SALES' else []
    return page(request, 'crm/stock.html', {'products': products, 'movements': movements, 'stock_summary': stock_summary})


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
            form.add_error(None, f'{error.code}: {error.message}')
            status = error.status_code
        else:
            messages.success(request, 'Mutasi stok tersimpan.')
            return redirect('stock')
    heading = ('Hitung & koreksi fisik' if reconcile else 'Barang masuk') + f' · {product.name}'
    return page(request, 'crm/form.html', {'form': form, 'heading': heading, 'back_url': '/stock/', 'help_text': f'Saldo tersedia saat form dibuka: {product.balance.available} {product.unit}. Semua perubahan dicatat dalam mutasi.'}, status=status)


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
    records = orders_for(request.user)
    status = request.GET.get('status', '')
    if status in ['DRAFT', 'CONFIRMED', 'CANCELLED', 'SHIPPED']:
        records = records.filter(status=status)
    return page(request, 'crm/orders.html', {'orders': records, 'selected_status': status})


@login_required
@require_http_methods(['GET', 'POST'])
def order_create(request):
    form = OrderForm(request.POST or None, actor=request.user, initial={'customer': request.GET.get('customer')})
    formset = OrderLineFormSet(request.POST or None, prefix='lines')
    status = 400 if request.method == 'POST' else 200
    if request.method == 'POST' and form.is_valid() and formset.is_valid():
        lines = [{'product_id': line['product'].id, 'quantity': line['quantity']} for line in formset.cleaned_data if line and not line.get('DELETE')]
        try:
            order = create_draft(request.user, form.cleaned_data['customer'].id, lines)
        except BusinessError as error:
            form.add_error(None, f'{error.code}: {error.message}')
            status = error.status_code
        else:
            messages.success(request, 'Draft tersimpan. Stok baru direservasi setelah konfirmasi.')
            return redirect('order_detail', order_id=order.id)
    return page(request, 'crm/form.html', {'form': form, 'formset': formset, 'heading': 'Buat pesanan', 'back_url': '/orders/', 'help_text': 'Harga mengikuti katalog. Draft belum mereservasi stok; ketersediaan diperiksa saat konfirmasi.', 'submit_label': 'Simpan draft'}, status=status)


def _order_context(request, order):
    role = role_of(request.user)
    return {'order': order, 'lines': order.lines.select_related('product', 'product__balance'), 'can_confirm': role in {'SALES', 'MANAGER'} and order.status == 'DRAFT', 'can_ship': role in {'WAREHOUSE', 'MANAGER'} and order.status == 'CONFIRMED', 'can_cancel': order.status in {'DRAFT', 'CONFIRMED'} and (role != 'WAREHOUSE' or order.status == 'CONFIRMED'), 'cancel_form': CancelOrderForm()}


@login_required
@require_GET
def order_detail(request, order_id):
    order = get_object_or_404(orders_for(request.user), pk=order_id)
    return page(request, 'crm/order_detail.html', _order_context(request, order))


def _transition(request, order_id, operation, *args):
    try:
        order = operation(request.user, order_id, *args)
    except BusinessError as error:
        return page(request, 'crm/error.html', {'error': error, 'back_url': f'/orders/{order_id}/'}, status=error.status_code)
    messages.success(request, f'Pesanan OF-{order.id:04d}: {order.get_status_display()}.')
    if role_of(request.user) == 'WAREHOUSE' and order.status == 'CANCELLED':
        return redirect('orders')
    return redirect('order_detail', order_id=order_id)


@login_required
@require_POST
def order_confirm(request, order_id):
    return _transition(request, order_id, confirm_order)


@login_required
@require_POST
def order_ship(request, order_id):
    return _transition(request, order_id, ship_order)


@login_required
@require_POST
def order_cancel(request, order_id):
    form = CancelOrderForm(request.POST)
    if not form.is_valid():
        get_object_or_404(orders_for(request.user), pk=order_id)
        return page(request, 'crm/form.html', {'form': form, 'heading': 'Batalkan pesanan', 'back_url': f'/orders/{order_id}/'}, status=400)
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
            form.add_error(None, f'{error.code}: {error.message}')
            status = error.status_code
        else:
            messages.success(request, 'Hasil tindakan tersimpan.')
            return redirect('today')
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Catat hasil tindakan', 'back_url': '/'}, status=status)


@login_required
@require_POST
def target_save(request):
    form = SalesTargetForm(request.POST, actor=request.user)
    if form.is_valid():
        with transaction.atomic():
            SalesTarget.objects.update_or_create(sales=form.cleaned_data['sales'], month=form.cleaned_data['month'], defaults={'target_rupiah': form.cleaned_data['target_rupiah']})
        messages.success(request, 'Target bulanan tersimpan.')
        return redirect('today')
    return page(request, 'crm/form.html', {'form': form, 'heading': 'Tetapkan target bulanan', 'back_url': '/'}, status=400)
