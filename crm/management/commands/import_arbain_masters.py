"""Populate operational master lists from a previously imported Arbain archive."""
import re
from datetime import date
from hashlib import sha256

from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from crm.models import CompanyReportRow, Customer, InventoryBalance, Product


def identity(*names):
    return '\x1f'.join(' '.join(value.split()).casefold() for value in names)


def import_code(prefix, key):
    return f'ARB-{prefix}-{sha256(key.encode()).hexdigest()[:16].upper()}'


class Command(BaseCommand):
    help = 'Isi daftar master dari arsip Arba’in tanpa membuat transaksi atau saldo pembuka.'

    def add_arguments(self, parser):
        parser.add_argument('--period', required=True, help='Bulan laporan, YYYY-MM.')
        parser.add_argument('--apply', action='store_true', help='Tanpa ini, perubahan dibatalkan setelah validasi.')

    @transaction.atomic
    def handle(self, *args, period, apply, **options):
        if settings.ONEFLOW_DEMO:
            raise CommandError('Gunakan ONEFLOW_DEMO=0 dan database operasional terpisah.')
        try:
            month = date.fromisoformat(period + '-01')
        except ValueError as error:
            raise CommandError('Bulan tidak valid. Gunakan YYYY-MM.') from error

        rows = CompanyReportRow.objects.filter(report__period=month)
        sales_rows = list(rows.filter(kind=CompanyReportRow.Kind.SALES).order_by('pk'))
        visits = list(rows.filter(kind=CompanyReportRow.Kind.VISITS).exclude(outlet='').order_by('pk'))
        if not sales_rows or not visits:
            raise CommandError('Arsip periode ini harus berisi rekap produk dan kunjungan.')
        has_linked_masters = CompanyReportRow.objects.filter(catalog_product__isnull=False).exists()
        if not has_linked_masters and (Product.objects.exists() or Customer.objects.exists()):
            raise CommandError('Impor pertama memerlukan master kosong. Siapkan database operasional baru.')
        sales_group, _ = Group.objects.get_or_create(name='SALES')
        staff = {}
        for name in sorted({row.sales.strip() for row in visits}):
            username = re.sub('[^a-z0-9]+', '.', name.lower()).strip('.')
            if not username:
                raise CommandError('Ada nama sales kosong atau tidak valid pada laporan kunjungan.')
            user = User.objects.filter(username=username).first()
            if user is None:
                user = User(username=username, first_name=name)
                user.set_unusable_password()
                user.save()
                user.groups.add(sales_group)
            elif user.first_name != name or user.last_name or set(user.groups.values_list('name', flat=True)) != {'SALES'}:
                raise CommandError(f'Akun {username} bertentangan dengan identitas pada arsip.')
            staff[name] = user

        products = {}
        for row in sales_rows:
            label = ' '.join(row.product.split())
            if not label or len(label) > 160:
                raise CommandError('Ada nama produk yang perlu diperbaiki sebelum diimpor.')
            key = identity(label)
            if key not in products:
                products[key] = row.catalog_product
                if products[key] is None:
                    products[key], created = Product.objects.get_or_create(
                        sku=import_code('P', key),
                        defaults=dict(name=label, unit='', price_rupiah=None, min_stock=0,
                                      is_active=False, opening_stock_pending=True),
                    )
                    if created:
                        InventoryBalance.objects.create(product=products[key])
            row.catalog_product = products[key]

        outlets = {}
        for row in visits:
            owner = staff[row.sales.strip()]
            label = ' '.join(row.outlet.split())
            location = ' '.join(row.details.get('Alamat', '').split())
            key = identity(owner.username, label, location)
            if len(label) > 160:
                raise CommandError('Ada nama outlet terlalu panjang. Tinjau nama di arsip.')
            if key not in outlets:
                outlets[key] = row.visited_customer
                if outlets[key] is None:
                    outlets[key], _ = Customer.objects.get_or_create(
                        code=import_code('O', key),
                        defaults=dict(name=label, address=location, owner=owner, outlet_type='',
                                      discount_percent=None, is_active=False, source_pending=True),
                    )
            row.visited_customer = outlets[key]

        CompanyReportRow.objects.bulk_update(sales_rows, ['catalog_product'], batch_size=250)
        CompanyReportRow.objects.bulk_update(visits, ['visited_customer'], batch_size=250)
        if not apply:
            transaction.set_rollback(True)
        self.stdout.write(
            f'{len(products)} nama produk, {len(outlets)} profil outlet dari {len(visits)} catatan kunjungan, '
            f'{len(staff)} identitas sales. ' + ('Tersimpan.' if apply else 'Simulasi, belum disimpan.')
        )
