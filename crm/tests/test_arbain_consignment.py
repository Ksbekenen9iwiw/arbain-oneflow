from datetime import date
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings

from crm.models import Activity, CompanyReport, CompanyReportRow, ConsignmentStock, ConsignmentVisitEntry, Customer
from crm.tests.factories import make_user


@override_settings(ONEFLOW_DEMO=False, ONEFLOW_COMPANY_ARCHIVE=True)
class ArbainConsignmentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.manager = make_user('arbain_admin', 'MANAGER')
        source = CompanyReport.objects.create(period=date(2026, 10, 1), path='reports.pdf', checksum='c' * 64, content=b'fixture')
        make = lambda **fields: CompanyReportRow.objects.create(report=source, page=1, **fields)
        make(source_row='1', kind='visits', sales='Endri', outlet='ap diana', observed_date=date(2026, 10, 12), details={'Alamat': 'palur'})
        make(source_row='2', kind='sales', sales='Endri', product='MADU HUTAN LIAR 250 ML', quantity=4, sold=1, returned=3)
        make(source_row='3', kind='sales', sales='Endri', product='MADU RANDU 135 ML', quantity=2, sold=2, returned=0)

        def ledger(row, outlet, product, setor, a, m, r, l, s):
            make(source_row=row, kind='ledger', sales='Endri', outlet=outlet, product=product, region='Karanganyar',
                 details={'Tanggal setor': setor, 'A': a, 'M': m, 'R': r, 'L': l, 'S': s})
        ledger('4', 'ap diana palur', 'LIAR 250', '12/10/2026', '3', '2', '2', '1', '2')
        ledger('5', 'ap diana palur', 'RANDU 135', '05/10/2026, 31/10/2026', '2', '4', '', '2', '4')
        ledger('6', 'ap diana palur', 'BILBERRY 30', '12/10/2026', '1', '1', '1', '', '1')
        ledger('7', 'ap lain palur', 'LIAR 250', '12/10/2026', '1', '1', '1', '', '1')
        call_command('import_arbain_masters', period='2026-10', apply=True, stdout=StringIO())

    def run_import(self, **options):
        out = StringIO()
        call_command('import_arbain_consignment', period='2026-10', stdout=out, **options)
        return out.getvalue()

    def test_dry_run_saves_nothing_and_reports_skipped_rows(self):
        output = self.run_import(schedule_next=True)
        self.assertIn('Simulasi', output)
        self.assertIn('Dilewati 1 baris: outlet tidak cocok', output)
        self.assertIn('Dilewati 1 baris: produk tidak ada di katalog', output)
        self.assertFalse(Activity.objects.exists())
        self.assertFalse(ConsignmentStock.objects.exists())

    def test_apply_records_source_quantities_once(self):
        self.run_import(apply=True, schedule_next=True)
        self.run_import(apply=True, schedule_next=True)
        customer = Customer.objects.get()
        self.assertTrue(customer.source_pending)
        done = Activity.objects.filter(status='DONE').order_by('scheduled_date')
        self.assertEqual([a.scheduled_date for a in done], [date(2026, 10, 12), date(2026, 10, 31)])
        self.assertEqual(done[0].created_at, done[0].completed_at)
        entry = ConsignmentVisitEntry.objects.get(product__name='MADU HUTAN LIAR 250 ML')
        self.assertEqual((entry.previous_stock, entry.sold_quantity, entry.remaining_stock, entry.returned_quantity,
                          entry.added_quantity, entry.closing_stock), (3, 1, 2, 2, 2, 2))
        self.assertEqual(entry.gross_rupiah, 0)
        stock = ConsignmentStock.objects.get(product__name='MADU RANDU 135 ML')
        self.assertEqual((stock.quantity_on_display, stock.total_placed, stock.total_sold, stock.last_checked_date),
                         (4, 6, 2, date(2026, 10, 31)))
        planned = Activity.objects.get(status='PLANNED')
        self.assertEqual(planned.scheduled_date, date(2026, 11, 30))
        self.client.force_login(self.manager)
        data = self.client.get(f'/customers/{customer.pk}/', HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertEqual(data['consignment']['total_on_display'], '6')
        self.assertEqual(self.client.get('/', HTTP_X_ONEFLOW_PAGE='1').status_code, 200)
