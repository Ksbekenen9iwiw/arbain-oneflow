from datetime import timedelta
from html.parser import HTMLParser

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from crm.models import Customer, Order, OrderLine
from crm.tests.factories import make_product, make_shipped_order, make_user


class PageElements(HTMLParser):
    def __init__(self, response):
        super().__init__()
        self.elements = []
        self.feed(response.content.decode())

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))

    def links(self):
        return [attrs['href'] for tag, attrs in self.elements if tag == 'a' and 'href' in attrs]


class FinalReviewRegressionTests(TestCase):
    def setUp(self):
        self.sales = make_user('sales', 'SALES')
        self.customer = Customer.objects.create(id=1000, code='CUS1000', name='Pelanggan Seribu', owner=self.sales)
        self.product = make_product(on_hand=10)
        self.client.force_login(self.sales)

    def assert_customer_selected(self, link):
        response = self.client.get(link)
        self.assertEqual(response.status_code, 200)
        selected = [attrs.get('value') for tag, attrs in PageElements(response).elements if tag == 'option' and 'selected' in attrs]
        self.assertIn(str(self.customer.id), selected)

    def test_customer_profile_draft_link_preserves_large_customer_id(self):
        response = self.client.get(reverse('customer_detail', args=[self.customer.id]))
        link = f"{reverse('order_create')}?customer={self.customer.id}"
        self.assertIn(link, PageElements(response).links())
        self.assert_customer_selected(link)

    def test_customer_history_link_opens_large_order_id(self):
        order = Order.objects.create(id=1000, customer=self.customer, sales=self.sales, total_rupiah=100000)
        OrderLine.objects.create(order=order, product=self.product, quantity=2, unit_price_rupiah=50000)
        response = self.client.get(reverse('customer_detail', args=[self.customer.id]))
        link = reverse('order_detail', args=[order.id])
        self.assertIn(link, PageElements(response).links())
        self.assertContains(self.client.get(link), 'OF-1000')

    def test_action_center_draft_link_preserves_large_customer_id(self):
        today = timezone.localdate()
        for days_ago in [42, 28, 14]:
            make_shipped_order(self.sales, self.customer, self.product, 2, today - timedelta(days=days_ago))
        response = self.client.get(reverse('today'))
        self.assertEqual(response.context['actions'][0].kind, 'REORDER')
        link = f"{reverse('order_create')}?customer={self.customer.id}&product={self.product.id}&quantity=2"
        self.assertIn(link, PageElements(response).links())
        self.assert_customer_selected(link)

    def test_deleted_order_row_stays_hidden_after_invalid_post(self):
        payload = {
            'customer': self.customer.id,
            'lines-TOTAL_FORMS': 2, 'lines-INITIAL_FORMS': 0,
            'lines-MIN_NUM_FORMS': 1, 'lines-MAX_NUM_FORMS': 50,
            'lines-0-product': self.product.id, 'lines-0-quantity': '1.5',
            'lines-1-product': self.product.id, 'lines-1-quantity': 2,
            'lines-1-DELETE': 'on',
        }
        response = self.client.post(reverse('order_create'), payload)
        self.assertEqual(response.status_code, 400)
        rows = [attrs for tag, attrs in PageElements(response).elements if tag == 'div' and attrs.get('class') == 'order-line']
        self.assertNotIn('hidden', rows[0])
        self.assertIn('hidden', rows[1])
        self.assertEqual(Order.objects.count(), 0)
        payload['lines-0-quantity'] = 3
        self.assertEqual(self.client.post(reverse('order_create'), payload).status_code, 302)
        line, = Order.objects.get().lines.all()
        self.assertEqual((line.product_id, line.quantity), (self.product.id, 3))
