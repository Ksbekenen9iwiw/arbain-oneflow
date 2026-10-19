from datetime import date, datetime, time, timedelta
from uuid import uuid4

from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.test import TestCase, override_settings
from django.utils import timezone

from crm.errors import BusinessError
from crm.models import Order, SampleAllocation, SampleRequest, SampleRequestLine, StockMovement
from crm.selectors import dashboard_metrics
from crm.services.inventory import receive_stock
from crm.services.samples import (
    cancel_request,
    create_draft,
    decide,
    mark_received,
    recommend,
    record_followup,
    save_policy,
    ship_request,
    submit_request,
)
from crm.tests.factories import make_customer, make_product, make_shipped_order, make_user


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class SampleRequestTests(TestCase):
    def setUp(self):
        self.sales = make_user('sales', 'SALES')
        self.other = make_user('other', 'SALES')
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.manager = make_user('manager', 'MANAGER')
        self.customer = make_customer(self.sales)
        self.other_customer = make_customer(self.other, 'CUS002')
        self.product = make_product(on_hand=0)
        self.today = timezone.localdate()
        receive_stock(
            self.warehouse,
            self.product.id,
            20,
            'Batch uji sampel',
            uuid4(),
            batch_code='LOT-SAMPLE',
            received_date=self.today,
            expiry_date=self.today + timedelta(days=90),
        )

    def draft(self, customer=None, quantity=8, **fields):
        defaults = {
            'purpose': 'Uji kesesuaian produk',
            'customer_need': 'Mencari produk herbal',
            'potential_orders': 'Potensi 20 unit per bulan',
            'business_profile': 'Toko herbal aktif',
            'notes': 'Data simulasi pengajuan sampel',
        }
        defaults.update(fields)
        return create_draft(
            self.sales,
            (customer or self.customer).id,
            [{'product_id': self.product.id, 'quantity': quantity}],
            **defaults,
        )

    def historical_sample(self, days_ago=30, order=None, outcome=SampleRequest.Outcome.NO_RESPONSE):
        request = SampleRequest.objects.create(
            customer=self.customer,
            sales=self.sales,
            status=SampleRequest.Status.APPROVED,
            fulfillment_status=SampleRequest.FulfillmentStatus.RECEIVED,
            outcome=outcome,
            purpose='Riwayat uji',
            customer_need='Riwayat kebutuhan',
            potential_orders='Riwayat potensi',
            received_at=timezone.now() - timedelta(days=days_ago),
            order=order,
        )
        SampleRequestLine.objects.create(request=request, product=self.product, quantity=1)
        return request

    def configure(self, threshold=2, period=180, evaluation=14):
        return save_policy(self.manager, threshold, period, evaluation)

    def make_existing_customer(self):
        return make_shipped_order(
            self.sales,
            self.customer,
            self.product,
            2,
            self.today - timedelta(days=60),
        )

    def balance(self):
        self.product.balance.refresh_from_db()
        balance = self.product.balance
        return balance.on_hand, balance.reserved, balance.available

    def test_new_customer_can_submit_with_complete_profile(self):
        self.configure()
        request = self.draft()
        submit_request(self.sales, request.id)
        request.refresh_from_db()
        self.assertEqual(request.status, SampleRequest.Status.SUBMITTED)
        self.assertEqual(recommend(request)['result'], SampleRequest.Recommendation.REVIEW)
        self.assertIn('Belum ada riwayat pelanggan', recommend(request)['reasons'][0])

    def test_new_customer_missing_profile_stays_draft(self):
        request = self.draft(business_profile='')
        with self.assertRaises(BusinessError) as caught:
            submit_request(self.sales, request.id)
        self.assertEqual(caught.exception.code, 'INVALID_INPUT')
        request.refresh_from_db()
        self.assertEqual(request.status, SampleRequest.Status.DRAFT)

    def test_unconfigured_policy_requires_manual_review(self):
        request = self.draft()
        result = recommend(request)
        self.assertEqual(result['result'], SampleRequest.Recommendation.REVIEW)
        self.assertIn('Kebijakan belum dikonfigurasi', result['reasons'][0])
        self.assertEqual(result['policy']['repeat_threshold'], None)

    def test_repeated_received_samples_without_result_recommend_rejection(self):
        self.make_existing_customer()
        self.configure(threshold=2)
        self.historical_sample(days_ago=40)
        self.historical_sample(days_ago=70)
        request = self.draft()
        result = recommend(request)
        self.assertEqual(result['result'], SampleRequest.Recommendation.REJECT)
        self.assertEqual(result['evidence']['without_result_count'], 2)
        self.assertEqual(result['policy']['review_period_days'], 180)

    def test_sample_in_evaluation_window_is_not_failure(self):
        self.make_existing_customer()
        self.configure(threshold=1, evaluation=14)
        self.historical_sample(days_ago=2)
        result = recommend(self.draft())
        self.assertEqual(result['result'], SampleRequest.Recommendation.REVIEW)
        self.assertEqual(result['evidence']['in_evaluation_count'], 1)
        self.assertEqual(result['evidence']['without_result_count'], 0)

    def test_rejected_cancelled_and_not_received_do_not_count(self):
        self.make_existing_customer()
        self.configure(threshold=1)
        for status in [SampleRequest.Status.REJECTED, SampleRequest.Status.CANCELLED, SampleRequest.Status.APPROVED]:
            old = SampleRequest.objects.create(customer=self.customer, sales=self.sales, status=status)
            SampleRequestLine.objects.create(request=old, product=self.product, quantity=1)
        result = recommend(self.draft())
        self.assertEqual(result['evidence']['received_count'], 0)
        self.assertEqual(result['result'], SampleRequest.Recommendation.APPROVE)

    def test_linked_purchase_is_positive_evidence_even_inside_evaluation_window(self):
        self.configure(threshold=1, evaluation=30)
        order = self.make_existing_customer()
        self.historical_sample(days_ago=2, order=order, outcome=SampleRequest.Outcome.PURCHASED)
        result = recommend(self.draft())
        self.assertEqual(result['result'], SampleRequest.Recommendation.APPROVE)
        self.assertEqual(result['evidence']['linked_purchase_count'], 1)

    def test_manager_override_requires_reason_and_snapshot_is_saved(self):
        self.make_existing_customer()
        self.configure(threshold=1)
        self.historical_sample(days_ago=40)
        request = self.draft()
        submit_request(self.sales, request.id)
        with self.assertRaises(BusinessError):
            decide(self.manager, request.id, SampleRequest.Status.APPROVED, '')
        decide(self.manager, request.id, SampleRequest.Status.APPROVED, 'Potensi pesanan sudah dikonfirmasi manual')
        request.refresh_from_db()
        self.assertEqual(request.status, SampleRequest.Status.APPROVED)
        self.assertEqual(request.recommendation_at_decision, SampleRequest.Recommendation.REJECT)
        self.assertEqual(request.policy_snapshot['repeat_threshold'], 1)
        self.assertTrue(request.evidence_snapshot['reasons'])
        self.assertEqual(self.balance(), (20, 8, 12))

    def test_approval_cancel_and_shipping_keep_stock_consistent_and_idempotent(self):
        self.make_existing_customer()
        self.configure()
        first = self.draft()
        submit_request(self.sales, first.id)
        decide(self.manager, first.id, SampleRequest.Status.APPROVED)
        self.assertEqual(self.balance(), (20, 8, 12))
        self.assertEqual(SampleAllocation.objects.filter(line__request=first).count(), 1)
        cancel_request(self.sales, first.id, 'Pelanggan menunda evaluasi')
        self.assertEqual(self.balance(), (20, 0, 20))

        second = self.draft()
        submit_request(self.sales, second.id)
        decide(self.manager, second.id, SampleRequest.Status.APPROVED)
        revenue_before = dashboard_metrics(self.manager, self.today)['shipped_value_rupiah']
        ship_request(self.warehouse, second.id)
        ship_request(self.warehouse, second.id)
        self.assertEqual(self.balance(), (12, 0, 12))
        self.assertEqual(StockMovement.objects.filter(kind=StockMovement.Kind.SAMPLE, sample_request=second).count(), 1)
        self.assertEqual(dashboard_metrics(self.manager, self.today)['shipped_value_rupiah'], revenue_before)

    def test_received_followup_links_purchase_explicitly(self):
        self.configure()
        order = self.make_existing_customer()
        request = self.draft()
        submit_request(self.sales, request.id)
        decide(self.manager, request.id, SampleRequest.Status.APPROVED)
        ship_request(self.warehouse, request.id)
        mark_received(self.sales, request.id)
        record_followup(
            self.sales,
            request.id,
            'Pelanggan memesan setelah mencoba sampel',
            SampleRequest.Outcome.PURCHASED,
            'Pesanan dikonfirmasi lewat telepon',
            order.id,
        )
        request.refresh_from_db()
        self.assertEqual((request.outcome, request.order_id), (SampleRequest.Outcome.PURCHASED, order.id))

    def test_other_sales_and_warehouse_cannot_use_sales_operations(self):
        request = self.draft()
        # Same two layers as orders: role gate raises PermissionDenied,
        # in-role but out-of-scope raises Http404.
        with self.assertRaises(Http404):
            submit_request(self.other, request.id)
        with self.assertRaises(PermissionDenied):
            submit_request(self.warehouse, request.id)

    def test_json_contract_hides_allocations_from_sales_but_shows_warehouse(self):
        self.make_existing_customer()
        self.configure()
        request = self.draft()
        submit_request(self.sales, request.id)
        decide(self.manager, request.id, SampleRequest.Status.APPROVED)
        self.client.force_login(self.sales)
        sales_data = self.client.get(f'/samples/{request.id}/', HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertNotIn('allocations', sales_data['sample']['lines'][0])
        self.client.force_login(self.warehouse)
        warehouse_data = self.client.get(f'/samples/{request.id}/', HTTP_X_ONEFLOW_PAGE='1').json()['data']
        self.assertEqual(warehouse_data['sample']['lines'][0]['allocations'][0]['batch_code'], 'LOT-SAMPLE')

    def test_sample_routes_follow_role_scope(self):
        request = self.draft()
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(f'/samples/{request.id}/').status_code, 404)
        self.client.force_login(self.warehouse)
        self.assertEqual(self.client.get(f'/samples/{request.id}/').status_code, 404)
        self.client.force_login(self.manager)
        self.assertEqual(self.client.get(f'/samples/{request.id}/').status_code, 200)
