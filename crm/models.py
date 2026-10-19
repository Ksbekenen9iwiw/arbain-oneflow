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
    # Nullable on purpose: unset is not a zero-day policy, and FEFO refuses to
    # reserve until someone fills it in.
    min_shelf_life_days = models.PositiveIntegerField('Minimum sisa masa simpan saat diterima pelanggan (hari)', null=True, blank=True)
    is_active = models.BooleanField('Aktif', default=True)

    class Meta:
        ordering = ['sku']

    def __str__(self):
        return f'{self.sku} · {self.name}'


class SamplePolicy(models.Model):
    """One configurable policy row; null values mean manual review is required."""

    repeat_threshold = models.PositiveIntegerField('Ambang pemberian berulang', null=True, blank=True)
    review_period_days = models.PositiveIntegerField('Periode riwayat (hari)', null=True, blank=True)
    evaluation_days = models.PositiveIntegerField('Masa evaluasi (hari)', null=True, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='updated_sample_policies', null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_configured(self):
        return None not in (self.repeat_threshold, self.review_period_days, self.evaluation_days)


class ProductSupplySetting(models.Model):
    """Per-product replenishment inputs. Null means belum diisi, never a made-up default."""

    class Period(models.IntegerChoices):
        WEEK = 7, '7 hari'
        BIWEEK = 14, '14 hari'
        MONTH = 30, '30 hari'

    product = models.OneToOneField(Product, on_delete=models.CASCADE, related_name='supply_setting')
    analysis_period_days = models.PositiveSmallIntegerField('Periode analisis', choices=Period.choices, null=True, blank=True)
    lead_time_days = models.PositiveIntegerField('Waktu pengisian ulang (hari)', null=True, blank=True, help_text='0 berarti barang bisa datang di hari yang sama.')
    coverage_target_days = models.PositiveIntegerField('Target cakupan setelah barang datang (hari)', null=True, blank=True, help_text='Lama stok harus mencukupi SETELAH pengadaan tiba, di luar hari cadangan.')
    safety_stock_days = models.PositiveIntegerField('Cadangan (hari kebutuhan)', null=True, blank=True, help_text='Bantalan terpisah; tidak termasuk target cakupan.')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='updated_supply_settings', null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'product supply settings'

    @property
    def is_configured(self):
        return None not in (self.analysis_period_days, self.lead_time_days, self.coverage_target_days, self.safety_stock_days)


class PurchaseOrder(models.Model):
    """Confirmed inbound commitment. Stock only moves when a receipt is recorded."""

    class Status(models.TextChoices):
        CONFIRMED = 'CONFIRMED', 'Berjalan'
        RECEIVED = 'RECEIVED', 'Diterima'
        CANCELLED = 'CANCELLED', 'Dibatalkan'

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='purchase_orders')
    quantity_ordered = models.PositiveBigIntegerField('Jumlah dipesan')
    quantity_received = models.PositiveBigIntegerField('Jumlah diterima', default=0)
    expected_date = models.DateField('Estimasi kedatangan', null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CONFIRMED)
    note = models.TextField('Referensi / catatan', blank=True)
    cancel_reason = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_purchase_orders')
    received_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-pk']

    @property
    def number(self):
        return f'PO-{self.pk:04d}'

    @property
    def remaining(self):
        return self.quantity_ordered - self.quantity_received


class InventoryBalance(models.Model):
    product = models.OneToOneField(Product, on_delete=models.PROTECT, related_name='balance')
    on_hand = models.PositiveIntegerField(default=0)
    reserved = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def available(self):
        return self.on_hand - self.reserved


class StockBatch(models.Model):
    """One physical lot. Batches are the single source of truth for stock; the
    product-level InventoryBalance is only a cache of their sums."""

    LEGACY_CODE = 'BELUM-LENGKAP'

    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Aktif'
        HELD = 'HELD', 'Ditahan'

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='batches')
    code = models.CharField('Kode batch', max_length=60)
    received_date = models.DateField('Tanggal penerimaan', null=True, blank=True)
    expiry_date = models.DateField('Tanggal kedaluwarsa', null=True, blank=True)
    on_hand = models.PositiveIntegerField('Jumlah fisik', default=0)
    reserved = models.PositiveIntegerField('Jumlah dicadangkan', default=0)
    status = models.CharField('Status kelayakan', max_length=12, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['expiry_date', 'received_date', 'pk']
        constraints = [models.UniqueConstraint(fields=['product', 'code'], name='unique_product_batch_code')]

    def __str__(self):
        return f'{self.product.sku} · {self.code}'

    @property
    def available(self):
        return self.on_hand - self.reserved

    @property
    def is_complete(self):
        return self.received_date is not None and self.expiry_date is not None


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
        SAMPLE = 'SAMPLE', 'Pengeluaran sampel'

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='movements')
    batch = models.ForeignKey(StockBatch, on_delete=models.PROTECT, related_name='movements', null=True, blank=True)
    delta = models.BigIntegerField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    source_ref = models.CharField(max_length=100, unique=True)
    input_quantity = models.PositiveBigIntegerField()
    order = models.ForeignKey('Order', on_delete=models.PROTECT, related_name='movements', null=True, blank=True)
    sample_request = models.ForeignKey('SampleRequest', on_delete=models.PROTECT, related_name='movements', null=True, blank=True)
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
    expected_receipt_date = models.DateField('Estimasi tanggal diterima pelanggan', null=True, blank=True)
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


