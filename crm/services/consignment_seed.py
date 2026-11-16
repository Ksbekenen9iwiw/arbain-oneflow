"""Idempotent realistic demo seed for pharmacy consignment, directives, and EWS."""
from datetime import timedelta

from django.utils import timezone

from crm.models import (
    ConsignmentStock,
    ConsignmentVisitEntry,
    Customer,
    Product,
    ProductCarryDirective,
    RawMaterial,
)


def seed_consignment_and_alarms(as_of=None):
    """Idempotently populate realistic consignment stocks at pharmacies, 7-day visit
    entries for Sales A & Sales B, Manager carry directives for slow/fast items,
    and Raw Material early-warning alarms (including the 1-ton vs 0.5-ton scenario).
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
    nadia_customers = list(Customer.objects.filter(owner=nadia, is_active=True).order_by('code')[:6])
    rafi_customers = list(Customer.objects.filter(owner=rafi, is_active=True).order_by('code')[:6])
    if not nadia_customers or not rafi_customers or 'MADU01' not in products:
        return

    # 0. Assign partner outlet categories & discount rules (QnA #11: Apotek 16%, Minimarket 20%, Distributor 25-50%)
    for customer in Customer.objects.all():
        name_lower = customer.name.lower()
        if 'distributor' in name_lower or 'grosir' in name_lower:
            customer.outlet_type = Customer.OutletType.DISTRIBUTOR
            customer.discount_percent = 30
        elif 'mart' in name_lower or 'swalayan' in name_lower or 'minimarket' in name_lower or 'toko' in name_lower:
            customer.outlet_type = Customer.OutletType.MINIMARKET
            customer.discount_percent = 20
        else:
            customer.outlet_type = Customer.OutletType.APOTEK
            customer.discount_percent = 16
        customer.save(update_fields=['outlet_type', 'discount_percent'])

    # 1. Raw Materials (Early Warning System: 1 ton required for fast-moving MADU01, only 500 kg left!)
    raw_specs = [
        (
            'RM-MADU',
            'Madu Hutan Mentah Murni (Bahan Pokok)',
            'kg',
            500,
            300,
            1000,
            ['MADU01', 'MADU02'],
            'Kritis: Madu Hutan 250 ml sedang laku keras (wajib sedia 1.000 kg / 1 ton), stok tersisa 500 kg (setengah ton).',
        ),
        (
            'RM-TEMU',
            'Simplisia & Ekstrak Herbal Temulawak',
            'kg',
            180,
            150,
            300,
            ['HERBAL01', 'HERBAL02'],
            'Perlu pengadaan tambahan sebelum produksi batch minggu depan.',
        ),
        (
            'RM-ZAITUN',
            'Minyak Atsiri & Bahan Dasar Perawatan',
            'liter',
            95,
            120,
            250,
            ['COSM01', 'COSM03'],
            'Di bawah batas minimum standar 120 liter; hubungi pemasok.',
        ),
        (
            'RM-BOTOL',
            'Botol Kaca Amber 250 ml & Segel',
            'unit',
            1850,
            600,
            1500,
            ['MADU01', 'HERBAL01'],
            'Stok kemasan mencukupi untuk produksi berjalan.',
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

    # 2. Consignment stock & 7-day visit history across Nadia (Sales A) and Rafi (Sales B)
    consign_plan = [
        # Today (day_offset = 0)
        (nadia_customers, 0, 'MADU01', 0, 12, 9, 3, 10, 0, 'NONE', 340, 'BILLED_PAID', 'Laku keras di Apotek; tambah titipan 10 botol baru.'),
        (nadia_customers, 0, 'HERBAL03', 0, 8, 0, 8, 0, 4, 'NEAR_EXPIRY', 120, 'NOT_BILLED', 'Teh Herbal tidak bergerak & mendekati 4 bulan sebelum ED (≤ 6 bln); tarik 4 unit.'),
        (nadia_customers, 1, 'MADU02', 0, 10, 7, 3, 8, 0, 'NONE', 310, 'DEFERRED', 'Permintaan rutin stabil, tambah 8 botol (penagihan tunda pekan depan oleh petugas tagih).'),
        (rafi_customers, 0, 'MADU01', 0, 15, 11, 4, 12, 0, 'NONE', 350, 'BILLED_PAID', 'Penjualan tinggi pekan ini, tambah 12 botol.'),
        (rafi_customers, 1, 'COSM02', 0, 10, 1, 9, 0, 0, 'NONE', 145, 'NOT_BILLED', 'Balm Herbal baru laku 1 item (≤ 2 item belum ditagih) & masa simpan < 5 bulan.'),
        # Yesterday (day_offset = 1)
        (nadia_customers, 2, 'MADU01', 1, 10, 8, 2, 10, 0, 'NONE', 330, 'BILLED_PAID', 'Stok titipan hampir habis, isi ulang 10 botol.'),
        (nadia_customers, 2, 'COSM02', 1, 8, 1, 7, 0, 0, 'NONE', 260, 'NOT_BILLED', 'Laku 1 item (≤ 2 item belum ditagih), kurang diminati pelanggan apotek.'),
        (nadia_customers, 3, 'HERBAL01', 1, 8, 5, 3, 6, 0, 'NONE', 300, 'BILLED_PAID', 'Minuman Herbal laku 5 botol, tambah 6 botol.'),
        (rafi_customers, 2, 'MADU02', 1, 12, 8, 4, 8, 0, 'NONE', 320, 'DEFERRED', 'Penjualan bagus, tambah 8 botol (jadwal tagih tunda).'),
        (rafi_customers, 2, 'HERBAL03', 1, 10, 0, 10, 0, 5, 'SLOW_MOVING', 150, 'NOT_BILLED', 'Tidak ada penjualan sebulan terakhir & ED ≤ 6 bulan, tarik 5 unit.'),
        # 2 to 6 days ago (for full 1-week Monday meeting recap)
        (nadia_customers, 4, 'MADU01', 2, 10, 7, 3, 9, 0, 'NONE', 340, 'BILLED_PAID', 'Kunjungan rutin cek stok titipan.'),
        (rafi_customers, 3, 'HERBAL01', 2, 10, 6, 4, 6, 0, 'NONE', 290, 'BILLED_PAID', 'Kunjungan rutin & top-up stok rak.'),
        (nadia_customers, 5 % len(nadia_customers), 'COSM01', 3, 8, 5, 3, 5, 0, 'NONE', 280, 'BILLED_PAID', 'Sabun Herbal terjual 5 unit.'),
        (rafi_customers, 4 % len(rafi_customers), 'COSM02', 3, 9, 1, 8, 0, 0, 'NONE', 240, 'NOT_BILLED', 'Perputaran Balm Herbal sangat lambat (laku 1 item, belum ditagih).'),
        (nadia_customers, 0, 'HERBAL02', 4, 6, 4, 2, 6, 0, 'NONE', 270, 'BILLED_PAID', 'Tambah stok Serbuk Herbal.'),
        (rafi_customers, 5 % len(rafi_customers), 'MADU01', 4, 12, 9, 3, 9, 0, 'NONE', 350, 'BILLED_PAID', 'Laku keras, isi kembali rak utama.'),
        (nadia_customers, 1, 'HERBAL03', 5, 6, 0, 6, 0, 0, 'NONE', 135, 'NOT_BILLED', 'Belum ada penjualan Teh Herbal di outlet ini (mendekati batas tarik 6 bln ED).'),
        (rafi_customers, 0, 'HERBAL03', 5, 8, 0, 8, 0, 0, 'NONE', 210, 'NOT_BILLED', 'Stok Teh Herbal masih utuh di etalase.'),
        (nadia_customers, 2, 'MADU02', 6, 10, 6, 4, 6, 0, 'NONE', 310, 'BILLED_PAID', 'Awal pekan cek & tambah stok.'),
        (rafi_customers, 1, 'MADU01', 6, 10, 8, 2, 8, 0, 'NONE', 345, 'BILLED_PAID', 'Awal pekan cek & tambah stok.'),
    ]

    stock_acc = {}
    for cust_list, idx, sku, offset, prev, sold, rem, added, ret, ret_reason, exp_days, bill_mode, note in consign_plan:
        if sku not in products or idx >= len(cust_list):
            continue
        customer = cust_list[idx]
        customer.refresh_from_db()
        product = products[sku]
        vdate = as_of - timedelta(days=offset)
        exp_date = as_of + timedelta(days=exp_days) if exp_days else None
        closing = rem - ret + added
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

    for item in stock_acc.values():
        ConsignmentStock.objects.create(**item)

    # 3. Manager Carry Directives ('Arahan Bawaan Sales')
    if 'HERBAL03' in products and 'MADU01' in products:
        ProductCarryDirective.objects.create(
            product=products['HERBAL03'],
            directive=ProductCarryDirective.Directive.STOP,
            substitute_product=products['MADU01'],
            reason='Tidak laku di hampir seluruh apotek (0 terjual dalam 30 hari). Sales tidak usah bawa dulu; ganti bawa Madu Hutan 250 ml & Madu Bunga 100 ml.',
            updated_by=manager,
        )
    if 'COSM02' in products and 'MADU02' in products:
        ProductCarryDirective.objects.create(
            product=products['COSM02'],
            directive=ProductCarryDirective.Directive.REDUCE,
            substitute_product=products['MADU02'],
            reason='Perputaran di apotek sangat lambat (< 15%). Jangan tambah titipan baru, alihkan bawaan ke Madu Bunga 100 ml.',
            updated_by=manager,
        )
    if 'MADU01' in products:
        ProductCarryDirective.objects.create(
            product=products['MADU01'],
            directive=ProductCarryDirective.Directive.PRIORITY,
            substitute_product=None,
            reason='Laku keras di seluruh apotek (> 70% terjual). Pastikan setiap kunjungan membawa stok isi ulang.',
            updated_by=manager,
        )
