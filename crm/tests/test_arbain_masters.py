from datetime import date
from io import StringIO
from uuid import uuid4

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from crm.errors import BusinessError
from crm.models import CompanyReport, CompanyReportRow, Customer, Order, Product, StockMovement
from crm.services.inventory import receive_stock, reconcile_stock
from crm.tests.factories import make_user


@override_settings(ONEFLOW_DEMO=False, ONEFLOW_COMPANY_ARCHIVE=True)
class ArbainMastersTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.manager = make_user('arbain_admin', 'MANAGER')
        source = CompanyReport.objects.create(period=date(2026, 10, 1), path='reports.pdf', checksum='c' * 64, content=b'fixture')
        for i, (sales, location, day) in enumerate([('Endri', 'Solo', 1), ('Endri', 'Solo', 3), ('Monic', 'Solo', 1)], 1):
            CompanyReportRow.objects.create(report=source, page=1, source_row=str(i), kind='visits',
                sales=sales, outlet='Outlet Laporan', observed_date=date(2026, 10, day), details={'Alamat': location})
        for i, sales in enumerate(['Endri', 'Monic'], 4):
            CompanyReportRow.objects.create(report=source, page=2, source_row=str(i), kind='sales',
                sales=sales, product='PRODUK LAPORAN 250 ML', quantity=15, sold=6, returned=9)

    def import_masters(self, apply=True):
        call_command('import_arbain_masters', period='2026-10', apply=apply, stdout=StringIO())

    def test_import_uses_source_records_without_inventing_stock_accounts_or_outlet_identity(self):
        self.import_masters(apply=False)
        self.assertFalse(Product.objects.exists())
        self.import_masters()
        self.import_masters()
        self.assertEqual(Customer.objects.count(), 2)
        self.assertEqual(Product.objects.count(), 1)
        self.assertFalse(Customer.objects.filter(is_active=True).exists())
        self.assertFalse(Order.objects.exists())
        self.assertFalse(StockMovement.objects.exists())
        self.assertFalse(User.objects.get(username='endri').has_usable_password())
        product = Product.objects.get()
        self.assertIsNone(product.price_rupiah)
        self.client.force_login(self.manager)
        payload = self.client.get('/stock/?filter=unverified', HTTP_X_ONEFLOW_PAGE='1').json()['data']['products']
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]['stock_state'], 'unverified')
        customer = Customer.objects.get(owner__username='endri')
        data = self.client.get(f'/customers/{customer.pk}/', HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertEqual(len(data['source_visits']), 2)
        self.assertNotIn('consignment_form_default', data)
        with self.assertRaises(CommandError):
            call_command('seed_demo', stdout=StringIO())

    def test_verified_masters_can_enter_normal_workflow_only_after_opening_count(self):
        self.import_masters()
        self.client.force_login(self.manager)
        customer = Customer.objects.get(owner__username='endri')
        result = self.client.post(f'/customers/{customer.pk}/verify/', {
            'code': 'OUTLET-FIXTURE', 'name': customer.name, 'owner': customer.owner_id,
            'address': customer.address, 'outlet_type': 'APOTEK', 'discount_percent': 0, 'is_active': 'on',
        })
        self.assertEqual(result.status_code, 302)
        customer.refresh_from_db()
        self.assertFalse(customer.source_pending)
        self.assertTrue(customer.is_active)

        product = Product.objects.get()
        values = {'name': product.name, 'sku': 'ACTUAL-FIXTURE', 'unit': 'botol', 'price_rupiah': 20000, 'min_stock': 0}
        url = f'/products/{product.id}/edit/'
        self.assertEqual(self.client.post(url, {**values, 'is_active': 'on'}).status_code, 400)
        self.assertEqual(self.client.post(url, values).status_code, 302)
        with self.assertRaises(BusinessError):
            receive_stock(self.manager, product.pk, 5, 'Opname', uuid4())
        with self.assertRaises(BusinessError):
            reconcile_stock(self.manager, product.pk, 5, 'Opname', uuid4())
        receive_stock(self.manager, product.pk, 5, 'Opname', uuid4(), batch_code='FIXTURE', received_date=date(2026, 10, 1), expiry_date=date(2027, 10, 1))
        reconcile_stock(self.manager, product.pk, 5, 'Hasil hitung lengkap', uuid4())
        self.assertEqual(self.client.post(url, {**values, 'is_active': 'on'}).status_code, 302)
        self.import_masters()
        product.refresh_from_db()
        self.assertEqual(product.sku, 'ACTUAL-FIXTURE')
        self.assertTrue(product.is_active)
        self.assertFalse(product.opening_stock_pending)
        self.assertEqual(Product.objects.count(), 1)
