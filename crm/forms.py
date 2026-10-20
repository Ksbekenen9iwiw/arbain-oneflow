import re
from django import forms
from crm.access import active_sales, customers_for, orders_for, require_role, role_of
from crm.models import Activity, Customer, Order, Product, ProductSupplySetting, SampleRequest, StockBatch


class CustomerForm(forms.ModelForm):
    class Meta:
        model = Customer
        fields = ['code', 'name', 'phone', 'address', 'owner', 'is_active']
        widgets = {'address': forms.Textarea(attrs={'rows': 3})}

    def __init__(self, *args, actor, **kwargs):
        super().__init__(*args, **kwargs)
        role = role_of(actor)
        require_role(actor, {'SALES', 'MANAGER'})
        self.fields['code'].help_text = 'Kode unik pelanggan, misalnya CUS013. Gunakan kode yang belum terdaftar.'
        self.fields['is_active'].label = 'Pelanggan aktif'
        self.fields['is_active'].help_text = 'Pelanggan aktif dapat dipilih saat membuat pesanan baru.'
        self.fields['owner'].queryset = active_sales()
        if role == 'SALES':
            self.fields['owner'].queryset = self.fields['owner'].queryset.filter(pk=actor.pk)
            self.fields['owner'].initial = actor.pk
            self.fields['owner'].widget = forms.HiddenInput()
            self.fields['owner'].required = False
            self.actor = actor

    def clean_owner(self):
        return self.cleaned_data.get('owner') or getattr(self, 'actor', None)


class ProductForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = ['sku', 'name', 'unit', 'price_rupiah', 'min_stock', 'min_shelf_life_days', 'is_active']
        labels = {'name': 'Nama produk', 'unit': 'Satuan', 'price_rupiah': 'Harga jual per satuan (Rp)', 'min_stock': 'Batas minimum stok', 'min_shelf_life_days': 'Minimum sisa masa simpan (hari)', 'is_active': 'Produk aktif dijual'}
        help_texts = {'price_rupiah': 'Masukkan angka rupiah tanpa pemisah ribuan, misalnya 75000.', 'min_stock': 'Peringatan muncul jika stok tersedia di bawah jumlah ini.', 'min_shelf_life_days': 'Kosongkan bila belum ada kebijakan. Saat terisi, konfirmasi hanya memakai batch yang kelak diterima sebelum kedaluwarsa.'}

    def __init__(self, *args, actor, **kwargs):
        require_role(actor, {'WAREHOUSE', 'MANAGER'})
        super().__init__(*args, **kwargs)


class ActivityForm(forms.ModelForm):
    class Meta:
        model = Activity
        fields = ['kind', 'stage', 'scheduled_date', 'followup_date', 'status', 'note', 'result']
        widgets = {'scheduled_date': forms.DateInput(attrs={'type': 'date'}), 'followup_date': forms.DateInput(attrs={'type': 'date'}), 'note': forms.Textarea(attrs={'rows': 3}), 'result': forms.Textarea(attrs={'rows': 3})}

    def __init__(self, *args, actor, **kwargs):
        require_role(actor, {'SALES', 'MANAGER'})
        super().__init__(*args, **kwargs)
        self.fields['followup_date'].help_text = 'Pada aktivitas selesai, tanggal ini membuat rencana tindak lanjut baru.'


class ActivityCompletionForm(forms.Form):
    result = forms.CharField(label='Hasil interaksi', widget=forms.Textarea(attrs={'rows': 3}))
    stage = forms.ChoiceField(label='Tahap prospek', choices=Activity.Stage.choices)
    followup_date = forms.DateField(label='Tindak lanjut berikutnya (opsional)', help_text='Membuat satu aktivitas baru setelah hasil disimpan. Aktivitas ini tetap ditandai selesai.', required=False, widget=forms.DateInput(attrs={'type': 'date'}))


