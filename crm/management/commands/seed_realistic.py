"""Repeatable, chronological dataset seeder using real CV Arba'in PDF data (Oktober 2026)
and the application's write services.

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
from crm.arbain_real_data import (
    ARBAIN_PRODUCTS,
    ENDRI_OUTLETS,
    MONIC_OUTLETS,
    classify_outlet,
)
from crm.models import Activity, Customer, InventoryBalance, Product, SalesTarget
from crm.services import orders, samples, supply
from crm.services.inventory import receive_stock, set_batch_status


ACCOUNTS = [
    ('nadia', 'Sales Endri', 'SALES'),
    ('rafi', 'Sales Monic', 'SALES'),
    ('gudang', 'Gudang Arba\'in', 'WAREHOUSE'),
    ('manajer', 'Manajer Arba\'in', 'MANAGER'),
]

# Top fast-moving SKUs for Endri and Monic based on REKAP PENJUALAN PRODUK SALES OKT 26.pdf
ENDRI_TOP_SKUS = [
    'MHP-470', 'FLR-10', 'SKN-330', 'FLR-05', 'SKA-470', 'ARB-60', 'EVO-60',
    'CRZ-12', 'AJM-150', 'CAF-330', 'EVO-30', 'VCO-125', 'SKP-330', 'KLW-125',
    'SKT-330', 'AJM-250', 'MAN-330', 'SKM-330', 'SKJ-330', 'MPR-250',
]
MONIC_TOP_SKUS = [
    'EVO-60', 'MHP-470', 'FLR-05', 'SKA-470', 'FLR-10', 'EVO-30', 'ARB-60',
    'MAN-330', 'VCO-125', 'SKN-330', 'CAF-100', 'SKT-330', 'SKP-330', 'SKM-330',
    'CAF-330', 'MPR-135', 'SKJ-330', 'MHL-135', 'MBK-135', 'MRD-135',
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
        self.outlet_meta = {}

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

    def clamp_day(self, raw_date_str, fallback_days_ago=30):
        try:
            d = date.fromisoformat(raw_date_str)
        except (ValueError, TypeError):
            d = self.as_of - timedelta(days=fallback_days_ago)
        earliest = self.start + timedelta(days=4)
        latest = self.as_of - timedelta(days=3)
        if d < earliest:
            # Preserve relative day-of-month inside the 180-day window
            offset = (d.month * 28 + d.day) % 110
            d = earliest + timedelta(days=offset)
        if d > latest:
            d = latest
        if d.weekday() == 6:
            d -= timedelta(days=1)
        return max(earliest, min(latest, d))

    def setup(self):
        for username, name, role in ACCOUNTS:
            user = User.objects.filter(username=username).first()
            if user is None:
                password = secrets.token_urlsafe(18)
                user = User.objects.create_user(username, password=password, first_name=name)
                user.groups.add(Group.objects.get_or_create(name=role)[0])
                self.credentials[username] = password
            elif user.first_name != name:
                user.first_name = name
                user.save(update_fields=['first_name'])
            self.users[username] = user

        for row in ARBAIN_PRODUCTS:
            sku, name, unit, price, minimum = row[0], row[1], row[2], row[3], row[4]
            product = Product.objects.create(
                sku=sku,
                name=name,
                unit=unit,
                price_rupiah=price,
                min_stock=minimum,
                min_shelf_life_days=45,
            )
            InventoryBalance.objects.create(product=product)
            self.products[sku] = product
            supply.save_settings(self.users['manajer'], product.pk, 30, 7, 21, 5)

        samples.save_policy(self.users['manajer'], 2, 180, 14)

        idx = 0
        for endri_idx, (name, district, region, setor_s, ambil_s, extras) in enumerate(ENDRI_OUTLETS, start=1):
            otype, disc = classify_outlet(name)
            cust = Customer.objects.create(
                code=f'END-{endri_idx:03d}',
                name=name,
                outlet_type=otype,
                discount_percent=disc,
                phone=f'0271-78{endri_idx:04d}',
                address=f'{district}, {region}, Jawa Tengah (Wilayah Sales Endri)',
                owner=self.users['nadia'],
            )
            self.customers[idx] = cust
            self.outlet_meta[idx] = ('nadia', region, setor_s, ambil_s, extras)
            idx += 1

        for monic_idx, (name, district, region, setor_s, ambil_s, extras) in enumerate(MONIC_OUTLETS, start=1):
            otype, disc = classify_outlet(name)
            cust = Customer.objects.create(
                code=f'MON-{monic_idx:03d}',
                name=name,
                outlet_type=otype,
                discount_percent=disc,
                phone=f'0271-89{monic_idx:04d}',
                address=f'{district}, {region}, Jawa Tengah (Wilayah Sales Monic)',
                owner=self.users['rafi'],
            )
            self.customers[idx] = cust
            self.outlet_meta[idx] = ('rafi', region, setor_s, ambil_s, extras)
            idx += 1

        month = self.start.replace(day=1)
        while month <= self.as_of:
            for username, target in [('nadia', 68000000), ('rafi', 72000000)]:
                SalesTarget.objects.create(sales=self.users[username], month=month, target_rupiah=target)
            month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)

    def plan_order(self, index, day, lines, status='SHIPPED', on_ship=None, note_context='setoran & pengisian rak'):
        customer, state = self.customers[index], {}
        # Deduplicate lines by SKU while keeping positive quantities
        merged = {}
        for sku, qty in lines:
            if qty > 0:
                merged[sku] = merged.get(sku, 0) + qty
        clean_lines = list(merged.items())
        if not clean_lines:
            return
        if status in ('SHIPPED', 'CONFIRMED'):
            self.demand(day, clean_lines)

        def draft():
            state['order'] = orders.create_draft(customer.owner, customer.pk, self.lines(clean_lines))
            Activity.objects.create(
                customer=customer,
                sales=customer.owner,
                kind='VISIT',
                stage='WON',
                scheduled_date=day,
                status='DONE',
                completed_at=timezone.now(),
                note=f'Kunjungan {note_context} ({len(clean_lines)} SKU produk Arba\'in).',
                result=f'Pesanan OF-{state["order"].pk:04d} dicatat dari realisasi laku & tambah stok outlet.',
            )

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
            self.add(
                day,
                15,
                lambda: orders.cancel_order(
                    customer.owner,
                    state['order'].pk,
                    'Outlet menunda pengisian ulang karena stok titipan di etalase masih mencukupi.',
                ),
            )

    def plan_history(self):
        all_skus = [row[0] for row in ARBAIN_PRODUCTS]
        total_outlets = len(self.customers)

        # 1. Schedule real visits and sales orders across all Endri & Monic outlets
        for index in range(total_outlets):
            owner_key, region, setor_s, ambil_s, extras = self.outlet_meta[index]
            top_pool = ENDRI_TOP_SKUS if owner_key == 'nadia' else MONIC_TOP_SKUS

            setor_day = self.clamp_day(setor_s, fallback_days_ago=20)
            ambil_day = self.clamp_day(ambil_s, fallback_days_ago=55)
            if ambil_day >= setor_day:
                ambil_day = max(self.start + timedelta(days=4), setor_day - timedelta(days=28))

            # Pick 2-3 signature products for this outlet so repeat-purchase patterns are realistic
            primary_sku = top_pool[index % len(top_pool)]
            secondary_sku = top_pool[(index * 3 + 5) % len(top_pool)]
            tertiary_sku = all_skus[(index * 7 + 11) % len(all_skus)]
            base_qty = 6 if self.customers[index].outlet_type == 'DISTRIBUTOR' else (4 if self.customers[index].outlet_type == 'MINIMARKET' else 3)

            # High-activity outlets (first 24 of Endri & first 24 of Monic) get 3-4 cycles
            # so the repeat-purchase recommendation engine has >= 3 distinct purchase dates.
            is_core_outlet = (index < 24) or (len(ENDRI_OUTLETS) <= index < len(ENDRI_OUTLETS) + 24)

            if is_core_outlet:
                d1 = max(self.start + timedelta(days=5 + (index % 14)), ambil_day - timedelta(days=56))
                d2 = max(d1 + timedelta(days=24), ambil_day - timedelta(days=26))
                d3 = max(d2 + timedelta(days=21), ambil_day)
                d4 = max(d3 + timedelta(days=21), setor_day)
                visit_days = sorted({d for d in (d1, d2, d3, d4) if self.start + timedelta(days=4) <= d <= self.as_of - timedelta(days=4)})
                for cycle_idx, vday in enumerate(visit_days):
                    qty1 = base_qty + (cycle_idx % 3)
                    lines = [(primary_sku, qty1), (secondary_sku, max(2, qty1 - 1))]
                    if cycle_idx % 2 == 1 and tertiary_sku not in (primary_sku, secondary_sku):
                        lines.append((tertiary_sku, 2))
                    self.plan_order(
                        index,
                        vday,
                        lines,
                        note_context=f'setoran rutin wilayah {region} (Tgl Setor {setor_s})',
                    )
            else:
                # Standard outlets from the PDF: order on ambil_day and setor_day
                lines_ambil = [(primary_sku, base_qty), (secondary_sku, 2)]
                self.plan_order(
                    index,
                    ambil_day,
                    lines_ambil,
                    note_context=f'penitipan & ambil stok wilayah {region} (Tgl Ambil {ambil_s})',
                )
                if (setor_day - ambil_day).days >= 10:
                    lines_setor = [(primary_sku, base_qty + 1)]
                    if tertiary_sku != primary_sku:
                        lines_setor.append((tertiary_sku, 2))
                    self.plan_order(
                        index,
                        setor_day,
                        lines_setor,
                        note_context=f'setor outlet wilayah {region} (Tgl Setor {setor_s})',
                    )

            # Extra repeat visits in October 2026 (yellow rows in KUNJUNGAN SALES ARBAIN OKT 26.pdf)
            for extra_s in extras:
                extra_day = self.clamp_day(extra_s, fallback_days_ago=12)
                customer = self.customers[index]

                def log_repeat_visit(c=customer, d=extra_day, reg=region, s=extra_s):
                    Activity.objects.create(
                        customer=c,
                        sales=c.owner,
                        kind='VISIT',
                        stage='INTERESTED',
                        scheduled_date=d,
                        status='DONE',
                        completed_at=timezone.now(),
                        note=f'Kunjungan ke-2 bulan Oktober ({s}) wilayah {reg} (indikasi warna kuning PDF).',
                        result='Cek stok opname berkala & konfirmasi kesiapan etalase outlet.',
                    )

                self.add(extra_day, 15, log_repeat_visit)

        # 2. Recent current-month shipments (so November / current month dashboard chart & KPIs are active)
        mon_offset = len(ENDRI_OUTLETS)
        recent_shipments = [
            (0, 12, [('MHP-470', 10), ('SKA-470', 8)]),
            (5, 11, [('FLR-10', 6), ('FLR-05', 8)]),
            (11, 9, [('SKN-330', 12), ('ARB-60', 6)]),
            (14, 8, [('MHP-470', 12), ('CRZ-12', 15), ('AJM-150', 8)]),
            (19, 6, [('CAF-330', 10), ('VCO-125', 8)]),
            (25, 5, [('FLR-10', 10), ('MHP-470', 12)]),
            (31, 4, [('SKA-470', 8), ('EVO-60', 10)]),
            (41, 3, [('MHP-470', 11), ('SKN-330', 10), ('ARB-60', 5)]),
            (mon_offset + 0, 12, [('EVO-60', 12), ('EVO-30', 10)]),
            (mon_offset + 2, 10, [('FLR-10', 10), ('FLR-05', 10), ('SKA-470', 6)]),
            (mon_offset + 7, 8, [('EVO-60', 10), ('MHP-470', 8)]),
            (mon_offset + 10, 7, [('CAF-100', 12), ('ARB-60', 6)]),
            (mon_offset + 12, 5, [('MHP-470', 10), ('MAN-330', 8)]),
            (mon_offset + 17, 4, [('FLR-05', 10), ('VCO-125', 8)]),
            (mon_offset + 21, 3, [('SKA-470', 12), ('SKT-330', 8)]),
            (mon_offset + 30, 2, [('MHP-470', 10), ('EVO-60', 12)]),
        ]
        for c_idx, days_ago, lines in recent_shipments:
            ship_day = self.as_of - timedelta(days=days_ago)
            if ship_day.weekday() == 6:
                ship_day -= timedelta(days=1)
            if ship_day > self.start + timedelta(days=4):
                self.plan_order(c_idx, ship_day, lines, 'SHIPPED', note_context='pengiriman berjalan bulan ini')

        # 3. Active CONFIRMED orders (Menunggu pengiriman di Gudang), DRAFT, and CANCELLED
        for c_idx, sku, qty in [
            (2, 'MHP-470', 8),
            (9, 'SKA-470', 10),
            (mon_offset + 3, 'EVO-60', 12),
            (mon_offset + 13, 'FLR-05', 8),
        ]:
            self.plan_order(c_idx, self.as_of - timedelta(days=1), [(sku, qty)], 'CONFIRMED')

        for c_idx, sku, qty in [
            (6, 'ARB-60', 10),
            (18, 'SKN-330', 12),
            (mon_offset + 5, 'CAF-100', 12),
            (mon_offset + 20, 'MAN-330', 10),
        ]:
            self.plan_order(c_idx, self.as_of - timedelta(days=2), [(sku, qty)], 'DRAFT')

        for c_idx, sku, days_ago in [
            (3, 'VCO-125', 14),
            (15, 'MPR-250', 19),
            (mon_offset + 4, 'SKP-330', 23),
            (mon_offset + 16, 'KLW-125', 27),
        ]:
            self.plan_order(c_idx, self.as_of - timedelta(days=days_ago), [(sku, 6)], 'CANCELLED')

    def plan_sample(self, index, sku, days_ago, outcome=None, stage='RECEIVED'):
        customer, state = self.customers[index], {}
        day = self.as_of - timedelta(days=days_ago)
        if stage in ('APPROVED', 'SHIPPED', 'RECEIVED'):
            self.demand(day, [(sku, 1)])

        def create():
            state['request'] = samples.create_draft(
                customer.owner,
                customer.pk,
                self.lines([(sku, 1)]),
                purpose='Uji display kemasan & minat konsumen apotek sebelum penempatan konsinyasi.',
                customer_need=f'Outlet {customer.name} meminta sampel {self.products[sku].name} untuk pengenalan produk baru.',
                potential_orders='Potensi titip jual awal 12 botol; evaluasi perputaran dalam 14 hari.',
                business_profile=f'{customer.name} ({customer.address}).',
                notes='Sampel produk CV Arba\'in untuk evaluasi mitra outlet.',
            )
            if stage != 'DRAFT':
                samples.submit_request(customer.owner, state['request'].pk)

        def decision():
            samples.decide(
                self.users['manajer'],
                state['request'].pk,
                'REJECTED' if stage == 'REJECTED' else 'APPROVED',
                'Riwayat pengajuan sampel sebelumnya di outlet ini belum menghasilkan penjualan.'
                if stage == 'REJECTED'
                else 'Disetujui 1 botol untuk evaluasi display outlet; sales wajib tindak lanjut dalam 14 hari.',
            )

        self.add(day, 9, create)
        if stage in ('DRAFT', 'SUBMITTED'):
            return
        self.add(day + timedelta(days=1), 10, decision)
        if stage in ('REJECTED', 'APPROVED'):
            return
        self.add(day + timedelta(days=2), 13, lambda: samples.ship_request(self.users['gudang'], state['request'].pk))
        if stage == 'SHIPPED':
            return

        def received():
            samples.mark_received(customer.owner, state['request'].pk)
            samples.schedule_followup(
                customer.owner,
                state['request'].pk,
                day + timedelta(days=14),
                'Konfirmasi hasil uji display, harga potongan mitra, dan jadwal penitipan perdana.',
            )

        self.add(day + timedelta(days=3), 10, received)
        if outcome == 'PURCHASED':
            def linked(order):
                samples.record_followup(
                    customer.owner,
                    state['request'].pk,
                    'Respon pelanggan apotek sangat baik; pesanan awal 12 botol telah dikirim.',
                    'PURCHASED',
                    'Konversi sampel ke pesanan produk yang sama setelah evaluasi outlet.',
                    order.pk,
                )

            self.plan_order(index, day + timedelta(days=15), [(sku, 12)], on_ship=linked)
        elif outcome:
            responses = {
                'EVALUATING': 'Produk masih dipajang di etalase utama; apotek meminta tambahan waktu evaluasi 1 minggu.',
                'NO_RESPONSE': 'Sudah dua kali dikunjungi saat jam operasional, pemilik apotek sedang di luar kota.',
                'NOT_INTERESTED': 'Segmen pelanggan di sekitar outlet lebih memilih varian kemasan kecil 135 ml.',
            }
            self.add(
                day + timedelta(days=14),
                15,
                lambda: samples.record_followup(
                    customer.owner,
                    state['request'].pk,
                    responses[outcome],
                    outcome,
                    'Catatan evaluasi kunjungan sales Arba\'in.',
                ),
            )

    def plan_samples(self):
        mon = len(ENDRI_OUTLETS)
        for args in [
            (4, 'MHP-470', 65, 'PURCHASED'),
            (mon + 4, 'EVO-60', 46, 'PURCHASED'),
            (10, 'ARB-60', 28, 'NOT_INTERESTED'),
            (mon + 10, 'SKA-470', 20, 'EVALUATING'),
            (16, 'VCO-125', 80, 'NO_RESPONSE'),
            (16, 'VCO-125', 45, 'NO_RESPONSE'),
            (mon + 14, 'CAF-330', 22, 'NO_RESPONSE'),
            (mon + 22, 'FLR-05', 6, None),
        ]:
            self.plan_sample(*args)
        self.plan_sample(16, 'VCO-125', 3, stage='REJECTED')
        self.plan_sample(20, 'KLW-125', 2, stage='SUBMITTED')
        self.plan_sample(21, 'SKN-330', 2, stage='DRAFT')
        self.plan_sample(mon + 25, 'MAN-330', 2, stage='APPROVED')
        self.plan_sample(mon + 18, 'MPR-135', 3, stage='SHIPPED')

    def plan_receipts(self):
        buckets = defaultdict(Counter)
        for day, sku, quantity in self.demands:
            period_idx = max(0, min(8, (day - self.start).days // 21))
            buckets[period_idx][sku] += quantity

        for period in range(9):
            day = self.start + timedelta(days=period * 21)
            for row in ARBAIN_PRODUCTS:
                sku, _, _, _, minimum, ej, _, _, mj, _, _, eg, mg = row
                # Buffer ensures every one of the 64 Arba'in SKUs has active warehouse stock
                buffer = max(minimum + 15, (eg + mg) // 4 + 20) if period == 0 else 0
                quantity = buckets[period][sku] + buffer
                if not quantity:
                    continue
                life = 540
                state = {}

                def create(sku=sku, qty=quantity, day=day, state=state, period=period):
                    state['po'] = supply.create_purchase_order(
                        self.users['manajer'],
                        self.products[sku].pk,
                        qty,
                        day,
                        f'Produksi & Pengadaan CV Arba\'in — pengisian stok {sku}, siklus {period + 1}.',
                    )

                def receive(sku=sku, qty=quantity, day=day, life=life, state=state):
                    supply.receive_purchase_order(
                        self.users['gudang'],
                        state['po'].pk,
                        qty,
                        uuid5(NAMESPACE_URL, f'oneflow:{self.seed}:{day}:{sku}'),
                        batch_code=f'ARB-{sku}-{day:%y%m%d}',
                        received_date=day,
                        expiry_date=day + timedelta(days=life),
                    )

                self.add(day - timedelta(days=7), 9, create)
                self.add(day, 8, receive)

        # Delayed inbound commitment and partially received purchase order
        for sku, qty, expected_offset, partial in [
            ('SKA-470', 180, -2, 0),
            ('MHP-470', 240, 5, 0),
            ('EVO-60', 120, 4, 24),
        ]:
            state = {}

            def create(sku=sku, qty=qty, offset=expected_offset, state=state, partial=partial):
                state['po'] = supply.create_purchase_order(
                    self.users['manajer'],
                    self.products[sku].pk,
                    qty,
                    self.as_of + timedelta(days=offset),
                    'Pemasok kemasan & produksi: menunggu sisa pengiriman batch.'
                    if partial
                    else 'Pengadaan terjadwal CV Arba\'in untuk stok bulan berjalan.',
                )

            self.add(self.as_of - timedelta(days=9), 10, create)
            if partial:
                def receive(sku=sku, qty=partial, state=state):
                    day = self.as_of - timedelta(days=2)
                    supply.receive_purchase_order(
                        self.users['gudang'],
                        state['po'].pk,
                        qty,
                        uuid5(NAMESPACE_URL, f'oneflow:{self.seed}:partial:{sku}'),
                        batch_code=f'ARB-PART-{sku}',
                        received_date=day,
                        expiry_date=day + timedelta(days=540),
                    )

                self.add(self.as_of - timedelta(days=2), 8, receive)

        # Inspection lots: physically present, but unavailable for FEFO (near-expiry / QC held)
        for sku, code, expiry, status in [
            ('BLB-60', 'QC-HELD', -2, 'HELD'),
            ('CAF-330', 'SHORT-DATED', 20, 'ACTIVE'),
        ]:
            day = self.as_of - timedelta(days=100 if status == 'HELD' else 10)

            def inspect(sku=sku, code=code, expiry=expiry, status=status, day=day):
                movement = receive_stock(
                    self.users['gudang'],
                    self.products[sku].pk,
                    6,
                    'Lot retur outlet untuk pemeriksaan mutu & kedaluwarsa; masa simpan di bawah batas kirim.',
                    uuid5(NAMESPACE_URL, f'oneflow:{self.seed}:{code}'),
                    batch_code=f'ARB-{code}',
                    received_date=day,
                    expiry_date=self.as_of + timedelta(days=expiry),
                )
                if status == 'HELD':
                    set_batch_status(self.users['gudang'], self.products[sku].pk, movement.batch_id, status)

            self.add(day, 8, inspect)

    def finish(self):
        total = len(self.customers)
        inactive_indices = {total - 4, total - 3, len(ENDRI_OUTLETS) - 2, len(ENDRI_OUTLETS) - 1}
        for index, customer in self.customers.items():
            if index in inactive_indices:
                customer.is_active = False
                customer.save(update_fields=['is_active'])
                Activity.objects.create(
                    customer=customer,
                    sales=customer.owner,
                    kind='INTERACTION',
                    stage='LOST',
                    status='DONE',
                    completed_at=timezone.now(),
                    note='Evaluasi outlet belum melakukan kunjungan/setoran aktif.',
                    result='Outlet tutup sementara / menghentikan titip jual produk herbal.',
                )
                continue
            if index % 4 == 0:
                due = self.as_of + timedelta(days=(-4, -1, 0, 2, 5, 8)[index % 6])
                with patch('django.utils.timezone.now', return_value=self.at(self.as_of - timedelta(days=12))):
                    Activity.objects.create(
                        customer=customer,
                        sales=customer.owner,
                        kind='FOLLOWUP',
                        stage='INTERESTED',
                        followup_date=due,
                        note='Jadwal kunjungan stok opname berkala & penagihan setoran outlet bulan berjalan.',
                    )

    def run(self):
        with patch('django.utils.timezone.now', return_value=self.at(self.start - timedelta(days=8))):
            self.setup()
        self.plan_history()
        self.plan_samples()
        self.plan_receipts()
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
    help = 'Seed data operasional CV Arba\'in (64 SKU, 218 outlet Endri & Monic, kunjungan & setoran Oktober 2026).'

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
        from crm.synthetic_validation import validate_synthetic
        validate_synthetic()
        from crm.models import Order, PurchaseOrder, SampleRequest
        self.stdout.write(
            self.style.SUCCESS(
                f'Data operasional Arba\'in siap per {as_of}: {Customer.objects.count()} pelanggan, '
                f'{Product.objects.count()} SKU, {Order.objects.count()} pesanan, '
                f'{SampleRequest.objects.count()} sampel, {PurchaseOrder.objects.count()} pengadaan.'
            )
        )
        if options['show_demo_credentials']:
            for username, password in credentials.items():
                self.stdout.write(f'username={username} password={password}')
        self.stdout.write('Akun yang sudah ada mempertahankan password.')
