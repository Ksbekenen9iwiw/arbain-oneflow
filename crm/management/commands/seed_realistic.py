"""Repeatable, chronological simulation using the application's write services.

The clock is scoped to this offline management process. Nothing changes in the
web process, and no timestamps or balances are repaired after creating events.
"""
import heapq
import random
import secrets
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from uuid import NAMESPACE_URL, uuid5

from django.apps import apps
from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from crm.access import role_of
from crm.models import Activity, Customer, InventoryBalance, Product, SalesTarget, StockBatch
from crm.services import orders, samples, supply
from crm.services.inventory import receive_stock, set_batch_status


ACCOUNTS = [('nadia', 'Nadia Prameswari', 'SALES'), ('rafi', 'Rafi Mahendra', 'SALES'),
            ('gudang', 'Dewi Lestari', 'WAREHOUSE'), ('manajer', 'Arif Wicaksana', 'MANAGER')]
# Same SKUs as the app's product photographs. Prices are simulation assumptions.
CATALOG = [
    ('MADU01', 'Madu Hutan 250 ml', 'botol', 52000, 36, 24, 540),
    ('MADU02', 'Madu Bunga 100 ml', 'botol', 32000, 48, 96, 540),
    ('HERBAL01', 'Minuman Herbal 250 ml', 'botol', 45000, 36, 18, 270),
    ('HERBAL02', 'Serbuk Herbal 10 sachet', 'unit', 58000, 24, 72, 365),
    ('HERBAL03', 'Teh Herbal 20 kantong', 'unit', 35000, 24, 48, 365),
    ('COSM01', 'Sabun Herbal 80 g', 'unit', 26000, 48, 120, 540),
    ('COSM02', 'Balm Herbal 20 g', 'unit', 42000, 24, 60, 540),
    ('COSM03', 'Minyak Perawatan 60 ml', 'botol', 56000, 24, 48, 540),
]
REGIONS = [('Surakarta', 'Banjarsari'), ('Sukoharjo', 'Grogol'), ('Karanganyar', 'Colomadu'),
           ('Boyolali', 'Mojosongo'), ('Klaten', 'Klaten Tengah'), ('Sragen', 'Sragen')]
NAMES = ['Sekar Wangi', 'Bumi Laras', 'Tunas Arum', 'Sari Kencana', 'Nusa Rahayu', 'Cahaya Pertiwi', 'Laras Asri', 'Mekar Madani']
SEGMENTS = [
    ('Toko Herbal', ['MADU01', 'HERBAL02', 'HERBAL03'], 21, 12),
    ('Apotek', ['MADU02', 'HERBAL01', 'COSM02'], 28, 6),
    ('Grosir', ['MADU01', 'MADU02', 'COSM01'], 14, 36),
    ('Gerai Perawatan', ['COSM01', 'COSM02', 'COSM03'], 28, 12),
    ('Toko Oleh-oleh', ['MADU01', 'HERBAL03', 'HERBAL02'], 35, 12),
    ('Reseller', ['MADU02', 'COSM01', 'COSM03'], 21, 6),
]


def validate_accounts():
    for username, _, role in ACCOUNTS:
        user = User.objects.filter(username=username).first()
        if user and (not user.is_active or user.is_staff or user.is_superuser or role_of(user) != role):
            raise CommandError(f'Akun {username} sudah ada dengan akses berbeda; tidak diubah.')