class StrictIntegerField(forms.IntegerField):
    def to_python(self, value):
        if value not in self.empty_values and (isinstance(value, bool) or not re.fullmatch(r'[+-]?[0-9]+', str(value).strip())):
            raise forms.ValidationError('Masukkan bilangan bulat tanpa pecahan.')
        return super().to_python(value)


class ProductEditForm(ProductForm):
    price_rupiah = StrictIntegerField(label='Harga jual per satuan (Rp)', min_value=0, max_value=2**63-1, help_text='Masukkan angka rupiah tanpa pemisah ribuan, misalnya 75000.')
    min_stock = StrictIntegerField(label='Batas minimum stok', min_value=0, max_value=2**63-1, help_text='Peringatan muncul jika stok tersedia di bawah jumlah ini.')
    min_shelf_life_days = StrictIntegerField(label='Minimum sisa masa simpan (hari)', min_value=0, max_value=3650, required=False, help_text='Kosongkan bila belum ada kebijakan. Angka 0 mewajibkan batch bertanggal dan belum kedaluwarsa.')

    class Meta(ProductForm.Meta):
        fields = ['name', 'price_rupiah', 'min_stock', 'min_shelf_life_days', 'is_active']
        labels = {'name': 'Nama produk', 'is_active': 'Produk aktif dijual'}


class StockReceiptForm(forms.Form):
    quantity = StrictIntegerField(label='Jumlah barang masuk', min_value=1, max_value=2**63-1)
    batch_code = forms.CharField(label='Kode batch', required=False, max_length=60, help_text='Kosongkan bila barang tidak dilacak per batch.')
    received_date = forms.DateField(label='Tanggal penerimaan', required=False, widget=forms.DateInput(attrs={'type': 'date'}))
    expiry_date = forms.DateField(label='Tanggal kedaluwarsa', required=False, widget=forms.DateInput(attrs={'type': 'date'}))
    reason = forms.CharField(label='Alasan / referensi', widget=forms.Textarea(attrs={'rows': 3}))
    operation_id = forms.UUIDField(widget=forms.HiddenInput())

    def clean(self):
        data = super().clean()
        has_code = bool((data.get('batch_code') or '').strip())
        has_dates = bool(data.get('received_date') or data.get('expiry_date'))
        if has_dates and not has_code:
            self.add_error('batch_code', 'Isi kode batch bila mencantumkan tanggal penerimaan atau kedaluwarsa.')
        if data.get('received_date') and data.get('expiry_date') and data['expiry_date'] < data['received_date']:
            self.add_error('expiry_date', 'Tanggal kedaluwarsa tidak boleh sebelum tanggal penerimaan.')
        return data


class StockCountForm(forms.Form):
    counted_quantity = StrictIntegerField(label='Jumlah fisik hasil hitung', min_value=0, max_value=2**63-1)
    reason = forms.CharField(label='Alasan koreksi', widget=forms.Textarea(attrs={'rows': 3}))
    operation_id = forms.UUIDField(widget=forms.HiddenInput())


class OrderForm(forms.Form):
    customer = forms.ModelChoiceField(label='Pelanggan', queryset=Customer.objects.none())

    def __init__(self, *args, actor, **kwargs):
        super().__init__(*args, **kwargs)
        require_role(actor, {'SALES', 'MANAGER'})
        self.fields['customer'].queryset = customers_for(actor).filter(is_active=True)


class OrderLineForm(forms.Form):
    product = forms.ModelChoiceField(label='Produk', queryset=Product.objects.filter(is_active=True).select_related('balance'))
    quantity = StrictIntegerField(label='Jumlah', min_value=1, max_value=2**63-1)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['product'].label_from_instance = lambda product: f"{product.sku} · {product.name}"


OrderLineFormSet = forms.formset_factory(OrderLineForm, extra=0, min_num=1, validate_min=True, max_num=50, validate_max=True, absolute_max=50, can_delete=True)


