from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from crm.models import Activity, Order, SampleRequest, SampleRequestLine, StockMovement
from crm.tests.factories import make_user, make_customer, make_product, make_order


class DesktopWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.sales = make_user('sales-desktop', 'SALES')
        cls.other = make_user('other-desktop', 'SALES')
        cls.warehouse = make_user('warehouse-desktop', 'WAREHOUSE')
        cls.manager = make_user('manager-desktop', 'MANAGER')
        cls.customer = make_customer(cls.sales)
        cls.foreign = make_customer(cls.other, 'CUS002')
        cls.product = make_product(on_hand=10)
        cls.low = make_product('LOW', on_hand=0)
        cls.order = make_order(cls.sales, cls.customer, cls.product, 2)
        cls.other_order = make_order(cls.other, cls.foreign, cls.product, 1)
        cls.sample = SampleRequest.objects.create(customer=cls.customer, sales=cls.sales, status='APPROVED')
        SampleRequestLine.objects.create(request=cls.sample, product=cls.product, quantity=1)

    def setUp(self):
        self.client.force_login(self.sales)

    def test_recommendation_prefill_does_not_reserve_or_create(self):
        response = self.client.get('/orders/new/', {'customer': self.customer.id, 'product': self.product.id, 'quantity': 8})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context['formset'].forms[0].initial, {'product': self.product.id, 'quantity': 8})
        self.assertEqual(Order.objects.count(), 2)
        self.product.balance.refresh_from_db()
        self.assertEqual(self.product.balance.reserved, 0)
        self.assertFalse(StockMovement.objects.exists())

    def test_prefill_rejects_foreign_customer_and_malformed_quantities(self):
        for customer, quantity in [(self.foreign.id, '8'), (self.customer.id, '-1'), (self.customer.id, 'oops'), (self.customer.id, '9' * 80)]:
            response = self.client.get('/orders/new/', {'customer': customer, 'product': self.product.id, 'quantity': quantity})
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.context['suggested'])
        self.assertEqual(self.client.get('/orders/new/', {'customer': 'oops'}).status_code, 200)

    def test_posted_values_override_recommendation_and_price_is_server_owned(self):
        response = self.client.post(f'/orders/new/?customer={self.customer.id}&product={self.product.id}&quantity=8', {
            'customer': self.customer.id, 'lines-TOTAL_FORMS': 1, 'lines-INITIAL_FORMS': 1,
            'lines-0-product': self.product.id, 'lines-0-quantity': 3, 'price': 1,
        })
        self.assertEqual(response.status_code, 302)
        created = Order.objects.latest('pk')
        self.assertEqual(created.lines.get().quantity, 3)
        self.assertEqual(created.total_rupiah, 150000)

    def test_invalid_order_keeps_lines_for_correction(self):
        response = self.client.post('/orders/new/', {'customer': self.customer.id, 'lines-TOTAL_FORMS': 1, 'lines-INITIAL_FORMS': 0, 'lines-0-product': self.product.id, 'lines-0-quantity': '-2'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.context['formset'].forms[0]['quantity'].value(), '-2')
        self.assertEqual(Order.objects.count(), 2)

    def test_search_cannot_escape_sales_scope(self):
        response = self.client.get('/orders/', {'q': f'OF-{self.other_order.id:04d}'})
        self.assertEqual(list(response.context['orders']), [])
        response = self.client.get('/orders/', {'q': f'OF-{self.order.id:04d}'})
        self.assertEqual(list(response.context['orders']), [self.order])

    def test_low_stock_filter_and_search_use_real_balances(self):
        response = self.client.get('/stock/', {'filter': 'low', 'q': 'LOW'})
        self.assertEqual(response.context['products'], [self.low])
        self.assertContains(response, 'Stok habis')
        self.assertEqual(response.context['stock_summary']['product_count'], 2)

    def test_agenda_includes_overdue_visits_without_exposing_other_sales(self):
        due = timezone.localdate() - timedelta(days=2)
        own = Activity.objects.create(customer=self.customer, sales=self.sales, scheduled_date=due)
        Activity.objects.create(customer=self.foreign, sales=self.other, scheduled_date=due)
        response = self.client.get('/')
        self.assertEqual([activity.pk for activity in response.context['agenda']], [own.pk])
        self.assertContains(response, f'/activities/{own.pk}/complete/')

    def test_activity_inherits_latest_customer_stage(self):
        Activity.objects.create(customer=self.customer, sales=self.sales, stage='INTERESTED', status='DONE', result='Tertarik')
        response = self.client.get(f'/customers/{self.customer.id}/activities/new/')
        self.assertEqual(response.context['form'].initial['stage'], 'INTERESTED')

    def test_desktop_screen_templates_render_for_each_role(self):
        shared = ['/', '/stock/', '/orders/', f'/orders/{self.order.id}/', '/samples/', f'/samples/{self.sample.id}/']
        editor = ['/products/new/', f'/products/{self.product.id}/edit/', f'/stock/{self.product.id}/receive/', f'/stock/{self.product.id}/reconcile/']
        customer = ['/customers/', '/customers/new/', f'/customers/{self.customer.id}/', f'/customers/{self.customer.id}/activities/new/', '/orders/new/', '/samples/new/']
        manager_only = ['/samples/policy/']
        warehouse = ['/', '/stock/', '/orders/', '/samples/', f'/samples/{self.sample.id}/']
        for actor, paths in [(self.sales, shared + customer), (self.manager, shared + customer + editor + manager_only), (self.warehouse, warehouse + editor)]:
            self.client.force_login(actor)
            for path in paths:
                with self.subTest(role=actor.username, path=path):
                    self.assertEqual(self.client.get(path).status_code, 200)