class Simulation:
    def __init__(self, as_of, seed):
        self.as_of, self.rng, self.seed = as_of, random.Random(seed), seed
        self.start = as_of - timedelta(days=180)
        self.events, self.serial, self.demands = [], 0, []
        self.users, self.customers, self.products, self.credentials = {}, {}, {}, {}

    def at(self, day, hour=9):
        return timezone.make_aware(datetime.combine(day, time(hour)))

    def add(self, day, hour, function):
        self.serial += 1
        heapq.heappush(self.events, (self.at(day, hour), self.serial, function))

    def demand(self, day, lines):
        for sku, qty in lines:
            self.demands.append((day, sku, qty))

    def lines(self, lines):
        return [{'product_id': self.products[sku].pk, 'quantity': qty} for sku, qty in lines]

    def setup(self):
        for username, name, role in ACCOUNTS:
            user = User.objects.filter(username=username).first()
            if user is None:
                password = secrets.token_urlsafe(18)
                user = User.objects.create_user(username, password=password, first_name=name)
                user.groups.add(Group.objects.get_or_create(name=role)[0])
                self.credentials[username] = password
            self.users[username] = user
        for sku, name, unit, price, minimum, _, _ in CATALOG:
            product = Product.objects.create(sku=sku, name=name, unit=unit, price_rupiah=price,
                                             min_stock=minimum, min_shelf_life_days=45)
            InventoryBalance.objects.create(product=product)
            self.products[sku] = product
            supply.save_settings(self.users['manajer'], product.pk, 30, 7, 21, 5)
        samples.save_policy(self.users['manajer'], 2, 180, 14)
        for index in range(48):
            region, district = REGIONS[index // 8]
            segment = SEGMENTS[index % len(SEGMENTS)]
            self.customers[index] = Customer.objects.create(
                code=f'CUS{index + 1:03d}', name=f'{segment[0]} {NAMES[index % 8]} {region}',
                # Deliberately non-dialable; Indonesian-looking random phone numbers
                # can belong to a real person, even in an otherwise fake dataset.
                phone=f'DEMO-0821-XXXX-{index + 1:04d}',
                address=f'Jl. Kebun Rempah No. {11 + index * 3}, {district}, {region}, Jawa Tengah (alamat fiktif)',
                owner=self.users['nadia' if index // 8 < 3 else 'rafi'])
        month = self.start.replace(day=1)
        while month <= self.as_of:
            for username, target in [('nadia', 32000000), ('rafi', 26000000)]:
                SalesTarget.objects.create(sales=self.users[username], month=month, target_rupiah=target)
            month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)

    def plan_order(self, index, day, lines, status='SHIPPED', on_ship=None):
        customer, state = self.customers[index], {}
        if status in ('SHIPPED', 'CONFIRMED'):
            self.demand(day, lines)

        def draft():
            state['order'] = orders.create_draft(customer.owner, customer.pk, self.lines(lines))
            Activity.objects.create(customer=customer, sales=customer.owner, kind='INTERACTION', stage='WON',
                                    status='DONE', completed_at=timezone.now(),
                                    note=f'Konfirmasi kebutuhan {len(lines)} jenis produk untuk pengisian rak.',
                                    result=f'Draft OF-{state["order"].pk:04d} dicatat; jumlah dan harga sudah disepakati.')

        def confirm():
            orders.confirm_order(customer.owner, state['order'].pk, day + timedelta(days=3))

        def ship():
            order = orders.ship_order(self.users['gudang'], state['order'].pk)
            if on_ship:
                on_ship(order)

        self.add(day, 9, draft)
        if status != 'DRAFT':
            self.add(day, 11, confirm)
        if status == 'SHIPPED':
            self.add(day + timedelta(days=1), 14, ship)
        elif status == 'CANCELLED':
            self.add(day, 15, lambda: orders.cancel_order(customer.owner, state['order'].pk,
                     'Pelanggan menunda pengisian rak karena stok gerai masih cukup.'))

    def plan_history(self):
        for index in range(44):
            _, skus, interval, base = SEGMENTS[index % len(SEGMENTS)]
            day = self.start + timedelta(days=self.rng.randint(4, 25))
            end = self.as_of - timedelta(days=65 if index >= 40 else 4)
            while day <= end:
                # Saturday trading is common; avoid placing simulated orders Sunday.
                if day.weekday() == 6:
                    day += timedelta(days=1)
                if day > end:
                    break
                quantity = max(3, base + self.rng.choice([-3, 0, 0, 3, 6]))
                lines = [(skus[0], quantity)]
                if self.rng.random() < .72:
                    lines.append((self.rng.choice(skus[1:]), max(3, quantity // 2)))
                self.plan_order(index, day, lines)
                day += timedelta(days=interval + self.rng.randint(-3, 4))
        for index, sku in [(2, 'MADU01'), (9, 'HERBAL02'), (25, 'MADU02'), (31, 'COSM01')]:
            self.plan_order(index, self.as_of - timedelta(days=1), [(sku, 6)], 'CONFIRMED')
        for index in (6, 18, 30, 45):
            self.plan_order(index, self.as_of - timedelta(days=2), [(SEGMENTS[index % 6][1][0], 12)], 'DRAFT')
        for index in (3, 15, 27, 39):
            self.plan_order(index, self.as_of - timedelta(days=10 + index), [('COSM01', 6)], 'CANCELLED')

    def plan_sample(self, index, sku, days_ago, outcome=None, stage='RECEIVED'):
        customer, state = self.customers[index], {}
        day = self.as_of - timedelta(days=days_ago)
        if stage in ('APPROVED', 'SHIPPED', 'RECEIVED'):
            self.demand(day, [(sku, 1)])

        def create():
            state['request'] = samples.create_draft(customer.owner, customer.pk, self.lines([(sku, 1)]),
                purpose='Uji kemasan dan penerimaan produk sebelum menambah pilihan di rak.',
                customer_need=f'Gerai ingin mengevaluasi {self.products[sku].name} untuk pelanggan rutinnya.',
                potential_orders='Pesanan awal 12 unit; evaluasi penjualan dua minggu sebelum pembelian ulang.',
                business_profile=f'{customer.name}; penjualan langsung di gerai dan pesanan pelanggan sekitar.',
                notes='Data sintetis. Sampel untuk evaluasi komersial, bukan bukti khasiat produk.')
            if stage != 'DRAFT':
                samples.submit_request(customer.owner, state['request'].pk)

        def decision():
            samples.decide(self.users['manajer'], state['request'].pk,
                'REJECTED' if stage == 'REJECTED' else 'APPROVED',
                'Evaluasi sebelumnya belum menghasilkan kebutuhan yang jelas.' if stage == 'REJECTED'
                else 'Satu unit untuk uji rak; sales wajib mencatat tanggapan dalam 14 hari.')

        self.add(day, 9, create)
        if stage in ('DRAFT', 'SUBMITTED'):
            return
        self.add(day + timedelta(days=1), 10, decision)
        if stage in ('REJECTED', 'APPROVED'):
            return
        self.add(day + timedelta(days=2), 13,
                 lambda: samples.ship_request(self.users['gudang'], state['request'].pk))
        if stage == 'SHIPPED':
            return

        def received():
            samples.mark_received(customer.owner, state['request'].pk)
            samples.schedule_followup(customer.owner, state['request'].pk, day + timedelta(days=14),
                                      'Tanyakan penerimaan kemasan, harga, dan kebutuhan pengisian rak.')
        self.add(day + timedelta(days=3), 10, received)
        if outcome == 'PURCHASED':
            def linked(order):
                samples.record_followup(customer.owner, state['request'].pk,
                    'Kemasan cocok untuk rak gerai; pesanan awal 12 unit telah dikirim.', 'PURCHASED',
                    'Pesanan berisi SKU yang sama dan terjadi setelah sampel diterima.', order.pk)
            self.plan_order(index, day + timedelta(days=15), [(sku, 12)], on_ship=linked)
        elif outcome:
            responses = {'EVALUATING': 'Produk masih diuji di rak; minta waktu satu minggu lagi.',
                         'NO_RESPONSE': 'Dua kali dihubungi pada jam operasional, belum ada tanggapan.',
                         'NOT_INTERESTED': 'Harga belum sesuai dengan segmen pelanggan gerai saat ini.'}
            self.add(day + timedelta(days=14), 15, lambda: samples.record_followup(
                customer.owner, state['request'].pk, responses[outcome], outcome, 'Hasil kunjungan evaluasi sales.'))

    def plan_samples(self):
        for args in [(4, 'HERBAL03', 65, 'PURCHASED'), (28, 'HERBAL03', 46, 'PURCHASED'),
                     (10, 'COSM03', 28, 'NOT_INTERESTED'), (34, 'COSM02', 20, 'EVALUATING'),
                     (16, 'MADU02', 80, 'NO_RESPONSE'), (16, 'MADU02', 45, 'NO_RESPONSE'),
                     (40, 'COSM01', 22, 'NO_RESPONSE'), (46, 'MADU02', 6, None)]:
            self.plan_sample(*args)
        self.plan_sample(16, 'MADU02', 3, stage='REJECTED')
        self.plan_sample(44, 'HERBAL03', 2, stage='SUBMITTED')
        self.plan_sample(45, 'COSM03', 2, stage='DRAFT')
        self.plan_sample(47, 'COSM01', 2, stage='APPROVED')
        self.plan_sample(38, 'COSM02', 3, stage='SHIPPED')

    def plan_receipts(self):
        buckets = defaultdict(Counter)
        for day, sku, quantity in self.demands:
            buckets[(day - self.start).days // 21][sku] += quantity
        for period in range(9):
            day = self.start + timedelta(days=period * 21)
            for sku, _, _, _, _, buffer, life in CATALOG:
                quantity = buckets[period][sku] + (buffer if period == 0 else 0)
                if not quantity:
                    continue
                state = {}
                def create(sku=sku, qty=quantity, day=day, state=state, period=period):
                    state['po'] = supply.create_purchase_order(self.users['manajer'], self.products[sku].pk,
                        qty, day, f'Pemasok simulasi — pengisian reguler {sku}, siklus {period + 1}.')
                def receive(sku=sku, qty=quantity, day=day, life=life, state=state):
                    supply.receive_purchase_order(self.users['gudang'], state['po'].pk, qty,
                        uuid5(NAMESPACE_URL, f'oneflow:{self.seed}:{day}:{sku}'),
                        batch_code=f'SYN-{sku}-{day:%y%m%d}', received_date=day,
                        expiry_date=day + timedelta(days=life))
                self.add(day - timedelta(days=7), 9, create)
                self.add(day, 8, receive)

        # A delayed inbound commitment and a partially received purchase order.
        for sku, qty, expected_offset, partial in [('HERBAL01', 180, -2, 0), ('MADU01', 240, 5, 0), ('COSM03', 120, 4, 24)]:
            state = {}
            def create(sku=sku, qty=qty, offset=expected_offset, state=state, partial=partial):
                state['po'] = supply.create_purchase_order(self.users['manajer'], self.products[sku].pk,
                    qty, self.as_of + timedelta(days=offset),
                    'Pemasok simulasi: menunggu sisa pengiriman.' if partial else 'Pemasok simulasi: pengadaan berikutnya.')
            self.add(self.as_of - timedelta(days=9), 10, create)
            if partial:
                def receive(sku=sku, qty=partial, state=state):
                    day = self.as_of - timedelta(days=2)
                    supply.receive_purchase_order(self.users['gudang'], state['po'].pk, qty,
                        uuid5(NAMESPACE_URL, f'oneflow:{self.seed}:partial:{sku}'),
                        batch_code=f'SYN-PART-{sku}', received_date=day, expiry_date=day + timedelta(days=540))
                self.add(self.as_of - timedelta(days=2), 8, receive)

        # Small inspection lots: physically present, but unavailable for FEFO.
        for sku, code, expiry, status in [('HERBAL03', 'QC-HELD', -2, 'HELD'),
                                          ('HERBAL01', 'SHORT-DATED', 20, 'ACTIVE')]:
            day = self.as_of - timedelta(days=100 if status == 'HELD' else 10)
            def inspect(sku=sku, code=code, expiry=expiry, status=status, day=day):
                movement = receive_stock(self.users['gudang'], self.products[sku].pk, 6,
                    'Lot simulasi untuk pemeriksaan mutu; masa simpan di bawah kebijakan kirim.',
                    uuid5(NAMESPACE_URL, f'oneflow:{self.seed}:{code}'), batch_code=f'SYN-{code}',
                    received_date=day, expiry_date=self.as_of + timedelta(days=expiry))
                if status == 'HELD':
                    set_batch_status(self.users['gudang'], self.products[sku].pk, movement.batch_id, status)
            self.add(day, 8, inspect)

    def finish(self):
        for index, customer in self.customers.items():
            if index >= 40 and index < 44:
                customer.is_active = False
                customer.save(update_fields=['is_active'])
                Activity.objects.create(customer=customer, sales=customer.owner, kind='INTERACTION',
                    stage='LOST', status='DONE', completed_at=timezone.now(),
                    note='Peninjauan pelanggan tidak aktif.', result='Gerai menghentikan kategori ini; hentikan kunjungan rutin.')
                continue
            if index % 3 == 0 or index >= 44:
                due = self.as_of + timedelta(days=(-4, -1, 0, 2, 5, 8)[index % 6])
                with patch('django.utils.timezone.now', return_value=self.at(self.as_of - timedelta(days=12))):
                    Activity.objects.create(customer=customer, sales=customer.owner, kind='FOLLOWUP',
                        stage='CONTACTED' if index >= 44 else 'INTERESTED', followup_date=due,
                        note='Tinjau daftar harga dan kebutuhan pesanan pertama.' if index >= 44
                             else 'Cek sisa stok rak dan rencana pesanan menjelang kunjungan rute berikutnya.')

    def run(self):
        with patch('django.utils.timezone.now', return_value=self.at(self.start - timedelta(days=8))):
            self.setup()
        self.plan_history()
        self.plan_samples()
        self.plan_receipts()
        # Historical timestamps, audit evidence, expiry checks and actions all
        # see the same event clock, including auto_now/auto_now_add model fields.
        while self.events:
            at, _, function = heapq.heappop(self.events)
            with patch('django.utils.timezone.now', return_value=at):
                function()
        with patch('django.utils.timezone.now', return_value=self.at(self.as_of, 8)):
            self.finish()
            from crm.services.consignment import seed_consignment_and_alarms
            seed_consignment_and_alarms(self.as_of)
        return self.credentials


class Command(BaseCommand):
    help = 'Buat simulasi realistis 180 hari pada database CRM kosong; akun demo yang valid dipertahankan.'

    def add_arguments(self, parser):
        parser.add_argument('--as-of', default=timezone.localdate().isoformat())
        parser.add_argument('--seed', type=int, default=20261106)
        parser.add_argument('--show-demo-credentials', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.ONEFLOW_DEMO:
            raise CommandError('Seed hanya untuk ONEFLOW_DEMO=1.')
        try:
            as_of = date.fromisoformat(options['as_of'])
            as_of - timedelta(days=188)
            as_of + timedelta(days=600)
        except (ValueError, TypeError, OverflowError) as error:
            raise CommandError('Tanggal acuan YYYY-MM-DD harus menyediakan ruang untuk riwayat dan kedaluwarsa.') from error
        if any(model.objects.exists() for model in apps.get_app_config('crm').get_models()):
            raise CommandError('Database CRM terisi. Gunakan database baru atau reseed_realistic dengan backup dan konfirmasi reset demo.')
        validate_accounts()
        credentials = Simulation(as_of, options['seed']).run()
        # An invariant failure must roll back the entire seed.
        from crm.synthetic_validation import validate_synthetic
        validate_synthetic()
        from crm.models import Order, SampleRequest, PurchaseOrder
        self.stdout.write(self.style.SUCCESS(
            f'Data sintetis siap per {as_of}: {Customer.objects.count()} pelanggan, {Product.objects.count()} SKU, '
            f'{Order.objects.count()} pesanan, {SampleRequest.objects.count()} sampel, {PurchaseOrder.objects.count()} pengadaan.'))
        if options['show_demo_credentials']:
            for username, password in credentials.items():
                self.stdout.write(f'username={username} password={password}')
        self.stdout.write('Akun yang sudah ada mempertahankan password. Dataset ini fiktif, bukan data atau kebijakan CV Arbain.')