class SampleRequestForm(forms.Form):
    customer = forms.ModelChoiceField(label='Pelanggan / calon pelanggan', queryset=Customer.objects.none())
    purpose = forms.CharField(label='Tujuan pemberian', required=False, widget=forms.Textarea(attrs={'rows': 3}))
    customer_need = forms.CharField(label='Kebutuhan pelanggan', required=False, widget=forms.Textarea(attrs={'rows': 3}))
    potential_orders = forms.CharField(label='Potensi pesanan', required=False, widget=forms.Textarea(attrs={'rows': 3}))
    business_profile = forms.CharField(label='Profil usaha calon pelanggan', required=False, widget=forms.Textarea(attrs={'rows': 3}))
    notes = forms.CharField(label='Catatan pendukung', required=False, widget=forms.Textarea(attrs={'rows': 3}))

    def __init__(self, *args, actor, **kwargs):
        super().__init__(*args, **kwargs)
        require_role(actor, {'SALES', 'MANAGER'})
        self.fields['customer'].queryset = customers_for(actor).filter(is_active=True)


class SampleLineForm(OrderLineForm):
    quantity = StrictIntegerField(label='Jumlah sampel', min_value=1, max_value=2**63-1)


SampleLineFormSet = forms.formset_factory(SampleLineForm, extra=0, min_num=1, validate_min=True, max_num=50, validate_max=True, absolute_max=50, can_delete=True)


class SampleDecisionForm(forms.Form):
    decision = forms.ChoiceField(label='Keputusan', choices=[
        (SampleRequest.Status.APPROVED, 'Setujui'),
        (SampleRequest.Status.REJECTED, 'Tolak'),
    ])
    note = forms.CharField(label='Catatan keputusan / alasan', required=False, widget=forms.Textarea(attrs={'rows': 3}))


class CancelSampleForm(forms.Form):
    reason = forms.CharField(label='Alasan pembatalan', widget=forms.Textarea(attrs={'rows': 3}))


class SamplePolicyForm(forms.Form):
    repeat_threshold = StrictIntegerField(label='Ambang pemberian sampel berulang', min_value=1, max_value=1000)
    review_period_days = StrictIntegerField(label='Periode riwayat yang diperiksa (hari)', min_value=1, max_value=3650)
    evaluation_days = StrictIntegerField(label='Masa evaluasi setelah diterima (hari)', min_value=0, max_value=3650)

    def __init__(self, *args, actor, **kwargs):
        require_role(actor, {'MANAGER'})
        super().__init__(*args, **kwargs)


class SampleScheduleForm(forms.Form):
    followup_date = forms.DateField(label='Tanggal tindak lanjut', widget=forms.DateInput(attrs={'type': 'date'}))
    note = forms.CharField(label='Catatan jadwal', required=False, widget=forms.Textarea(attrs={'rows': 2}))


class SampleOutcomeForm(forms.Form):
    outcome = forms.ChoiceField(label='Hasil evaluasi', choices=[
        (SampleRequest.Outcome.EVALUATING, 'Masih mengevaluasi'),
        (SampleRequest.Outcome.NOT_INTERESTED, 'Tidak berminat'),
        (SampleRequest.Outcome.NO_RESPONSE, 'Belum memberikan tanggapan'),
        (SampleRequest.Outcome.PURCHASED, 'Membeli'),
    ])
    response = forms.CharField(label='Tanggapan pelanggan', required=False, widget=forms.Textarea(attrs={'rows': 3}))
    note = forms.CharField(label='Catatan evaluasi', required=False, widget=forms.Textarea(attrs={'rows': 3}))
    order_id = forms.ModelChoiceField(label='Pesanan terkait (untuk hasil membeli)', required=False, queryset=Order.objects.none())

    def __init__(self, *args, actor, request=None, **kwargs):
        super().__init__(*args, **kwargs)
        require_role(actor, {'SALES', 'MANAGER'})
        records = orders_for(actor).filter(status='SHIPPED')
        if request is not None:
            records = records.filter(customer=request.customer)
        self.fields['order_id'].queryset = records
        self.fields['order_id'].label_from_instance = lambda order: f'OF-{order.pk:04d} · {order.customer.name}'
        self.fields['order_id'].help_text = 'Hanya pesanan terkirim milik pelanggan ini. Pilih jika pembelian benar-benar merupakan hasil pemberian sampel.'
        if request is not None and not self.is_bound:
            self.initial.update(outcome=request.outcome if request.outcome != SampleRequest.Outcome.NOT_FOLLOWED_UP else SampleRequest.Outcome.EVALUATING,
                                order_id=request.order_id)

    def clean(self):
        data = super().clean()
        if data.get('outcome') == SampleRequest.Outcome.PURCHASED and not data.get('order_id'):
            self.add_error('order_id', 'Pilih pesanan terkirim untuk mencatat hasil membeli.')
        if data.get('outcome') != SampleRequest.Outcome.PURCHASED:
            data['order_id'] = None
        return data


