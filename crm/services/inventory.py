import sqlite3
from functools import wraps
from uuid import UUID

from django.db import OperationalError, transaction
from django.shortcuts import get_object_or_404

from crm.access import require_role
from crm.errors import BusinessError
from crm.models import InventoryBalance, Product, StockBatch, StockMovement
from crm.services.batches import resolve_receipt_batch, set_physical_stock, sync_balance

MAX_INTEGER = 2**63 - 1


def integer_input(value, minimum=0):
    if type(value) is not int or not minimum <= value <= MAX_INTEGER:
        raise BusinessError('INVALID_INPUT', f'Jumlah harus bilangan bulat antara {minimum} dan {MAX_INTEGER}.')
    return value


def atomic_write(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        try:
            # ponytail: SQLite IMMEDIATE serializes short writes globally; migrate
            # to PostgreSQL row locks if a pilot requires many concurrent writers.
            with transaction.atomic():
                return function(*args, **kwargs)
        except OperationalError as error:
            code = getattr(error.__cause__, 'sqlite_errorcode', None)
            if code is not None and code & 255 in {sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED}:
                raise BusinessError('BUSY', 'Data sedang diperbarui pengguna lain. Muat ulang lalu coba lagi.') from error
            raise
    return wrapped


def _record_stock(actor, product_id, quantity, reason, operation_id, kind, batch_code=None, received_date=None, expiry_date=None):
    require_role(actor, {'WAREHOUSE', 'MANAGER'})
    integer_input(quantity, 1 if kind == StockMovement.Kind.RECEIPT else 0)
    reason = reason.strip() if isinstance(reason, str) else ''
    if not reason:
        raise BusinessError('INVALID_INPUT', 'Alasan wajib diisi agar mutasi dapat ditelusuri.')
    try:
        source_ref = f'STOCK:{UUID(str(operation_id))}'
    except (ValueError, TypeError, AttributeError) as error:
        raise BusinessError('INVALID_INPUT', 'ID operasi tidak valid. Buka ulang form.') from error
    previous = StockMovement.objects.filter(source_ref=source_ref).first()
    if previous:
        if (previous.product_id, previous.kind, previous.input_quantity, previous.reason, previous.actor_id) != (product_id, kind, quantity, reason, actor.id):
            raise BusinessError('IDEMPOTENCY_CONFLICT', 'ID operasi sudah digunakan dengan isi berbeda.')
        return previous
    product = get_object_or_404(Product, pk=product_id)
    balance = get_object_or_404(InventoryBalance, product=product)
    actual = balance.on_hand + quantity if kind == StockMovement.Kind.RECEIPT else quantity
    integer_input(actual)
    delta = actual - balance.on_hand
    if kind == StockMovement.Kind.RECEIPT:
        batch = resolve_receipt_batch(product, batch_code, received_date, expiry_date)
        batch.on_hand += quantity
        batch.save(update_fields=['on_hand'])
        balance.on_hand = actual
        balance.save(update_fields=['on_hand', 'updated_at'])
    else:
        batch = None
        set_physical_stock(product, actual)
        balance = sync_balance(product)
    return StockMovement.objects.create(product=product, batch=batch, delta=delta, input_quantity=quantity, kind=kind, source_ref=source_ref, actor=actor, reason=reason)


def find_receipt(operation_id):
    """Movement recorded for this operation id, or None. Lets callers stay idempotent."""
    try:
        source_ref = f'STOCK:{UUID(str(operation_id))}'
    except (ValueError, TypeError, AttributeError):
        return None
    return StockMovement.objects.filter(source_ref=source_ref).first()


@atomic_write
def receive_stock(actor, product_id, quantity, reason, operation_id, batch_code=None, received_date=None, expiry_date=None):
    return _record_stock(actor, product_id, quantity, reason, operation_id, StockMovement.Kind.RECEIPT, batch_code=batch_code, received_date=received_date, expiry_date=expiry_date)


@atomic_write
def reconcile_stock(actor, product_id, counted_quantity, reason, operation_id):
    return _record_stock(actor, product_id, counted_quantity, reason, operation_id, StockMovement.Kind.ADJUSTMENT)


@atomic_write
def set_batch_status(actor, product_id, batch_id, status):
    """Hold or release a lot so FEFO only allocates stock that may be sold."""
    require_role(actor, {'WAREHOUSE', 'MANAGER'})
    if status not in StockBatch.Status.values:
        raise BusinessError('INVALID_INPUT', 'Status batch tidak dikenal.')
    batch = get_object_or_404(StockBatch.objects.filter(product_id=product_id), pk=batch_id)
    if batch.status != status:
        batch.status = status
        batch.save(update_fields=['status'])
    return batch
