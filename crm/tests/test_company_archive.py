import hashlib
import json
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from crm.models import CompanyReport, CompanyReportRow, InventoryBalance, Order
from crm.tests.factories import make_user


@override_settings(ONEFLOW_COMPANY_ARCHIVE=True)
class CompanyArchiveTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.manager = make_user('manager_archive', 'MANAGER')
        cls.sales = make_user('sales_archive', 'SALES')
        cls.warehouse = make_user('warehouse_archive', 'WAREHOUSE')

    def create_package(self, folder):
        content = b'%PDF-1.4 solo test'
        (folder / 'r.pdf').write_bytes(content)
        manifest = folder / 'package.json'
        payload = {
            'period': '2026-10',
            'files': [{
                'path': 'r.pdf',
                'sha256': hashlib.sha256(content).hexdigest(),
                'rows': [
                    {'kind': 'sales', 'page': 1, 'source_row': '1.2.0', 'sales': 'Endri',
                     'product': 'Madu A', 'quantity': 10, 'returned': 6, 'sold': 4, 'details': {'No. sumber': '1'}},
                    {'kind': 'sales', 'page': 1, 'source_row': '2.2.0', 'sales': 'Monic',
                     'product': 'Madu B', 'quantity': 12, 'returned': 8, 'sold': 5, 'details': {'No. sumber': '1'},
                     'issue': 'Selisih angka sumber'},
                ],
            }],
        }
        manifest.write_text(json.dumps(payload))
        return manifest, payload

    def test_safe_retry_and_role_scope_for_both_records_and_source(self):
        with TemporaryDirectory() as temporary:
            folder = Path(temporary)
            manifest, _ = self.create_package(folder)
            def run(**options):
                call_command('import_company_archive', manifest, folder, stdout=StringIO(), **options)
            run()
            self.assertEqual(CompanyReport.objects.count(), 0)
            run(apply=True)
            run(apply=True)
        self.assertEqual(CompanyReport.objects.count(), 1)
        self.assertEqual(CompanyReportRow.objects.count(), 2)
        self.assertEqual(InventoryBalance.objects.count(), 0)
        self.assertEqual(Order.objects.count(), 0)
        source = f'/company-data/source/{CompanyReport.objects.get().pk}/'
        for viewer in (self.sales, self.warehouse):
            self.client.force_login(viewer)
            self.assertEqual(self.client.get('/company-data/', HTTP_X_ONEFLOW_PAGE='1').status_code, 403)
            self.assertEqual(self.client.get(source).status_code, 403)
        self.client.force_login(self.manager)
        data = self.client.get('/company-data/?tab=sales&review=1&sales=Monic&q=Madu', HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertEqual(data['summary']['sold'], '5')
        self.assertEqual(data['total'], '1')
        self.assertEqual(data['rows'][0]['source_url'], source + '#page=1')
        response = self.client.get(source)
        self.assertEqual(response.content, b'%PDF-1.4 solo test')
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertContains(self.client.get('/company-data/'), 'oneflow-page')
        with override_settings(ONEFLOW_COMPANY_ARCHIVE=False):
            self.assertEqual(self.client.get('/company-data/').status_code, 403)
            self.assertEqual(self.client.get(source).status_code, 403)

    def test_package_rolls_back_if_later_source_fails_validation(self):
        with TemporaryDirectory() as temporary:
            folder = Path(temporary)
            manifest, data = self.create_package(folder)
            (folder / 'changed.pdf').write_bytes(b'changed')
            data['files'].append({**data['files'][0], 'path': 'changed.pdf'})
            manifest.write_text(json.dumps(data))
            with self.assertRaises(CommandError):
                call_command('import_company_archive', manifest, folder, apply=True, stdout=StringIO())
        self.assertEqual(CompanyReport.objects.count(), 0)
