from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class Customer(models.Model):
    code = models.CharField('Kode pelanggan', max_length=40, unique=True)
    name = models.CharField('Nama pelanggan', max_length=160)
    phone = models.CharField('Nomor kontak', max_length=40, blank=True)
    address = models.TextField('Alamat', blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='customers', verbose_name='Sales penanggung jawab')
    is_active = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class Product(models.Model):
    sku = models.CharField('SKU', max_length=40, unique=True)
    name = models.CharField('Nama produk', max_length=160)
    unit = models.CharField('Satuan', max_length=30, default='botol')
    price_rupiah = models.PositiveBigIntegerField('Harga satuan (Rp)')
    min_stock = models.PositiveIntegerField('Batas minimum stok', default=5)
    is_active = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['sku']

    def __str__(self):
        return f'{self.sku} · {self.name}'


class InventoryBalance(models.Model):
    product = models.OneToOneField(Product, on_delete=models.PROTECT, related_name='balance')
    on_hand = models.PositiveIntegerField(default=0)
    reserved = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def available(self):
        return self.on_hand - self.reserved


class Activity(models.Model):
    class Kind(models.TextChoices):
        VISIT = 'VISIT', 'Kunjungan'
        INTERACTION = 'INTERACTION', 'Interaksi'
        FOLLOWUP = 'FOLLOWUP', 'Tindak lanjut'

    class Stage(models.TextChoices):
        NEW = 'NEW', 'Prospek baru'
        CONTACTED = 'CONTACTED', 'Sudah dihubungi'
        INTERESTED = 'INTERESTED', 'Tertarik'
        WAITING = 'WAITING', 'Menunggu keputusan'
        WON = 'WON', 'Sepakat'
        LOST = 'LOST', 'Tidak berlanjut'

    class Status(models.TextChoices):
        PLANNED = 'PLANNED', 'Direncanakan'
        DONE = 'DONE', 'Selesai'

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='activities')
    sales = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='activities')
    kind = models.CharField('Jenis aktivitas', max_length=20, choices=Kind.choices, default=Kind.VISIT)
    stage = models.CharField('Tahap prospek', max_length=20, choices=Stage.choices, default=Stage.NEW)
    scheduled_date = models.DateField('Tanggal kunjungan', null=True, blank=True)
    followup_date = models.DateField('Tanggal tindak lanjut', null=True, blank=True)
    status = models.CharField('Status', max_length=12, choices=Status.choices, default=Status.PLANNED)
    note = models.TextField('Catatan', blank=True)
    result = models.TextField('Hasil interaksi', blank=True)
    completed_at = models.DateTimeField('Waktu hasil disimpan', null=True, blank=True)
    followup_of = models.ForeignKey('self', on_delete=models.PROTECT, related_name='followups', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-pk']
        constraints = [models.CheckConstraint(condition=Q(status='PLANNED') | ~Q(result=''), name='done_activity_has_result')]

    def clean(self):
        if self.status == self.Status.DONE and not self.result.strip():
            raise ValidationError({'result': 'Aktivitas selesai wajib memiliki hasil interaksi.'})
        if self.status == self.Status.PLANNED and self.kind == self.Kind.VISIT and not self.scheduled_date:
            raise ValidationError({'scheduled_date': 'Isi tanggal kunjungan.'})
        if self.status == self.Status.PLANNED and self.kind == self.Kind.FOLLOWUP and not self.followup_date:
            raise ValidationError({'followup_date': 'Isi tanggal tindak lanjut.'})


class StockMovement(models.Model):
    class Kind(models.TextChoices):
        RECEIPT = 'RECEIPT', 'Barang masuk'
        ADJUSTMENT = 'ADJUSTMENT', 'Koreksi fisik'
        SHIPMENT = 'SHIPMENT', 'Pengiriman'

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='movements')
    delta = models.BigIntegerField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    source_ref = models.CharField(max_length=100, unique=True)
    input_quantity = models.PositiveBigIntegerField()
    order = models.ForeignKey('Order', on_delete=models.PROTECT, related_name='movements', null=True, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='stock_movements')
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-pk']


class Order(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        CONFIRMED = 'CONFIRMED', 'Dikonfirmasi'
        CANCELLED = 'CANCELLED', 'Dibatalkan'
        SHIPPED = 'SHIPPED', 'Terkirim'

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='orders')
    sales = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='orders')
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    total_rupiah = models.PositiveBigIntegerField(default=0)
    cancel_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='confirmed_orders', null=True, blank=True)
    shipped_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='shipped_orders', null=True, blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='cancelled_orders', null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-pk']


class OrderLine(models.Model):
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name='lines')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='order_lines')
    quantity = models.PositiveBigIntegerField()
    unit_price_rupiah = models.PositiveBigIntegerField()

    class Meta:
        ordering = ['product_id']
        constraints = [models.UniqueConstraint(fields=['order', 'product'], name='unique_order_product'), models.CheckConstraint(condition=Q(quantity__gte=1), name='order_quantity_positive')]

    @property
    def subtotal_rupiah(self):
        return self.quantity * self.unit_price_rupiah


class ActionDecision(models.Model):
    class Outcome(models.TextChoices):
        DONE = 'DONE', 'Selesai'
        SNOOZED = 'SNOOZED', 'Tunda'
        DISMISSED = 'DISMISSED', 'Tolak dengan alasan'

    key = models.CharField(max_length=200, unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='action_decisions')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, null=True, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='action_decisions')
    outcome = models.CharField(max_length=12, choices=Outcome.choices)
    note = models.TextField(blank=True)
    next_date = models.DateField(null=True, blank=True)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class SalesTarget(models.Model):
    sales = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='targets')
    month = models.DateField()
    target_rupiah = models.PositiveBigIntegerField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['sales', 'month'], name='unique_sales_month_target'), models.CheckConstraint(condition=Q(month__day=1), name='target_first_day_of_month')]
