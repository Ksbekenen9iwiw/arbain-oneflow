import secrets
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from crm.models import ActionDecision, Activity, Customer, InventoryBalance, Order, Product, ProductSupplySetting, PurchaseOrder, SalesTarget, SamplePolicy, SampleRequest, StockMovement
from crm.services.inventory import receive_stock
from crm.services.orders import confirm_order, create_draft, ship_order
from crm.services.samples import create_draft as create_sample, decide as decide_sample, mark_received, record_followup, save_policy, ship_request as ship_sample, submit_request
from crm.services.supply import create_purchase_order, save_settings


class Command(BaseCommand):
    help = 'Buat data simulasi pada database bisnis kosong; tidak menimpa data yang ada.'

    def add_arguments(self, parser):
        parser.add_argument('--as-of', default=timezone.localdate().isoformat())
        parser.add_argument('--show-demo-credentials', action='store_true')
        parser.add_argument('--fefo-demo', action='store_true', help='Tambahkan skenario batch FEFO berlabel simulasi pada HERBAL03.')
        parser.add_argument('--samples-demo', action='store_true', help='Tambahkan tiga skenario pengajuan sampel berlabel simulasi.')
        parser.add_argument('--supply-demo', action='store_true', help='Tambahkan skenario peringatan pasokan berlabel simulasi (perlu pengadaan, terlambat, riwayat tipis).')
        parser.add_argument('--reorder-demo', action='store_true', help='Tambahkan skenario pengingat pembelian ulang berlabel simulasi (pola 42/28/14 hari + pengadaan berjalan).')

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
            business_models = [Customer, Product, Activity, Order, StockMovement, ActionDecision, SalesTarget, SamplePolicy, SampleRequest, ProductSupplySetting, PurchaseOrder]
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
            if options['fefo_demo']:
                self._seed_fefo_demo(as_of, users, customers, products)
            if options['samples_demo']:
                self._seed_samples_demo(as_of, users, customers, products)
            if options['supply_demo']:
                self._seed_supply_demo(as_of, users, customers, products)
            if options['reorder_demo']:
                self._seed_reorder_demo(as_of, users, customers, products)
            for number, customer in customers.items():
                Activity.objects.create(customer=customer, sales=customer.owner, kind='VISIT', stage='INTERESTED' if number <= 8 else 'NEW', scheduled_date=as_of + timedelta(days=number % 3 - 1), note='Jadwal kunjungan pada data simulasi.')
            for number, delay in [(5, -3), (6, -1), (10, 7)]:
                customer = customers[number]
                Activity.objects.create(customer=customer, sales=customer.owner, kind='FOLLOWUP', stage='CONTACTED', followup_date=as_of + timedelta(days=delay), note='Hubungi kembali sesuai catatan interaksi simulasi.')
            Activity.objects.create(customer=customers[1], sales=users['nadia'], kind='INTERACTION', stage='INTERESTED', status='DONE', note='Pelanggan meminta informasi ketersediaan.', result='Kebutuhan dicatat untuk tindak lanjut.')
            for username, target in [('nadia', 2000000), ('rafi', 1500000)]:
                SalesTarget.objects.create(sales=users[username], month=as_of.replace(day=1), target_rupiah=target)
        self.stdout.write(self.style.SUCCESS(f'Data simulasi siap: 12 pelanggan, 8 SKU, 4 akun. Tanggal acuan {as_of}.'))
        if options['fefo_demo']:
            self.stdout.write('Skenario FEFO simulasi: HERBAL03 memiliki DEMO-A 20 unit (kedaluwarsa lebih dekat) dan DEMO-B 50 unit; pesanan 25 unit dialokasikan 20 + 5. Seluruh angka berlabel simulasi.')
        if options['samples_demo']:
            self.stdout.write('Skenario sampel simulasi: pelanggan baru, hasil baik dengan pembelian tertaut, dan pemberian berulang tanpa hasil jelas. Semua keputusan tetap melalui peninjau.')
        if options['supply_demo']:
            self.stdout.write('Skenario pasokan simulasi: MADU01 perlu pengadaan, HERBAL01 pengadaan berjalan terlambat, COSM03 riwayat belum lengkap. Angka bukan kebijakan resmi mitra.')
        if options['reorder_demo']:
            self.stdout.write('Skenario pembelian ulang simulasi: CUS010 membeli COSM02 24 botol pada 42/28/14 hari lalu (interval 14, 14) sehingga perkiraan jatuh pada tanggal acuan; satu PO CONFIRMED COSM02 sebagai info pengadaan.')
        if options['show_demo_credentials']:
            for username, _, role in accounts:
                self.stdout.write(f'{role}: username={username} password={credentials[username]}')
        else:
            self.stdout.write('Password tidak ditampilkan. Untuk demo baru, gunakan --show-demo-credentials saat menjalankan seed.')

    def _seed_fefo_demo(self, as_of, users, customers, products):
        """Labeled batch scenario: 25 units split across two lots by nearest expiry."""
        product = products['HERBAL03']
        product.min_shelf_life_days = 14
        product.save(update_fields=['min_shelf_life_days'])
        receive_stock(users['gudang'], product.id, 20, 'Simulasi FEFO batch A (kedaluwarsa lebih dekat)', uuid4(),
                      batch_code='DEMO-A', received_date=as_of, expiry_date=as_of + timedelta(days=30))
        receive_stock(users['gudang'], product.id, 50, 'Simulasi FEFO batch B (kedaluwarsa lebih jauh)', uuid4(),
                      batch_code='DEMO-B', received_date=as_of, expiry_date=as_of + timedelta(days=90))
        order = create_draft(users['nadia'], customers[2].id, [{'product_id': product.id, 'quantity': 25}])
        confirm_order(users['nadia'], order.id, as_of)
        return order

    def _backdate_shipment(self, order, at):
        Order.objects.filter(pk=order.id).update(created_at=at, confirmed_at=at, shipped_at=at)
        StockMovement.objects.filter(order=order).update(created_at=at)

    def _seed_supply_demo(self, as_of, users, customers, products):
        """Three labeled risk states; every number here is simulation, not partner policy."""
        madu = products['MADU01']
        receive_stock(users['gudang'], madu.id, 200, 'Saldo awal skenario pasokan (simulasi)', uuid4())
        order = create_draft(customers[1].owner, customers[1].id, [{'product_id': madu.id, 'quantity': 134}])
        confirm_order(customers[1].owner, order.id)
        ship_order(users['gudang'], order.id)
        self._backdate_shipment(order, timezone.make_aware(datetime.combine(as_of - timedelta(days=10), time(12))))
        save_settings(users['manajer'], madu.id, 30, 3, 14, 2)

        herbal = products['HERBAL01']
        receive_stock(users['gudang'], herbal.id, 40, 'Saldo awal skenario pasokan (simulasi)', uuid4())
        order = create_draft(customers[3].owner, customers[3].id, [{'product_id': herbal.id, 'quantity': 28}])
        confirm_order(customers[3].owner, order.id)
        ship_order(users['gudang'], order.id)
        self._backdate_shipment(order, timezone.make_aware(datetime.combine(as_of - timedelta(days=5), time(12))))
        save_settings(users['manajer'], herbal.id, 30, 5, 10, 3)
        create_purchase_order(users['manajer'], herbal.id, 10, as_of + timedelta(days=40), 'Simulasi pemasok lambat')

        cosm = products['COSM03']
        order = create_draft(customers[6].owner, customers[6].id, [{'product_id': cosm.id, 'quantity': 12}])
        confirm_order(customers[6].owner, order.id)
        ship_order(users['gudang'], order.id)
        self._backdate_shipment(order, timezone.make_aware(datetime.combine(as_of - timedelta(days=3), time(12))))
        save_settings(users['manajer'], cosm.id, 30, 2, 10, 2)

    def _seed_reorder_demo(self, as_of, users, customers, products):
        """Reorder reminder scenario: CUS010 buys COSM02 24 units at 42/28/14 days
        before as_of, so the median-14 estimate lands exactly on as_of."""
        from crm.services.supply import create_purchase_order
        from uuid import uuid4
        from crm.services.inventory import receive_stock
        customer, product = customers[10], products['COSM02']
        receive_stock(users['gudang'], product.id, 72, 'Saldo awal skenario pembelian ulang (simulasi)', uuid4())
        for days in (42, 28, 14):
            order = create_draft(customer.owner, customer.id, [{'product_id': product.id, 'quantity': 24}])
            confirm_order(customer.owner, order.id)
            ship_order(users['gudang'], order.id)
            self._backdate_shipment(order, timezone.make_aware(datetime.combine(as_of - timedelta(days=days), time(12))))
        create_purchase_order(users['manajer'], product.id, 50, as_of + timedelta(days=10), 'Simulasi pengadaan berjalan untuk pengingat pembelian ulang')

    def _seed_samples_demo(self, as_of, users, customers, products):
        """Three labeled scenarios; policy values are simulation only."""
        save_policy(users['manajer'], 2, 180, 14)
        product = products['COSM03']
        base = {
            'purpose': 'Simulasi evaluasi kesesuaian produk',
            'customer_need': 'Simulasi kebutuhan produk perawatan',
            'potential_orders': 'Simulasi potensi 20 unit per bulan',
            'business_profile': 'Simulasi profil usaha retail aktif',
            'notes': 'DATA SIMULASI PENGAJUAN SAMPEL',
        }

        prospect = create_sample(users['nadia'], customers[5].id, [{'product_id': product.id, 'quantity': 1}], **base)
        submit_request(users['nadia'], prospect.id)

        successful = create_sample(users['nadia'], customers[1].id, [{'product_id': product.id, 'quantity': 1}], **base)
        submit_request(users['nadia'], successful.id)
        decide_sample(users['manajer'], successful.id, SampleRequest.Status.APPROVED)
        ship_sample(users['gudang'], successful.id)
        mark_received(users['nadia'], successful.id)
        linked_order = customers[1].orders.filter(status='SHIPPED').first()
        record_followup(users['nadia'], successful.id, 'Pelanggan membeli setelah mencoba sampel.',
                        SampleRequest.Outcome.PURCHASED, 'Hasil baik pada data simulasi.', linked_order.id)
        at = timezone.make_aware(datetime.combine(as_of - timedelta(days=60), time(12)))
        SampleRequest.objects.filter(pk=successful.id).update(created_at=at, shipped_at=at, received_at=at)

        for days in (70, 40):
            repeated = create_sample(users['nadia'], customers[3].id, [{'product_id': product.id, 'quantity': 1}], **base)
            submit_request(users['nadia'], repeated.id)
            decide_sample(users['manajer'], repeated.id, SampleRequest.Status.APPROVED)
            ship_sample(users['gudang'], repeated.id)
            mark_received(users['nadia'], repeated.id)
            at = timezone.make_aware(datetime.combine(as_of - timedelta(days=days), time(12)))
            SampleRequest.objects.filter(pk=repeated.id).update(created_at=at, shipped_at=at, received_at=at)

        pending_review = create_sample(users['nadia'], customers[3].id, [{'product_id': product.id, 'quantity': 1}], **base)
        submit_request(users['nadia'], pending_review.id)
