from datetime import date

from django.test import TestCase

from crm.models import Activity, ConsignmentStock
from crm.services.visit_plan import attention, outlet_advice, visit_plan
from crm.tests.factories import make_customer, make_product, make_user


class VisitPlanTests(TestCase):
    as_of = date(2026, 11, 20)

    def setUp(self):
        self.sales, self.other = make_user('sales', 'SALES'), make_user('other', 'SALES')
        self.manager, self.warehouse = make_user('manager', 'MANAGER'), make_user('warehouse', 'WAREHOUSE')
        self.products = [make_product(f'P{n}') for n in range(4)]

    def outlet(self, owner, code, area, stock, checked=date(2026, 11, 10)):
        customer = make_customer(owner, code)
        customer.address = area
        customer.save(update_fields=['address'])
        for index, (sold, display) in stock.items():
            ConsignmentStock.objects.create(customer=customer, product=self.products[index], total_sold=sold,
                                            total_placed=sold + display, quantity_on_display=display, last_checked_date=checked)
        return customer

    def test_plan_ranks_by_reason_and_lists_what_to_bring(self):
        empty = self.outlet(self.sales, 'A', 'solo', {0: (4, 0), 1: (2, 5)})
        late = self.outlet(self.sales, 'B', 'sragen', {0: (1, 6)})
        self.outlet(self.sales, 'C', 'solo', {0: (1, 6)})
        self.outlet(self.other, 'D', 'solo', {0: (9, 0)})
        activity = Activity.objects.create(customer=late, sales=self.sales, status='PLANNED', scheduled_date=date(2026, 11, 17))
        plan = visit_plan(self.sales, self.as_of)
        self.assertEqual([item['customer_id'] for item in plan], [str(late.pk), str(empty.pk)])
        self.assertEqual(plan[0]['reasons'], [{'kind': 'LATE', 'value': 3}])
        self.assertEqual(plan[0]['activity_id'], str(activity.pk))
        self.assertEqual(plan[1]['reasons'], [{'kind': 'EMPTY', 'value': 1}])
        self.assertEqual([(item['name'], item['quantity']) for item in plan[1]['bring']], [('Produk P0', 4)])

    def test_plan_keeps_outlets_of_one_area_together(self):
        first = self.outlet(self.sales, 'A', 'solo', {0: (3, 0), 1: (3, 0), 2: (3, 0)})
        far = self.outlet(self.sales, 'B', 'sragen', {0: (3, 0), 1: (3, 0)})
        near = self.outlet(self.sales, 'C', 'solo', {0: (3, 0)})
        plan = visit_plan(self.sales, self.as_of)
        self.assertEqual([item['customer_id'] for item in plan], [str(first.pk), str(near.pk), str(far.pk)])
        self.assertEqual(plan[0]['area'], 'Solo')

    def test_unchecked_outlet_is_suggested_after_a_month(self):
        stale = self.outlet(self.sales, 'A', 'solo', {0: (1, 6)}, checked=date(2026, 10, 1))
        plan = visit_plan(self.sales, self.as_of)
        self.assertEqual([item['customer_id'] for item in plan], [str(stale.pk)])
        self.assertEqual(plan[0]['reasons'], [{'kind': 'UNCHECKED', 'value': 50}])

    def test_recommendation_comes_from_similar_outlets_and_skips_carried_products(self):
        mine = self.outlet(self.sales, 'A', 'solo', {0: (5, 2), 1: (3, 2), 3: (0, 8)})
        self.outlet(self.other, 'B', 'solo', {0: (4, 1), 1: (2, 1), 2: (6, 1)})
        self.outlet(self.other, 'C', 'solo', {3: (7, 1)})
        advice = outlet_advice(self.sales, mine.pk)
        self.assertEqual([(item['name'], item['sellers']) for item in advice['try']], [('Produk P2', 1)])
        self.assertEqual(advice['pull'], [{'product_id': str(self.products[3].pk), 'name': 'Produk P3', 'on_display': 8}])

    def test_roles_only_see_what_they_may(self):
        mine = self.outlet(self.sales, 'A', 'solo', {0: (4, 0)})
        theirs = self.outlet(self.other, 'B', 'solo', {0: (4, 0)})
        self.assertIsNone(outlet_advice(self.sales, theirs.pk))
        self.assertIsNone(outlet_advice(self.warehouse, mine.pk))
        self.assertEqual(visit_plan(self.warehouse, self.as_of), [])
        self.assertIsNone(attention(self.sales))
        self.assertEqual(len(visit_plan(self.manager, self.as_of)), 2)
        self.assertEqual(len(visit_plan(self.manager, self.as_of, str(self.other.pk))), 1)

    def test_attention_lists_slowest_products_and_outlets(self):
        self.outlet(self.sales, 'A', 'solo', {0: (0, 30), 1: (20, 20)})
        slow = self.outlet(self.other, 'B', 'solo', {0: (1, 39), 1: (30, 10)})
        result = attention(self.manager)
        self.assertEqual([(item['name'], item['sell_through'], item['outlets']) for item in result['slow_products']],
                         [('Produk P0', 1, 2), ('Produk P1', 62, 2)])
        self.assertEqual(result['slow_outlets'][0]['customer_id'], str(self.outlet_id('A')))
        self.assertEqual((result['covered_outlets'], result['total_outlets']), (2, 2))
        only = attention(self.manager, str(self.other.pk))
        self.assertEqual([item['customer_id'] for item in only['slow_outlets']], [str(slow.pk)])

    def outlet_id(self, code):
        from crm.models import Customer
        return Customer.objects.get(code=code).pk

    def test_pages(self):
        self.outlet(self.sales, 'A', 'solo', {0: (4, 0)})
        headers = {'HTTP_X_ONEFLOW_PAGE': '1'}
        self.client.force_login(self.sales)
        self.assertEqual(len(self.client.get('/', **headers).json()['data']['visit_plan']), 1)
        self.assertEqual(self.client.get('/attention/').status_code, 403)
        self.client.force_login(self.manager)
        data = self.client.get('/attention/', **headers).json()
        self.assertEqual(data['screen'], 'attention')
        self.assertEqual(data['data']['covered_outlets'], '1')
        self.assertEqual(self.client.get('/attention/?sales=abc').status_code, 404)