class CancelOrderForm(forms.Form):
    reason = forms.CharField(label='Alasan pembatalan', widget=forms.Textarea(attrs={'rows': 3}))


class ConfirmOrderForm(forms.Form):
    expected_receipt_date = forms.DateField(label='Estimasi tanggal diterima pelanggan', required=False, widget=forms.DateInput(attrs={'type': 'date'}), help_text='Wajib bila produk memiliki kebijakan masa simpan minimum; dipakai untuk memilih batch dengan FEFO.')


class BatchSwapForm(forms.Form):
    line_id = forms.ChoiceField(label='Baris pesanan')
    from_batch_id = forms.ChoiceField(label='Batch asal')
    to_batch_id = forms.ChoiceField(label='Batch tujuan')
    quantity = StrictIntegerField(label='Jumlah diganti', min_value=1, max_value=2**63-1)
    reason = forms.CharField(label='Alasan penggantian', widget=forms.Textarea(attrs={'rows': 2}))

    def __init__(self, *args, order=None, **kwargs):
        super().__init__(*args, **kwargs)
        if order is None:
            return
        # Choices come from the confirmed order so the warehouse picks real lots;
        # the service still revalidates product, availability and shelf life.
        lines = list(order.lines.select_related('product').order_by('product_id'))
        self.fields['line_id'].choices = [(str(line.pk), f'{line.product.sku} · {line.product.name}') for line in lines]
        sources, targets, seen_source, seen_target = [], [], set(), set()
        for line in lines:
            for allocation in line.allocations.select_related('batch'):
                if allocation.batch_id not in seen_source:
                    seen_source.add(allocation.batch_id)
                    sources.append((str(allocation.batch_id), f'{line.product.sku} · {allocation.batch.code}'))
            for batch in line.product.batches.filter(status=StockBatch.Status.ACTIVE):
                if batch.pk not in seen_target:
                    seen_target.add(batch.pk)
                    targets.append((str(batch.pk), f'{line.product.sku} · {batch.code} · bebas {batch.available}'))
        self.fields['from_batch_id'].choices = sources
        self.fields['to_batch_id'].choices = targets


class BatchStatusForm(forms.Form):
    status = forms.ChoiceField(label='Status batch', choices=StockBatch.Status.choices)


