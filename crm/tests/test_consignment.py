from datetime import timedelta
from uuid import uuid4

from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.test import TestCase
from django.utils import timezone

from crm.errors import BusinessError
from crm.models import Activity, ConsignmentStock, ProductCarryDirective, RawMaterial
from crm.services.consignment import (
    pharmacy_consignment_overview,
    product_traction_analysis,
    raw_material_alerts,
    record_consignment_visit,
    sales_attendance_recap,
    save_carry_directive,
    save_raw_material,
)
from crm.services.inventory import receive_stock
from crm.tests.factories import make_customer, make_product, make_user


class ConsignmentAndAttendanceTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.manager = make_user('manajer_test', 'MANAGER')
        self.warehouse = make_user('gudang_test', 'WAREHOUSE')
        self.sales_a = make_user('sales_a', 'SALES')
        self.sales_b = make_user('sales_b', 'SALES')

        self.apotek_a1 = make_customer(self.sales_a, code='APT001')
        self.apotek_a2 = make_customer(self.sales_a, code='APT002')
        self.apotek_b1 = make_customer(self.sales_b, code='APT003')

        self.fast_product = make_product('FAST01', price_rupiah=50000, on_hand=0)
        self.slow_product = make_product('SLOW01', price_rupiah=35000, on_hand=0)
        receive_stock(self.warehouse, self.fast_product.id, 100, 'Stok awal fast', uuid4())
        receive_stock(self.warehouse, self.slow_product.id, 50, 'Stok awal slow', uuid4())

        self.raw_honey = RawMaterial.objects.create(
            code='RM-HONEY',
            name='Madu Mentah Murni',
            unit='kg',
            on_hand=500,
            min_threshold=300,
            fast_moving_threshold=1000,
            updated_by=self.warehouse,
        )
        self.raw_honey.products.add(self.fast_product)

    def test_consignment_lifecycle_updates_pharmacy_and_warehouse_stock(self):
        # 1. Initial placement of 12 bottles at Apotek A1
        entry1 = record_consignment_visit(
            self.sales_a,
            self.apotek_a1.id,
            self.fast_product.id,
            sold_quantity=0,
            remaining_stock=0,
            added_quantity=12,
            returned_quantity=0,
            visit_date=self.today - timedelta(days=1),
            note='Titipan perdana 12 botol',
        )
        self.assertEqual(entry1.closing_stock, 12)
        self.fast_product.balance.refresh_from_db()
        self.assertEqual(self.fast_product.balance.on_hand, 88)

        # 2. Next visit: 9 sold, 3 remaining, top-up 10 new bottles -> closing 13
        entry2 = record_consignment_visit(
            self.sales_a,
            self.apotek_a1.id,
            self.fast_product.id,
            sold_quantity=9,
            remaining_stock=3,
            added_quantity=10,
            returned_quantity=0,
            visit_date=self.today,
            note='Laku keras 9 botol, tambah 10 botol',
        )
        self.assertEqual(entry2.closing_stock, 13)
        stock = ConsignmentStock.objects.get(customer=self.apotek_a1, product=self.fast_product)
        self.assertEqual((stock.quantity_on_display, stock.total_placed, stock.total_sold), (13, 22, 9))
        self.fast_product.balance.refresh_from_db()
        self.assertEqual(self.fast_product.balance.on_hand, 78)
        self.assertTrue(Activity.objects.filter(customer=self.apotek_a1, status='DONE', kind='VISIT').exists())

    def test_sales_isolation_prevents_cross_sales_input_and_attendance_leak(self):
        # Sales A cannot record consignment on Sales B's pharmacy
        with self.assertRaises(Http404):
            record_consignment_visit(
                self.sales_a,
                self.apotek_b1.id,
                self.fast_product.id,
                sold_quantity=0,
                remaining_stock=0,
                added_quantity=5,
            )

        record_consignment_visit(
            self.sales_a,
            self.apotek_a1.id,
            self.fast_product.id,
            sold_quantity=0,
            remaining_stock=0,
            added_quantity=6,
            visit_date=self.today,
        )
        record_consignment_visit(
            self.sales_b,
            self.apotek_b1.id,
            self.fast_product.id,
            sold_quantity=0,
            remaining_stock=0,
            added_quantity=8,
            visit_date=self.today,
        )

        recap_a = sales_attendance_recap(self.sales_a, self.today)
        self.assertEqual(len(recap_a), 1)
        self.assertEqual(recap_a[0]['sales_id'], str(self.sales_a.pk))
        self.assertEqual(recap_a[0]['today_count'], 1)
        self.assertIn('Pelanggan APT001', recap_a[0]['today_names'])

        recap_mgr = sales_attendance_recap(self.manager, self.today)
        self.assertEqual(len(recap_mgr), 2)

        outlets_a = pharmacy_consignment_overview(self.sales_a)
        self.assertEqual([o['code'] for o in outlets_a], ['APT001'])

    def test_slow_moving_detection_and_manager_stop_directive(self):
        # Place slow product in 2 outlets with 0 sales
        record_consignment_visit(
            self.sales_a, self.apotek_a1.id, self.slow_product.id, 0, 0, added_quantity=6, visit_date=self.today - timedelta(days=5)
        )
        record_consignment_visit(
            self.sales_b, self.apotek_b1.id, self.slow_product.id, 0, 0, added_quantity=6, visit_date=self.today - timedelta(days=5)
        )
        traction = {r['sku']: r for r in product_traction_analysis(self.today)}
        self.assertEqual(traction['SLOW01']['movement'], 'DEAD')

        # Manager sets STOP directive with FAST01 as substitute
        save_carry_directive(
            self.manager,
            self.slow_product.id,
            ProductCarryDirective.Directive.STOP,
            substitute_product_id=self.fast_product.id,
            reason='Tidak laku di hampir seluruh apotek; ganti bawa Madu Hutan Laris.',
        )

        # Sales is blocked from adding new consignment stock of SLOW01
        with self.assertRaises(BusinessError) as caught:
            record_consignment_visit(
                self.sales_a,
                self.apotek_a2.id,
                self.slow_product.id,
                sold_quantity=0,
                remaining_stock=0,
                added_quantity=4,
                visit_date=self.today,
            )
        self.assertEqual(caught.exception.code, 'DIRECTIVE_STOP')
        self.assertIn('Produk FAST01', caught.exception.message)

    def test_raw_material_early_warning_alarm_scales_with_fast_moving_product(self):
        # Make FAST01 fast-moving (sold >= 12 with >= 50% sell-through)
        record_consignment_visit(
            self.sales_a, self.apotek_a1.id, self.fast_product.id, 0, 0, added_quantity=20, visit_date=self.today - timedelta(days=3)
        )
        record_consignment_visit(
            self.sales_a, self.apotek_a1.id, self.fast_product.id, sold_quantity=15, remaining_stock=5, added_quantity=0, visit_date=self.today
        )

        alerts = raw_material_alerts(self.today)
        honey_alert = next(a for a in alerts if a['code'] == 'RM-HONEY')
        self.assertTrue(honey_alert['is_fast_demand'])
        self.assertEqual(honey_alert['required_stock'], 1000)
        self.assertEqual(honey_alert['on_hand'], 500)
        self.assertEqual(honey_alert['severity'], 'CRITICAL')

        # Sales cannot edit raw material stock
        with self.assertRaises(PermissionDenied):
            save_raw_material(self.sales_a, self.raw_honey.id, 1200, 300, 1000, 'Percobaan')

        # Warehouse updates stock to 1200 kg -> SAFE
        save_raw_material(self.warehouse, self.raw_honey.id, 1200, 300, 1000, 'Pasokan 1,2 ton tiba')
        honey_after = next(a for a in raw_material_alerts(self.today) if a['code'] == 'RM-HONEY')
        self.assertEqual(honey_after['severity'], 'SAFE')

    def test_qna_arb02_billing_threshold_partner_discount_and_6month_expiry_pull(self):
        # Set Apotek A1 as Apotek (16% discount) and Apotek A2 as Minimarket (20% discount)
        self.apotek_a1.outlet_type = 'APOTEK'
        self.apotek_a1.discount_percent = 16
        self.apotek_a1.save(update_fields=['outlet_type', 'discount_percent'])

        # Place 10 units with expiry 120 days from today (<= 180 days / 6 months)
        near_exp = self.today + timedelta(days=120)
        record_consignment_visit(
            self.sales_a,
            self.apotek_a1.id,
            self.fast_product.id,
            sold_quantity=0,
            remaining_stock=0,
            added_quantity=10,
            nearest_expiry_date=near_exp,
            visit_date=self.today - timedelta(days=2),
        )

        # Visit 1: Only 2 items sold (<= 2 items) -> NOT_BILLED, net_billed_rupiah = 0
        e_small = record_consignment_visit(
            self.sales_a,
            self.apotek_a1.id,
            self.fast_product.id,
            sold_quantity=2,
            remaining_stock=8,
            added_quantity=0,
            visit_date=self.today - timedelta(days=1),
        )
        self.assertEqual(e_small.billing_status, 'NOT_BILLED')
        self.assertEqual(e_small.net_billed_rupiah, 0)

        # Visit 2: 5 items sold (> 2 items) -> BILLED_PAID with 16% discount (5 * 50000 = 250000 -> net 210000)
        e_billed = record_consignment_visit(
            self.sales_a,
            self.apotek_a1.id,
            self.fast_product.id,
            sold_quantity=5,
            remaining_stock=3,
            added_quantity=0,
            returned_quantity=1,
            return_reason='NEAR_EXPIRY',
            billing_status='DEFERRED',
            visit_date=self.today,
        )
        self.assertEqual(e_billed.billing_status, 'DEFERRED')
        self.assertEqual(e_billed.gross_rupiah, 250000)
        self.assertEqual(e_billed.discount_percent, 16)
        self.assertEqual(e_billed.net_billed_rupiah, 210000)
        self.assertEqual(e_billed.return_reason, 'NEAR_EXPIRY')

        overview = pharmacy_consignment_overview(self.sales_a, customer_id=self.apotek_a1.id, as_of=self.today)[0]
        self.assertEqual(overview['deferred_billing_rupiah'], 210000)
        self.assertTrue(overview['items'][0]['is_near_expiry'])
