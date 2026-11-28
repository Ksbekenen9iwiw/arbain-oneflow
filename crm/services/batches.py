"""Lot ledger helpers.

Stock batch is the source of truth for physical quantities. The product-level
``InventoryBalance`` stays as a cache: ``on_hand`` is resynced from the batches
after every physical change, while ``reserved`` is still advanced in lockstep by
the order services so legacy reservations keep their exact behaviour.
"""
from datetime import date as date_type, date

from django.db.models import Sum
from django.utils import timezone

from crm.errors import BusinessError
from crm.models import InventoryBalance, StockBatch, StockPolicy


def fefo_key(batch):
    """Rank lots for FEFO: earliest expiry first; undated lots come last."""
    return (
        batch.expiry_date is None,
        batch.expiry_date or date.max,
        batch.received_date is None,
        batch.received_date or date.max,
        batch.pk,
    )


def ensure_legacy_batch(product):
    """Return the undated `BELUM-LENGKAP` lot, folding legacy on-hand into it.

    Products created before batch tracking only carry ``InventoryBalance``. The
    first batch-touching operation absorbs that stock so batch sums stay equal
    to the product balance.
    """
    legacy = product.batches.filter(code=StockBatch.LEGACY_CODE).first()
    if legacy is not None:
        return legacy
    starting = 0
    if not product.batches.exists():
        balance = InventoryBalance.objects.get_or_create(product=product)[0]
        starting = balance.on_hand
    return StockBatch.objects.create(product=product, code=StockBatch.LEGACY_CODE, on_hand=starting)


def sync_balance(product):
    """Recompute ``balance.on_hand`` from batch sums (reserved is untouched)."""
    balance = InventoryBalance.objects.get_or_create(product=product)[0]
    total = product.batches.aggregate(total=Sum('on_hand'))['total'] or 0
    balance.on_hand = total
    balance.save(update_fields=['on_hand', 'updated_at'])
    return balance


def set_physical_stock(product, counted):
    """Make batch sums equal ``counted``, then resync the balance.

    Increases land in the legacy lot; decreases take from earliest-expiry lots
    first, mirroring which stock physically leaves the shelf.
    """
    ensure_legacy_batch(product)
    batches = list(product.batches.all())
    current = sum(batch.on_hand for batch in batches)
    diff = counted - current
    if diff == 0:
        return sync_balance(product)
    if diff > 0:
        legacy = product.batches.get(code=StockBatch.LEGACY_CODE)
        legacy.on_hand += diff
        legacy.save(update_fields=['on_hand'])
    else:
        remove = -diff
        for batch in sorted(batches, key=fefo_key):
            if remove <= 0:
                break
            take = min(batch.on_hand, remove)
            if take:
                batch.on_hand -= take
                batch.save(update_fields=['on_hand'])
                remove -= take
    return sync_balance(product)


def resolve_receipt_batch(product, batch_code, received_date, expiry_date):
    """Find (or create) the lot a receipt should add units to."""
    batch_code = batch_code.strip() if isinstance(batch_code, str) else ''
    for value, label in ((received_date, 'Tanggal penerimaan'), (expiry_date, 'Tanggal kedaluwarsa')):
        if value is not None and not isinstance(value, date_type):
            raise BusinessError('INVALID_INPUT', f'{label} tidak valid. Buka ulang form.')
    if (received_date is not None or expiry_date is not None) and not batch_code:
        raise BusinessError('INVALID_INPUT', 'Kode batch wajib diisi bila mencantumkan tanggal terima atau kedaluwarsa.')
    if received_date is not None and expiry_date is not None and expiry_date < received_date:
        raise BusinessError('INVALID_INPUT', 'Tanggal kedaluwarsa tidak boleh sebelum tanggal penerimaan.')
    if not batch_code:
        return ensure_legacy_batch(product)
    if len(batch_code) > StockBatch._meta.get_field('code').max_length:
        raise BusinessError('INVALID_INPUT', 'Kode batch terlalu panjang.')
    batch, created = StockBatch.objects.get_or_create(
        product=product, code=batch_code,
        defaults={'received_date': received_date, 'expiry_date': expiry_date},
    )
    if created:
        return batch
    changed = {}
    if received_date is not None:
        if batch.received_date is None:
            changed['received_date'] = received_date
        elif batch.received_date != received_date:
            raise BusinessError('INVALID_INPUT', f'Batch {batch_code} sudah bertanggal terima {batch.received_date.isoformat()}, berbeda dengan input.')
    if expiry_date is not None:
        if batch.expiry_date is None:
            changed['expiry_date'] = expiry_date
        elif batch.expiry_date != expiry_date:
            raise BusinessError('INVALID_INPUT', f'Batch {batch_code} sudah bertanggal kedaluwarsa {batch.expiry_date.isoformat()}, berbeda dengan input.')
    if changed:
        for key, value in changed.items():
            setattr(batch, key, value)
        batch.save(update_fields=list(changed))
    return batch


def default_shelf_life_days():
    """Company-wide minimum remaining shelf life, in days."""
    policy = StockPolicy.objects.filter(pk=1).first()
    return policy.min_shelf_life_days if policy else StockPolicy.DEFAULT_MIN_SHELF_LIFE_DAYS


def shelf_life_days(product):
    """The rule a product follows: its own, else the company default."""
    if product.min_shelf_life_days is not None:
        return product.min_shelf_life_days
    return default_shelf_life_days()


def meets_shelf_life(product, batch, receipt_date, accept_near_expiry=False):
    """Whether ``batch`` may be handed over on ``receipt_date``.

    A product's own rule needs a dated lot. The company default only judges
    dated lots: stock recorded before lot dates existed stays usable.
    """
    baseline = receipt_date or timezone.localdate()
    if batch.expiry_date is not None and batch.expiry_date < baseline:
        return False
    if accept_near_expiry:
        return True
    if product.min_shelf_life_days is not None:
        return batch.expiry_date is not None and (batch.expiry_date - baseline).days >= product.min_shelf_life_days
    return batch.expiry_date is None or (batch.expiry_date - baseline).days >= default_shelf_life_days()


def eligible_batches(product, receipt_date, accept_near_expiry=False):
    """Active, unexpired lots with free units, FEFO-sorted, filtered by shelf-life policy.

    ``receipt_date`` is the day the goods are expected to reach the recipient: an
    order's promised date, or the day a sample is handed over. ``None`` means the
    day is unknown, and a product's own shelf-life rule refuses to guess.
    ``accept_near_expiry`` drops the minimum when the outlet agreed to it; lots
    past their expiry date are never picked.
    """
    ensure_legacy_batch(product)
    if product.min_shelf_life_days is not None and receipt_date is None and not accept_near_expiry:
        raise BusinessError(
            'INVALID_INPUT',
            f'{product.sku}: isi estimasi tanggal diterima sebelum konfirmasi karena masa simpan minimum sudah diatur.',
        )
    batches = [batch for batch in product.batches.all()
               if batch.status == StockBatch.Status.ACTIVE and batch.available > 0
               and meets_shelf_life(product, batch, receipt_date, accept_near_expiry)]
    batches.sort(key=fefo_key)
    return batches