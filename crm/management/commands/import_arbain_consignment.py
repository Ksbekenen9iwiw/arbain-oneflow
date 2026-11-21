"""Turn the imported Arbain deposit ledger into consignment visits and outlet balances."""
import calendar
from collections import Counter, defaultdict
from datetime import date, datetime, time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from crm.models import Activity, CompanyReportRow, ConsignmentStock, ConsignmentVisitEntry

# Ledger column label -> product name in the monthly sales recap.
PRODUCTS = {
    'AJM 150': 'MADU AJM 150 GR', 'AJM 250': 'MADU AJM 250 GR', 'AKASIA 1': 'GEN AKASIA ALIFFAH 1 KG',
    'AMBEIGO 30': 'AMBEIGO 30 KAP', 'ANGKAK 330': 'SARI KURMA ANGKAK 330 GR', 'ARBABUMIN 60': 'ARBABUMIN 60 KAP',
    'ARBAGARLIC': 'ARBAGARLIC 350 GR', 'ARGABUS': 'ARGABUS 60 KAP', 'ARGABUS 60': 'ARGABUS 60 KAP',
    'BAWANG LANANG': 'MADU BAWANG LANANG 350 GR', 'CREAM ZAITUN 12.5': 'CREAM ZAITUN 12,5 GR',
    'CUKA APEL 100': 'CUKA APEL FRESH 100 ML', 'CUKA APEL 330': 'CUKA APEL FRESH 330 ML',
    'CUKA NANAS 330': 'CUKA NANAS FRESH 330 ML', 'EVO 30': 'MINYAK ZAITUN VO 30 ML', 'EVO 60': 'MINYAK ZAITUN EVO 60 ML',
    'FLORES 0.5': 'MADU ALIFFAH FLORES 0.5 KG', 'FLORES 1': 'MADU ALIFFAH FLORES 1 KG', 'GOTAWA': 'SUSU GOTAWA 200 GR',
    'HABBASY 100': 'HABBATUSSAUDA MINYAK 100 KAP', 'HABBATUS 100': 'HABBATUSSAUDA SERBUK 100 KAP',
    'HABBATUS 200': 'HABBATUSSAUDA SERBUK 200 KAP', 'HABBATUS 60': 'HABBATUSSAUDA SERBUK 60 KAP',
    'JAMBU 330': 'SARI KURMA JAMBU 330 GR', 'KARET 135': 'MADU BUNGA KARET 135 ML', 'KARET 250': 'MADU BUNGA KARET 250 ML',
    'KARET 480': 'MADU BUNGA KARET 480 ML', 'KID LIL WALAD 125': 'MADU KID LIL WALAD 125 ML',
    'KLENGKENG 1': 'GEN ALIFFAH KLENGKENG 1 KG', 'KLENGKENG 135': 'MADU KLENGKENG 135 ML',
    'KLENGKENG 250': 'MADU KLENGKENG 250 ML', 'KLENGKENG 480': 'MADU KLENGKENG 480 ML',
    'LIAR 135': 'MADU HUTAN LIAR 135 ML', 'LIAR 250': 'MADU HUTAN LIAR 250 ML', 'LIAR 480': 'MADU HUTAN LIAR 480 ML',
    'MADU 330': 'SARI KURMA MADU 330 GR', 'MANGGA 480': 'MANGGA 480 ML', 'MANGGIS 135': 'MADU MANGGIS 135 ML',
    'MANGGIS 250': 'MADU MANGGIS 250 ML', 'MANGGIS 480': 'MADU MANGGIS 480 ML', 'MASLANG': 'MASLANG 3O KAP',
    'MD ANGKAK 330': 'MADU ANGKAK 330 GR', 'MD PAHIT 470': 'MADU HITAM PAHIT 470 GR',
    'PROPOLIS 135': 'MADU PROPOLIS 135 ML', 'PROPOLIS 250': 'MADU PROPOLIS 250 ML',
    'PROPOLIS 330': 'SARI KURMA PROPOLIS 330 GR', 'PROPOLIS 480': 'MADU PROPOLIS 480 ML',
    'RAMBUTAN 135': 'MADU RAMBUTAN 135 ML', 'RAMBUTAN 250': 'MADU RAMBUTAN 250 ML', 'RAMBUTAN 480': 'MADU RAMBUTAN 480 ML',
    'RANDU 1': 'GEN RANDU ALIFFAH 1 KG', 'RANDU 135': 'MADU RANDU 135 ML', 'RANDU 250': 'MADU RANDU 250 ML',
    'RANDU 480': 'MADU RANDU 480 ML', 'SALAM 0.5': 'GEN RANDU SALAM 0.5 KG', 'SALAM 1': 'GEN RANDU SALAM 1 KG',
    'SARKUM ALIEF 470': 'SARI KURMA ALIEF 470 GR', 'TAMR 330': 'SARI KURMA TAMR 330 GR',
    'TONGKAT ARAB': 'TONGKAT ARAB 210 ML', 'TONGKAT AROB': 'TONGKAT ARAB 210 ML', 'VCO 125': 'VCO 125 ML',
    'ZAITUN 350': 'ZAITUN 350',
}

