import secrets
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from crm.models import ActionDecision, Activity, Customer, InventoryBalance, Order, Product, SalesTarget, StockMovement
from crm.services.inventory import receive_stock
from crm.services.orders import confirm_order, create_draft, ship_order


class Command(BaseCommand):
    help = 'Buat data simulasi pada database bisnis kosong; tidak menimpa data yang ada.'

    def add_arguments(self, parser):
        parser.add_argument('--as-of', default=timezone.localdate().isoformat())
        parser.add_argument('--show-demo-credentials', action='store_true')

    def handle(self, *args, **options):
        try:
            as_of = date.fromisoformat(options['as_of'])
            # History needs 96 days before the reference date.
            as_of - timedelta(days=96)
        except (ValueError, TypeError, OverflowError) as error:
            raise CommandError('Tanggal acuan harus YYYY-MM-DD dan memiliki cukup hari untuk riwayat simulasi.') from error
        accounts = [('nadia', 'Nadia Sales', 'SALES'), ('rafi', 'Rafi Sales', 'SALES'), ('gudang', 'Dewi Gudang', 'WAREHOUSE'), ('manajer', 'Arif Manajer', 'MANAGER')]
        credentials, users = {}, {}
        with transaction.atomic():
            business_models = [Customer, Product, Activity, Order, StockMovement, ActionDecision, SalesTarget]
            if any(model.objects.exists() for model in business_models) or User.objects.filter(username__in=[a[0] for a in accounts]).exists():
                raise CommandError('Seed ditolak: data bisnis atau akun demo sudah ada. Gunakan database baru untuk latihan; data lama tidak dihapus.')
            for username, full_name, role in accounts:
                password = secrets.token_urlsafe(18)
                user = User.objects.create_user(username, password=password, first_name=full_name)
                user.groups.add(Group.objects.get_or_create(name=role)[0])
                users[username], credentials[username] = user, password
            names = ['Apotek Sehat', 'Toko Alam Sentosa', 'Herbal Sari', 'Kios Cantik', 'Toko Madu Mekar', 'Apotek Harapan', 'Toko Herbal Lestari', 'Gerai Nusantara', 'Madu Bumi', 'Kios Amanah', 'Toko Rahayu', 'Gerai Pelangi']
            customers = {}
            for number, name in enumerate(names, 1):
                owner = users['nadia'] if number <= 6 else users['rafi']
                customers[number] = Customer.objects.create(code=f'CUS{number:03d}', name=name, phone=f'08120000{number:04d}', address=f'Alamat contoh {number}, Surakarta (simulasi)', owner=owner, is_active=number != 12)
            catalog = [
                ('MADU01', 'Madu Hutan 250 ml', 'botol', 50000, 10),
                ('MADU02', 'Madu Bunga 100 ml', 'botol', 30000, 24),
                ('HERBAL01', 'Minuman Herbal', 'botol', 45000, 4),
                ('HERBAL02', 'Serbuk Herbal', 'unit', 60000, 20),
                ('HERBAL03', 'Teh Herbal', 'unit', 35000, 0),
                ('COSM01', 'Sabun Herbal', 'unit', 25000, 16),
                ('COSM02', 'Balm Herbal', 'unit', 40000, 8),
                ('COSM03', 'Minyak Perawatan', 'botol', 55000, 20),
            ]
            history = [(1, 'MADU01', 8, [90, 60, 30]), (7, 'MADU01', 8, [90, 60, 30]), (3, 'HERBAL01', 6, [84, 56, 28]), (8, 'HERBAL03', 5, [90, 60, 30]), (4, 'COSM01', 4, [60, 40, 20]), (9, 'MADU02', 4, [96, 64, 32]), (6, 'COSM02', 2, [30, 15]), (2, 'HERBAL02', 4, [60, 40, 20])]
            outgoing = defaultdict(int)
            for _, sku, quantity, days in history:
                outgoing[sku] += quantity * len(days)
            products = {}
            for sku, name, unit, price, final_stock in catalog:
                product = Product.objects.create(sku=sku, name=name, unit=unit, price_rupiah=price, min_stock=5)
                InventoryBalance.objects.create(product=product)
                products[sku] = product
                initial = final_stock + outgoing[sku]
                if initial:
                    receive_stock(users['gudang'], product.id, initial, 'Saldo awal data simulasi', uuid4())
            for customer_number, sku, quantity, days_list in history:
                customer, product = customers[customer_number], products[sku]
                for days in days_list:
                    order = create_draft(customer.owner, customer.id, [{'product_id': product.id, 'quantity': quantity}])
                    confirm_order(customer.owner, order.id)
                    ship_order(users['gudang'], order.id)
                    at = timezone.make_aware(datetime.combine(as_of - timedelta(days=days), time(12)))
                    Order.objects.filter(pk=order.id).update(created_at=at, confirmed_at=at, shipped_at=at)
                    StockMovement.objects.filter(order=order).update(created_at=at)
            pending = create_draft(users['nadia'], customers[2].id, [{'product_id': products['HERBAL02'].id, 'quantity': 4}])
            confirm_order(users['nadia'], pending.id)
            for number, customer in customers.items():
                Activity.objects.create(customer=customer, sales=customer.owner, kind='VISIT', stage='INTERESTED' if number <= 8 else 'NEW', scheduled_date=as_of + timedelta(days=number % 3 - 1), note='Jadwal kunjungan pada data simulasi.')
            for number, delay in [(5, -3), (6, -1), (10, 7)]:
                customer = customers[number]
                Activity.objects.create(customer=customer, sales=customer.owner, kind='FOLLOWUP', stage='CONTACTED', followup_date=as_of + timedelta(days=delay), note='Hubungi kembali sesuai catatan interaksi simulasi.')
            Activity.objects.create(customer=customers[1], sales=users['nadia'], kind='INTERACTION', stage='INTERESTED', status='DONE', note='Pelanggan meminta informasi ketersediaan.', result='Kebutuhan dicatat untuk tindak lanjut.')
            for username, target in [('nadia', 2000000), ('rafi', 1500000)]:
                SalesTarget.objects.create(sales=users[username], month=as_of.replace(day=1), target_rupiah=target)
        self.stdout.write(self.style.SUCCESS(f'Data simulasi siap: 12 pelanggan, 8 SKU, 4 akun. Tanggal acuan {as_of}.'))
        if options['show_demo_credentials']:
            for username, _, role in accounts:
                self.stdout.write(f'{role}: username={username} password={credentials[username]}')
        else:
            self.stdout.write('Password tidak ditampilkan. Untuk demo baru, gunakan --show-demo-credentials saat menjalankan seed.')