class SampleRequest(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draf'
        SUBMITTED = 'SUBMITTED', 'Diajukan'
        APPROVED = 'APPROVED', 'Disetujui'
        REJECTED = 'REJECTED', 'Ditolak'
        CANCELLED = 'CANCELLED', 'Dibatalkan'

    class FulfillmentStatus(models.TextChoices):
        PENDING = 'PENDING', 'Belum diproses'
        WAITING = 'WAITING', 'Menunggu pengiriman'
        SHIPPED = 'SHIPPED', 'Dikirim'
        RECEIVED = 'RECEIVED', 'Diterima'

    class Outcome(models.TextChoices):
        NOT_FOLLOWED_UP = 'NOT_FOLLOWED_UP', 'Belum ditindaklanjuti'
        EVALUATING = 'EVALUATING', 'Masih mengevaluasi'
        NOT_INTERESTED = 'NOT_INTERESTED', 'Tidak berminat'
        NO_RESPONSE = 'NO_RESPONSE', 'Belum memberikan tanggapan'
        PURCHASED = 'PURCHASED', 'Membeli'

    class Recommendation(models.TextChoices):
        APPROVE = 'APPROVE_SUGGESTED', 'Disarankan disetujui'
        REJECT = 'REJECT_SUGGESTED', 'Disarankan ditolak'
        REVIEW = 'NEEDS_REVIEW', 'Perlu ditinjau'

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='sample_requests')
    sales = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='sample_requests')
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    fulfillment_status = models.CharField(max_length=12, choices=FulfillmentStatus.choices, default=FulfillmentStatus.PENDING)
    outcome = models.CharField(max_length=20, choices=Outcome.choices, default=Outcome.NOT_FOLLOWED_UP)
    purpose = models.TextField('Tujuan pemberian', blank=True)
    customer_need = models.TextField('Kebutuhan pelanggan', blank=True)
    potential_orders = models.TextField('Potensi pesanan', blank=True)
    business_profile = models.TextField('Profil usaha', blank=True)
    notes = models.TextField('Catatan pendukung', blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='decided_sample_requests', null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    recommendation_at_decision = models.CharField(max_length=20, choices=Recommendation.choices, blank=True)
    policy_snapshot = models.JSONField(default=dict, blank=True)
    evidence_snapshot = models.JSONField(default=dict, blank=True)
    shipped_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='shipped_sample_requests', null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='received_sample_requests', null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='cancelled_sample_requests', null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.TextField(blank=True)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name='sample_requests', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-pk']

    @property
    def number(self):
        return f'SP-{self.pk:04d}'


class SampleRequestLine(models.Model):
    request = models.ForeignKey(SampleRequest, on_delete=models.PROTECT, related_name='lines')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='sample_lines')
    quantity = models.PositiveBigIntegerField('Jumlah sampel')

    class Meta:
        ordering = ['product_id']
        constraints = [
            models.UniqueConstraint(fields=['request', 'product'], name='unique_sample_request_product'),
            models.CheckConstraint(condition=Q(quantity__gte=1), name='sample_quantity_positive'),
        ]


class SampleAllocation(models.Model):
    line = models.ForeignKey(SampleRequestLine, on_delete=models.PROTECT, related_name='allocations')
    batch = models.ForeignKey(StockBatch, on_delete=models.PROTECT, related_name='sample_allocations')
    quantity = models.PositiveBigIntegerField('Jumlah dialokasikan')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['line__product_id', 'batch__expiry_date', 'pk']
        constraints = [
            models.UniqueConstraint(fields=['line', 'batch'], name='unique_sample_line_batch'),
            models.CheckConstraint(condition=Q(quantity__gte=1), name='sample_allocation_positive'),
        ]


class SampleFollowUp(models.Model):
    request = models.ForeignKey(SampleRequest, on_delete=models.PROTECT, related_name='followups')
    followup_date = models.DateField('Tanggal tindak lanjut')
    response = models.TextField('Tanggapan pelanggan', blank=True)
    outcome = models.CharField(max_length=20, choices=SampleRequest.Outcome.choices)
    note = models.TextField('Catatan evaluasi', blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='sample_followups')
    activity = models.ForeignKey(Activity, on_delete=models.PROTECT, related_name='sample_followups', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-pk']


class BatchAllocation(models.Model):
    """Which batch units a confirmed order line is holding."""

    line = models.ForeignKey(OrderLine, on_delete=models.PROTECT, related_name='allocations')
    batch = models.ForeignKey(StockBatch, on_delete=models.PROTECT, related_name='allocations')
    quantity = models.PositiveBigIntegerField('Jumlah dialokasikan')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['line__product_id', 'batch__expiry_date', 'pk']
        constraints = [models.UniqueConstraint(fields=['line', 'batch'], name='unique_line_batch')]


class BatchSwap(models.Model):
    line = models.ForeignKey(OrderLine, on_delete=models.PROTECT, related_name='batch_swaps')
    from_batch = models.ForeignKey(StockBatch, on_delete=models.PROTECT, related_name='swaps_from')
    to_batch = models.ForeignKey(StockBatch, on_delete=models.PROTECT, related_name='swaps_to')
    quantity = models.PositiveBigIntegerField('Jumlah diganti')
    reason = models.TextField('Alasan penggantian')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='batch_swaps')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-pk']


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
