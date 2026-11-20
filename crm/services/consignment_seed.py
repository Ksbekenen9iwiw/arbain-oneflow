"""Idempotent realistic seed for pharmacy consignment ('titip jual'), directives, and EWS.

Supports both the real 64-SKU Arba'in dataset from Data_asli (MHP-470, SKA-470, FLR-10, etc.)
and legacy unit-test catalogs (MADU01..COSM03).
"""
from datetime import date, timedelta

from django.utils import timezone

from crm.arbain_real_data import ARBAIN_PRODUCTS, classify_outlet
from crm.models import (
    ConsignmentStock,
    ConsignmentVisitEntry,
    Customer,
    Product,
    ProductCarryDirective,
    RawMaterial,
)


def seed_consignment_and_alarms(as_of=None):
    """Idempotently populate consignment stocks at outlets/pharmacies, visit entries
    for Sales Endri & Sales Monic, Manager carry directives for slow/fast items,
    and Raw Material early-warning alarms.
    Does not touch Order, StockBatch, or InventoryBalance ledgers.
    """
    from django.contrib.auth.models import User

    as_of = as_of or timezone.localdate()
    if ConsignmentStock.objects.exists() or RawMaterial.objects.exists():
        return

    manager = User.objects.filter(groups__name='MANAGER').first()
    warehouse = User.objects.filter(groups__name='WAREHOUSE').first()
    nadia = User.objects.filter(username='nadia').first()
    rafi = User.objects.filter(username='rafi').first()
    if not (manager and nadia and rafi):
        return

    products = {p.sku: p for p in Product.objects.all()}
    nadia_customers = list(Customer.objects.filter(owner=nadia, is_active=True).order_by('code'))
    rafi_customers = list(Customer.objects.filter(owner=rafi, is_active=True).order_by('code'))
    if not nadia_customers or not rafi_customers:
        return

    # 0. Assign partner outlet categories & discount rules (Apotek 16%, Minimarket 20%, Distributor 25-30%)
    for customer in Customer.objects.all():
        otype, disc = classify_outlet(customer.name)
        customer.outlet_type = otype
        customer.discount_percent = disc
        customer.save(update_fields=['outlet_type', 'discount_percent'])

    is_real_arbain = 'MHP-470' in products

    # Map logical product slots to either real Arba'in SKUs or legacy test SKUs
    sku_mhp = 'MHP-470' if is_real_arbain else 'MADU01'
    sku_ska = 'SKA-470' if is_real_arbain else 'MADU02'
    sku_flr1 = 'FLR-10' if is_real_arbain else 'HERBAL01'
    sku_flr05 = 'FLR-05' if is_real_arbain else 'HERBAL02'
    sku_evo60 = 'EVO-60' if is_real_arbain else 'COSM03'
    sku_arb60 = 'ARB-60' if is_real_arbain else 'COSM01'
    sku_slow1 = 'BLB-60' if 'BLB-60' in products else ('HERBAL03' if 'HERBAL03' in products else sku_flr05)
    sku_slow2 = 'MRB-250' if 'MRB-250' in products else ('COSM02' if 'COSM02' in products else sku_evo60)

    if sku_mhp not in products:
        return

    # 1. Raw Materials (Early Warning System for CV Arba'in production)
    raw_specs = [
        (
            'RM-MADU',
            'Madu Hutan & Flores Murni Curah (Bahan Pokok)',
            'kg',
            500,
            300,
            1000,
            [s for s in [sku_mhp, sku_flr1, sku_flr05, 'AJM-150', 'MHL-250'] if s in products],
            'Kritis: Madu Hitam Pahit 470 gr & Madu Aliffah Flores sedang laku keras (target stok aman 1.000 kg / 1 ton), stok bahan tersisa 500 kg.',
        ),
        (
            'RM-KURMA',
            'Ekstrak Sari Kurma & Angkak Murni',
            'kg',
            180,
            150,
            350,
            [s for s in [sku_ska, 'SKN-330', 'SKP-330', 'SKT-330', 'MAN-330'] if s in products],
            'Permintaan Sari Kurma Alief 470 gr & Sari Kurma Angkak 330 gr tinggi di seluruh wilayah Solo Raya; jadwalkan pengadaan bahan baku.',
        ),
        (
            'RM-ZAITUN',
            'Minyak Zaitun Extra Virgin & VCO Murni',
            'liter',
            95,
            120,
            250,
            [s for s in [sku_evo60, 'EVO-30', 'VCO-125', 'CRZ-12', 'ZTN-350'] if s in products],
            'Di bawah batas minimum standar 120 liter (penjualan EVO 60 ml & 30 ml mencapai 755 botol bulan Oktober); segera hubungi pemasok.',
        ),
        (
            'RM-KAPSUL',
            'Ekstrak Albumin Ikan Gabus & Habbatussauda',
            'kg',
            140,
            100,
            220,
            [s for s in [sku_arb60, 'HBS-100', 'HBS-60', 'AMB-30', 'ARG-60'] if s in products],
            'Pasokan kapsul Arbabumin 60 kap (terjual 195 botol di Oktober) perlu penambahan sebelum batch produksi berikutnya.',
        ),
        (
            'RM-BOTOL',
            'Botol Kemasan 330/470 gr, 135/250 ml & Segel Arba\'in',
            'unit',
            2450,
            800,
            1800,
            [s for s in [sku_mhp, sku_ska, 'CAF-330'] if s in products],
            'Stok botol dan segel kemasan mencukupi untuk siklus distribusi berjalan.',
        ),
    ]
    for code, name, unit, on_hand, min_t, fast_t, skus, note in raw_specs:
        mat = RawMaterial.objects.create(
            code=code,
            name=name,
            unit=unit,
            on_hand=on_hand,
            min_threshold=min_t,
            fast_moving_threshold=fast_t,
            note=note,
            updated_by=warehouse or manager,
        )
        linked = [products[s] for s in skus if s in products]
        if linked:
            mat.products.set(linked)

    # 2. Consignment stock & visit history across Endri (Sales A) and Monic (Sales B)
    stock_acc = {}

    def add_entry(customer, sku, vdate, prev, sold, rem, added, ret, ret_reason, exp_days, bill_mode, note):
        if sku not in products:
            return
        product = products[sku]
        exp_date = as_of + timedelta(days=exp_days) if exp_days else None
        closing = max(0, rem - ret + added)
        discount_pct = customer.discount_percent or 16
        gross_rp = sold * product.price_rupiah
        if sold <= 2:
            eff_bill = ConsignmentVisitEntry.BillingStatus.NOT_BILLED
            net_rp = 0
        else:
            eff_bill = bill_mode
            net_rp = gross_rp * (100 - discount_pct) // 100
        ConsignmentVisitEntry.objects.create(
            customer=customer,
            product=product,
            sales=customer.owner,
            visit_date=vdate,
            previous_stock=prev,
            sold_quantity=sold,
            remaining_stock=rem,
            added_quantity=added,
            returned_quantity=ret,
            return_reason=ret_reason,
            nearest_expiry_date=exp_date,
            billing_status=eff_bill,
            gross_rupiah=gross_rp,
            discount_percent=discount_pct,
            net_billed_rupiah=net_rp,
            physical_stamp_verified=True,
            closing_stock=closing,
            note=note,
        )
        key = (customer.pk, product.pk)
        cur = stock_acc.get(key)
        if cur is None:
            stock_acc[key] = {
                'customer': customer,
                'product': product,
                'quantity_on_display': closing,
                'total_placed': prev + added,
                'total_sold': sold,
                'total_returned': ret,
                'nearest_expiry_date': exp_date,
                'last_checked_date': vdate,
            }
        else:
            cur['total_placed'] += added
            cur['total_sold'] += sold
            cur['total_returned'] += ret
            if vdate >= cur['last_checked_date']:
                cur['quantity_on_display'] = closing
                cur['last_checked_date'] = vdate
                cur['nearest_expiry_date'] = exp_date

    # Recent 7-day consignment visits for Monday recap + real October 2026 PDF records
    recent_plan = [
        (nadia_customers, 0, sku_mhp, 0, 12, 9, 3, 10, 0, 'NONE', 340, 'BILLED_PAID', 'Setoran Madu Hitam Pahit 470 gr laku keras; tambah titipan 10 botol baru.'),
        (nadia_customers, 0, sku_slow1, 0, 7, 0, 7, 0, 4, 'NEAR_EXPIRY', 120, 'NOT_BILLED', 'Stok tidak bergerak di outlet (L=0, R=7 di rekap Oktober) & mendekati batas tarik ≤ 6 bulan ED; tarik 4 unit.'),
        (nadia_customers, 1, sku_ska, 0, 10, 7, 3, 8, 0, 'NONE', 310, 'DEFERRED', 'Sari Kurma Alief 470 gr rutin terjual, tambah 8 botol (penagihan tunda pekan depan).'),
        (rafi_customers, 0, sku_mhp, 0, 15, 11, 4, 12, 0, 'NONE', 350, 'BILLED_PAID', 'Setoran Madu Hitam Pahit 470 gr tinggi di wilayah Monic, tambah 12 botol.'),
        (rafi_customers, 1, sku_slow2, 0, 10, 1, 9, 0, 0, 'NONE', 145, 'NOT_BILLED', 'Baru laku 1 item (≤ 2 item belum ditagih) & masa simpan < 5 bulan.'),
        (nadia_customers, 2 % len(nadia_customers), sku_flr1, 1, 10, 8, 2, 10, 0, 'NONE', 330, 'BILLED_PAID', 'Madu Aliffah Flores 1 kg laku 8 botol, isi ulang rak 10 botol.'),
        (nadia_customers, 2 % len(nadia_customers), sku_slow2, 1, 8, 1, 7, 0, 0, 'NONE', 260, 'NOT_BILLED', 'Laku 1 item (≤ 2 item belum ditagih), perputaran lambat di outlet.'),
        (nadia_customers, 3 % len(nadia_customers), 'SKN-330' if is_real_arbain else sku_flr1, 1, 8, 5, 3, 6, 0, 'NONE', 300, 'BILLED_PAID', 'Sari Kurma Angkak 330 gr laku 5 botol, tambah 6 botol.'),
        (rafi_customers, 2 % len(rafi_customers), sku_evo60, 1, 12, 8, 4, 8, 0, 'NONE', 320, 'DEFERRED', 'Minyak Zaitun EVO 60 ml laku keras di outlet Monic, tambah 8 botol.'),
        (rafi_customers, 2 % len(rafi_customers), sku_slow1, 1, 8, 0, 8, 0, 5, 'SLOW_MOVING', 150, 'NOT_BILLED', 'Tidak ada penjualan sebulan terakhir & ED ≤ 6 bulan, tarik 5 unit.'),
        (nadia_customers, 4 % len(nadia_customers), sku_arb60, 2, 10, 7, 3, 9, 0, 'NONE', 340, 'BILLED_PAID', 'Kunjungan opname & setoran Arbabumin 60 kap.'),
        (rafi_customers, 3 % len(rafi_customers), sku_ska, 2, 10, 6, 4, 6, 0, 'NONE', 290, 'BILLED_PAID', 'Kunjungan opname & top-up Sari Kurma Alief 470 gr.'),
        (nadia_customers, 5 % len(nadia_customers), 'CAF-330' if is_real_arbain else sku_arb60, 3, 8, 5, 3, 5, 0, 'NONE', 280, 'BILLED_PAID', 'Cuka Apel Fresh 330 ml terjual 5 botol.'),
        (rafi_customers, 4 % len(rafi_customers), sku_slow2, 3, 9, 1, 8, 0, 0, 'NONE', 240, 'NOT_BILLED', 'Perputaran lambat (laku 1 item, belum ditagih).'),
        (nadia_customers, 0, sku_flr05, 4, 6, 4, 2, 6, 0, 'NONE', 270, 'BILLED_PAID', 'Tambah titipan Madu Aliffah Flores 0.5 kg.'),
        (rafi_customers, 5 % len(rafi_customers), 'VCO-125' if is_real_arbain else sku_mhp, 4, 12, 9, 3, 9, 0, 'NONE', 350, 'BILLED_PAID', 'VCO 125 ml laku keras, isi kembali rak outlet.'),
        (nadia_customers, 1, sku_slow1, 5, 6, 0, 6, 0, 0, 'NONE', 135, 'NOT_BILLED', 'Belum ada penjualan di outlet ini (mendekati batas tarik 6 bln ED).'),
        (rafi_customers, 0, sku_slow1, 5, 8, 0, 8, 0, 0, 'NONE', 210, 'NOT_BILLED', 'Stok masih utuh di etalase outlet.'),
        (nadia_customers, 2 % len(nadia_customers), sku_ska, 6, 10, 6, 4, 6, 0, 'NONE', 310, 'BILLED_PAID', 'Awal pekan cek opname & tambah stok.'),
        (rafi_customers, 1, sku_flr05, 6, 10, 8, 2, 8, 0, 'NONE', 345, 'BILLED_PAID', 'Awal pekan cek opname & tambah stok.'),
    ]
    for cust_list, idx, sku, offset, prev, sold, rem, added, ret, ret_reason, exp_days, bill_mode, note in recent_plan:
        add_entry(
            cust_list[idx], sku, as_of - timedelta(days=offset),
            prev, sold, rem, added, ret, ret_reason, exp_days, bill_mode, note,
        )

    # When running with the real Arba'in dataset, also distribute the October 2026
    # RECORD SETOR (A, M, R, L, S) across Endri's & Monic's real outlets!
    if is_real_arbain:
        top_arbain = [row for row in ARBAIN_PRODUCTS if (row[11] + row[12]) > 0][:28]
        for rank, (sku, name, _, _, _, ej, er, el, mj, mr, ml, eg, mg) in enumerate(top_arbain):
            if ej > 0 or eg > 0:
                c_endri = nadia_customers[(rank * 3 + 6) % len(nadia_customers)]
                sold_e = max(1, min(12, el // max(1, min(15, len(nadia_customers) // 6)))) if el > 0 else 0
                rem_e = max(2, min(14, eg // max(1, min(15, len(nadia_customers) // 6))))
                prev_e = sold_e + rem_e
                add_e = sold_e if sold_e > 0 else 2
                vdate_e = min(as_of - timedelta(days=7 + (rank % 18)), date(2026, 10, 28))
                add_entry(
                    c_endri, sku, vdate_e, prev_e, sold_e, rem_e, add_e, 0,
                    'NONE', 300 - (rank % 5) * 20, 'BILLED_PAID' if sold_e > 2 else 'NOT_BILLED',
                    f'Record setor Oktober 2026 {name} (Sales Endri · A={prev_e}, M={add_e}, R={rem_e}, L={sold_e}, S={rem_e + add_e}).',
                )
            if mj > 0 or mg > 0:
                c_monic = rafi_customers[(rank * 3 + 6) % len(rafi_customers)]
                sold_m = max(1, min(12, ml // max(1, min(15, len(rafi_customers) // 6)))) if ml > 0 else 0
                rem_m = max(2, min(14, mg // max(1, min(15, len(rafi_customers) // 6))))
                prev_m = sold_m + rem_m
                add_m = sold_m if sold_m > 0 else 2
                vdate_m = min(as_of - timedelta(days=7 + (rank % 18)), date(2026, 10, 28))
                add_entry(
                    c_monic, sku, vdate_m, prev_m, sold_m, rem_m, add_m, 0,
                    'NONE', 310 - (rank % 5) * 20, 'BILLED_PAID' if sold_m > 2 else 'NOT_BILLED',
                    f'Record setor Oktober 2026 {name} (Sales Monic · A={prev_m}, M={add_m}, R={rem_m}, L={sold_m}, S={rem_m + add_m}).',
                )

    for item in stock_acc.values():
        ConsignmentStock.objects.create(**item)

    # 3. Manager Carry Directives ('Arahan Bawaan Sales' based on Rekap Penjualan Oktober 2026)
    if sku_slow1 in products and sku_mhp in products:
        ProductCarryDirective.objects.create(
            product=products[sku_slow1],
            directive=ProductCarryDirective.Directive.STOP,
            substitute_product=products[sku_mhp],
            reason='Rekap Oktober 2026: 0 botol terjual (100% retur di outlet Endri & Monic). Hentikan titipan baru; alihkan bawaan ke Madu Hitam Pahit 470 gr.',
            updated_by=manager,
        )
    if sku_slow2 in products and sku_ska in products:
        ProductCarryDirective.objects.create(
            product=products[sku_slow2],
            directive=ProductCarryDirective.Directive.REDUCE,
            substitute_product=products[sku_ska],
            reason='Rekap Oktober 2026: Perputaran di outlet sangat lambat (35 botol di outlet, 0 laku). Kurangi bawaan, utamakan Sari Kurma Alief 470 gr.',
            updated_by=manager,
        )
    if sku_mhp in products:
        ProductCarryDirective.objects.create(
            product=products[sku_mhp],
            directive=ProductCarryDirective.Directive.PRIORITY,
            substitute_product=None,
            reason='Produk terlaris Oktober 2026 (total J=901 botol, Laku=440 botol di Endri & Monic). Wajib bawa stok isi ulang di setiap rute kunjungan.',
            updated_by=manager,
        )
    if is_real_arbain and 'EVO-60' in products:
        ProductCarryDirective.objects.create(
            product=products['EVO-60'],
            directive=ProductCarryDirective.Directive.PRIORITY,
            substitute_product=None,
            reason='Penjualan tertinggi di rute Monic & Endri (Laku 314 botol dari 590 botol di Oktober 2026). Prioritaskan pengisian rak apotek.',
            updated_by=manager,
        )
