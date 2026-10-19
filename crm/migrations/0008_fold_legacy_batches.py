"""Fold pre-batch stock into one legacy lot per product.

Before batch tracking, ``InventoryBalance`` alone held stock while confirmed
orders kept reservations only at the balance level. This migration makes the
batch ledger the source of truth by creating an undated ``BELUM-LENGKAP`` lot
per product and materialising confirmed-order allocations against it, so later
ship/cancel operations can read them.
"""

from django.db import migrations


def forward(apps, schema_editor):
    Product = apps.get_model('crm', 'Product')
    InventoryBalance = apps.get_model('crm', 'InventoryBalance')
    StockBatch = apps.get_model('crm', 'StockBatch')
    OrderLine = apps.get_model('crm', 'OrderLine')
    BatchAllocation = apps.get_model('crm', 'BatchAllocation')

    for product in Product.objects.filter(batches__isnull=True).distinct():
        balance = InventoryBalance.objects.filter(product=product).first()
        if balance is None:
            continue
        legacy = StockBatch.objects.create(product=product, code='BELUM-LENGKAP', on_hand=balance.on_hand, reserved=balance.reserved)
        confirmed_lines = OrderLine.objects.filter(product=product, order__status='CONFIRMED')
        for line in confirmed_lines:
            BatchAllocation.objects.create(line=line, batch=legacy, quantity=line.quantity)


def reverse(apps, schema_editor):
    StockBatch = apps.get_model('crm', 'StockBatch')
    StockBatch.objects.filter(code='BELUM-LENGKAP').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0007_order_expected_receipt_date_and_more'),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]