MONTHS = ('Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober',
          'November', 'Desember')


def norm(*parts):
    return ' '.join(' '.join(parts).split()).casefold()


def count(value):
    value = (value or '').strip()
    if not value:
        return 0
    return int(value) if value.isascii() and value.isdecimal() else None


def deposit_dates(raw):
    days = []
    for part in (raw or '').split(','):
        try:
            days.append(datetime.strptime(''.join(part.split()), '%d/%m/%Y').date())
        except ValueError:
            return []
    return days


def month_later(day):
    year, month = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


class Command(BaseCommand):
    help = 'Catat rekap setor outlet dari arsip Arba’in sebagai kunjungan titip jual dan saldo titipan.'

    def add_arguments(self, parser):
        parser.add_argument('--period', required=True, help='Bulan laporan, YYYY-MM.')
        parser.add_argument('--apply', action='store_true', help='Tanpa ini, perubahan dibatalkan setelah validasi.')
        parser.add_argument('--schedule-next', action='store_true',
                            help='Jadwalkan kunjungan rutin sebulan setelah setor terakhir tiap outlet.')
        parser.add_argument('--show-skipped', action='store_true', help='Tampilkan outlet dan produk yang dilewati.')

    @transaction.atomic
    def handle(self, *args, period, apply, schedule_next, show_skipped, **options):
        if settings.ONEFLOW_DEMO:
            raise CommandError('Gunakan ONEFLOW_DEMO=0 dan database operasional terpisah.')
        try:
            month = date.fromisoformat(period + '-01')
        except ValueError as error:
            raise CommandError('Bulan tidak valid. Gunakan YYYY-MM.') from error
        rows = CompanyReportRow.objects.filter(report__period=month)
        ledger = list(rows.filter(kind=CompanyReportRow.Kind.LEDGER).order_by('pk'))
        if not ledger:
            raise CommandError('Arsip periode ini tidak berisi rekap setor outlet.')

        products = {row.product: row.catalog_product for row in
                    rows.filter(kind=CompanyReportRow.Kind.SALES, catalog_product__isnull=False).select_related('catalog_product')}
        outlets = {}
        for row in rows.filter(kind=CompanyReportRow.Kind.VISITS, visited_customer__isnull=False).select_related('visited_customer'):
            outlets[row.sales.strip(), norm(row.outlet, row.details.get('Alamat', ''))] = row.visited_customer
        if not products or not outlets:
            raise CommandError('Jalankan import_arbain_masters --apply untuk periode ini terlebih dahulu.')

        existing = set(ConsignmentStock.objects.values_list('customer_id', 'product_id'))
        skipped, skipped_outlets, skipped_products = Counter(), Counter(), Counter()
        visits = defaultdict(list)
        for row in ledger:
            customer = outlets.get((row.sales.strip(), norm(row.outlet)))
            product = products.get(PRODUCTS.get(row.product, ''))
            if customer is None:
                skipped['outlet tidak cocok dengan daftar kunjungan'] += 1
                skipped_outlets[f'{row.sales}: {row.outlet}'] += 1
                continue
            if product is None:
                skipped['produk tidak ada di katalog'] += 1
                skipped_products[row.product] += 1
                continue
            days = deposit_dates(row.details.get('Tanggal setor'))
            opening, added, returned, sold, closing = (count(row.details.get(key)) for key in 'AMRLS')
            if not days:
                skipped['tanggal setor tidak terbaca'] += 1
            elif None in (opening, added, returned, sold, closing) or sold + returned > opening or closing != opening + added - returned - sold:
                skipped['angka tidak konsisten'] += 1
            elif (customer.pk, product.pk) in existing:
                skipped['saldo titipan sudah ada'] += 1
            else:
                existing.add((customer.pk, product.pk))
                visits[customer, max(days)].append((row, product, days, opening, added, returned, sold, closing))

        label = f'laporan setor {MONTHS[month.month - 1]} {month.year}'
        entries, last_visit = 0, {}
        for (customer, day), lines in visits.items():
            sold_total = sum(line[6] for line in lines)
            summary = (f'Cek titip jual {len(lines)} produk: laku {sold_total}, ditarik {sum(line[5] for line in lines)}, '
                       f'titip baru {sum(line[4] for line in lines)}, stok akhir di outlet {sum(line[7] for line in lines)}.')
            done_at = timezone.make_aware(datetime.combine(day, time(12)))
            activity = Activity.objects.create(
                customer=customer, sales=customer.owner, kind=Activity.Kind.VISIT,
                stage=Activity.Stage.WON if sold_total else Activity.Stage.INTERESTED,
                scheduled_date=day, status=Activity.Status.DONE, note=f'Kunjungan titip jual ({label})',
                result=summary, completed_at=done_at)
            Activity.objects.filter(pk=activity.pk).update(created_at=done_at)
            for row, product, days, opening, added, returned, sold, closing in lines:
                source = f'Sumber: {label}, {row.region}, hal. {row.page}.'
                if len(days) > 1:
                    source += ' Gabungan setor ' + ', '.join(d.strftime('%d/%m/%Y') for d in days) + '.'
                ConsignmentVisitEntry.objects.create(
                    customer=customer, product=product, sales=customer.owner, activity=activity, visit_date=day,
                    previous_stock=opening, sold_quantity=sold, remaining_stock=opening - sold, added_quantity=added,
                    returned_quantity=returned, closing_stock=closing,
                    billing_status=ConsignmentVisitEntry.BillingStatus.NOT_BILLED,
                    gross_rupiah=sold * (product.price_rupiah or 0), discount_percent=customer.discount_percent or 0,
                    net_billed_rupiah=0, physical_stamp_verified=False, note=source)
                ConsignmentStock.objects.create(
                    customer=customer, product=product, quantity_on_display=closing, total_placed=opening + added,
                    total_sold=sold, total_returned=returned, last_checked_date=day)
                entries += 1
            last_visit[customer] = max(day, last_visit.get(customer, day))

        scheduled = 0
        if schedule_next:
            planned = set(Activity.objects.filter(status=Activity.Status.PLANNED, customer__in=[c.pk for c in last_visit])
                          .values_list('customer_id', flat=True))
            for customer, day in last_visit.items():
                if customer.pk not in planned:
                    Activity.objects.create(
                        customer=customer, sales=customer.owner, kind=Activity.Kind.VISIT, stage=Activity.Stage.INTERESTED,
                        scheduled_date=month_later(day), status=Activity.Status.PLANNED,
                        note='Kunjungan rutin bulanan titip jual')
                    scheduled += 1

        if not apply:
            transaction.set_rollback(True)
        self.stdout.write(
            f'{len(visits)} kunjungan titip jual di {len(last_visit)} outlet, {entries} baris produk, '
            f'{scheduled} jadwal kunjungan berikutnya. ' + ('Tersimpan.' if apply else 'Simulasi, belum disimpan.'))
        for reason, total in skipped.most_common():
            self.stdout.write(f'Dilewati {total} baris: {reason}.')
        if show_skipped:
            for name, total in sorted(skipped_outlets.items()):
                self.stdout.write(f'  outlet {name} ({total} baris)')
            for name, total in sorted(skipped_products.items()):
                self.stdout.write(f'  produk {name} ({total} baris)')
