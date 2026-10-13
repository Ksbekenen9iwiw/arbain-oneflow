import re
from django import forms
from crm.access import active_sales, customers_for, require_role, role_of
from crm.models import ActionDecision, Activity, Customer, Product


class CustomerForm(forms.ModelForm):
    class Meta:
        model = Customer
        fields = ['code', 'name', 'phone', 'address', 'owner', 'is_active']
        widgets = {'address': forms.Textarea(attrs={'rows': 3})}

    def __init__(self, *args, actor, **kwargs):
        super().__init__(*args, **kwargs)
        role = role_of(actor)
        require_role(actor, {'SALES', 'MANAGER'})
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
        fields = ['sku', 'name', 'unit', 'price_rupiah', 'min_stock', 'is_active']

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
    followup_date = forms.DateField(label='Tindak lanjut berikutnya (opsional)', required=False, widget=forms.DateInput(attrs={'type': 'date'}))


class StrictIntegerField(forms.IntegerField):
    def to_python(self, value):
        if value not in self.empty_values and (isinstance(value, bool) or not re.fullmatch(r'[+-]?[0-9]+', str(value).strip())):
            raise forms.ValidationError('Masukkan bilangan bulat tanpa pecahan.')
        return super().to_python(value)


class ProductEditForm(ProductForm):
    price_rupiah = StrictIntegerField(label='Harga jual per satuan (Rp)', min_value=0, max_value=2**63-1, help_text='Masukkan angka rupiah tanpa pemisah ribuan, misalnya 75000.')
    min_stock = StrictIntegerField(label='Batas minimum stok', min_value=0, max_value=2**63-1, help_text='Peringatan muncul jika stok tersedia di bawah jumlah ini.')

    class Meta(ProductForm.Meta):
        fields = ['name', 'price_rupiah', 'min_stock', 'is_active']
        labels = {'name': 'Nama produk', 'is_active': 'Produk aktif dijual'}


class StockReceiptForm(forms.Form):
    quantity = StrictIntegerField(label='Jumlah barang masuk', min_value=1, max_value=2**63-1)
    reason = forms.CharField(label='Alasan / referensi', widget=forms.Textarea(attrs={'rows': 3}))
    operation_id = forms.UUIDField(widget=forms.HiddenInput())


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
        self.fields['product'].label_from_instance = lambda product: f"{product.sku} · {product.name} · harga Rp {format(product.price_rupiah, ',').replace(',', '.')} · tersedia {product.balance.available} {product.unit}"


OrderLineFormSet = forms.formset_factory(OrderLineForm, extra=0, min_num=1, validate_min=True, max_num=50, validate_max=True, absolute_max=50, can_delete=True)


class CancelOrderForm(forms.Form):
    reason = forms.CharField(label='Alasan pembatalan', widget=forms.Textarea(attrs={'rows': 3}))


class ActionDecisionForm(forms.Form):
    key = forms.CharField(max_length=200, widget=forms.HiddenInput())
    outcome = forms.ChoiceField(label='Hasil tindakan', choices=ActionDecision.Outcome.choices)
    note = forms.CharField(label='Hasil interaksi / alasan', required=False, widget=forms.Textarea(attrs={'rows': 2}))
    next_date = forms.DateField(label='Tunda sampai', required=False, widget=forms.DateInput(attrs={'type': 'date'}))
    order_id = StrictIntegerField(label='Nomor pesanan terkait (opsional)', required=False, min_value=1, max_value=2**63-1)


class SalesTargetForm(forms.Form):
    sales = forms.ModelChoiceField(label='Sales', queryset=Customer.objects.none())
    month = forms.DateField(label='Bulan target', input_formats=['%Y-%m', '%Y-%m-%d'], widget=forms.DateInput(format='%Y-%m', attrs={'type': 'month'}))
    target_rupiah = StrictIntegerField(label='Target nilai barang terkirim (Rp)', min_value=0, max_value=2**63-1)

    def __init__(self, *args, actor, **kwargs):
        require_role(actor, {'MANAGER'})
        super().__init__(*args, **kwargs)
        self.fields['sales'].queryset = active_sales()

    def clean_month(self):
        return self.cleaned_data['month'].replace(day=1)