class ActionDecisionForm(forms.Form):
    key = forms.CharField(max_length=200, widget=forms.HiddenInput())
    outcome = forms.ChoiceField(label='Keputusan untuk rekomendasi', choices=[('', 'Pilih keputusan'), ('DONE', 'Sudah ditindaklanjuti'), ('SNOOZED', 'Ingatkan rekomendasi nanti'), ('DISMISSED', 'Tutup rekomendasi ini')])
    note = forms.CharField(label='Hasil interaksi / alasan', required=False, widget=forms.Textarea(attrs={'rows': 2}))
    next_date = forms.DateField(label='Ingatkan rekomendasi pada', help_text='Tidak mengubah tanggal kunjungan atau tindak lanjut.', required=False, widget=forms.DateInput(attrs={'type': 'date'}))
    order_id = StrictIntegerField(label='Nomor pesanan terkait (opsional)', required=False, min_value=1, max_value=2**63-1)


    def clean(self):
        from django.utils import timezone
        data = super().clean()
        outcome = data.get('outcome')
        if outcome == 'DISMISSED' and not data.get('note'):
            self.add_error('note', 'Tuliskan alasan menutup rekomendasi ini.')
        elif outcome == 'DONE' and not data.get('note') and not data.get('order_id'):
            self.add_error('note', 'Catat hasil interaksi atau pilih pesanan terkait.')
        if outcome == 'SNOOZED' and (not data.get('next_date') or data['next_date'] <= timezone.localdate()):
            self.add_error('next_date', 'Pilih tanggal setelah hari ini.')
        return data


class SalesTargetForm(forms.Form):
    sales = forms.ModelChoiceField(label='Sales', queryset=Customer.objects.none())
    month = forms.DateField(label='Bulan target', input_formats=['%Y-%m', '%Y-%m-%d'], widget=forms.DateInput(format='%Y-%m', attrs={'type': 'month'}))
    target_rupiah = StrictIntegerField(label='Target nilai barang terkirim (Rp)', min_value=0, max_value=2**63-1)

    def __init__(self, *args, actor, **kwargs):
        require_role(actor, {'MANAGER'})
        super().__init__(*args, **kwargs)
        self.fields['sales'].queryset = active_sales()
        self.fields['sales'].label_from_instance = lambda sales: sales.get_full_name() or sales.username
        self.fields['target_rupiah'].help_text = 'Target tersimpan dimuat saat sales atau bulan diganti. Menyimpan akan memperbarui target periode tersebut.'

    def clean_month(self):
        return self.cleaned_data['month'].replace(day=1)


class SupplySettingForm(forms.Form):
    analysis_period_days = forms.TypedChoiceField(label='Periode analisis penjualan', choices=ProductSupplySetting.Period.choices, coerce=int, help_text='Hanya hari kalender penuh yang dihitung; penjualan hari ini belum ikut.')
    lead_time_days = StrictIntegerField(label='Waktu pengisian ulang (hari)', min_value=0, max_value=3650, help_text='Lama dari pemesanan sampai barang bisa dijual. 0 berarti datang di hari yang sama.')
    coverage_target_days = StrictIntegerField(label='Target cakupan setelah barang datang (hari)', min_value=1, max_value=3650, help_text='Berapa hari stok perlu mencukupi setelah pengadaan tiba. Cadangan dihitung terpisah.')
    safety_stock_days = StrictIntegerField(label='Cadangan (hari kebutuhan)', min_value=0, max_value=3650, help_text='Bantalan terpisah dari target cakupan. 0 berarti tanpa cadangan.')

    def __init__(self, *args, actor, **kwargs):
        require_role(actor, {'MANAGER'})
        super().__init__(*args, **kwargs)


class PurchaseOrderForm(forms.Form):
    quantity = StrictIntegerField(label='Jumlah dipesan', min_value=1, max_value=2**63 - 1)
    expected_date = forms.DateField(label='Estimasi kedatangan', required=False, widget=forms.DateInput(attrs={'type': 'date'}), help_text='Kosongkan bila pemasok belum memastikan tanggal.')
    note = forms.CharField(label='Referensi / catatan', required=False, widget=forms.Textarea(attrs={'rows': 2}))

    def __init__(self, *args, actor, **kwargs):
        require_role(actor, {'MANAGER'})
        super().__init__(*args, **kwargs)


class ReceivePurchaseForm(StockReceiptForm):
    """Receipt against a purchase order: reason comes from the PO, not the user."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        del self.fields['reason']
        self.fields['quantity'].label = 'Jumlah diterima sekarang'
