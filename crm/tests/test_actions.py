import json
import os
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

from django.db import transaction
from django.test import Client, TestCase
from django.utils import timezone

from crm.models import Activity, Customer, OrderLine
from crm import models
from crm.errors import BusinessError
from django.http import Http404
from crm.services.inventory import receive_stock
from uuid import uuid4
from crm.services import actions
from crm.services.orders import confirm_order
from crm.tests.factories import make_customer, make_order, make_product, make_shipped_order, make_user


class ActionRuleTests(TestCase):
    def setUp(self):
        self.assertTrue(hasattr(actions, 'priority_score'), 'priority_score not implemented')
        self.sales = make_user('sales', 'SALES')
        self.customer = make_customer(self.sales)
        self.product = make_product(on_hand=10)

    def test_priority_scores_have_explicit_half_up(self):
        for inputs, expected in [((7, 100, 100), 100), ((7, 0, 0), 80), ((0, 100, 100), 20), ((3, 50, 100), 44)]:
            with self.subTest(inputs=inputs):
                self.assertEqual(actions.priority_score(*inputs), expected)

    def test_interval_half_up_and_reasons(self):
        for at in ['2026-01-01', '2026-01-30', '2026-03-01']:
            make_shipped_order(self.sales, self.customer, self.product, 8, at)
        candidate, = actions.compute_candidates(self.sales, date(2026, 3, 31))
        self.assertEqual(candidate.due_date, date(2026, 3, 31))
        self.assertEqual(candidate.reasons['interval_days'], 30)
        self.assertEqual(candidate.reasons['purchase_date_count'], 3)
        self.assertEqual(candidate.reasons['available_quantity'], 10)
        self.assertIn('2026-03-01', candidate.key)

    def test_two_dates_do_not_produce_reorder(self):
        for at in ['2026-01-01', '2026-03-01']:
            make_shipped_order(self.sales, self.customer, self.product, 8, at)
        self.assertEqual(actions.compute_candidates(self.sales, date(2026, 4, 1)), [])

    def test_warehouse_has_no_customer_candidates(self):
        warehouse = make_user('warehouse', 'WAREHOUSE')
        Activity.objects.create(customer=self.customer, sales=self.sales, kind='FOLLOWUP', followup_date=date(2026, 1, 1))
        self.assertEqual(actions.compute_candidates(warehouse, date(2026, 4, 1)), [])

    def test_value_window_is_ninety_inclusive_days(self):
        as_of = date(2026, 10, 11)
        make_shipped_order(self.sales, self.customer, self.product, 8, as_of - timedelta(days=90))
        make_shipped_order(self.sales, self.customer, self.product, 2, as_of - timedelta(days=89))
        make_shipped_order(self.sales, self.customer, self.product, 3, as_of)
        make_shipped_order(self.sales, self.customer, self.product, 100, as_of + timedelta(days=1))
        Activity.objects.create(customer=self.customer, sales=self.sales, kind='FOLLOWUP', followup_date=as_of)
        followup = next(c for c in actions.compute_candidates(self.sales, as_of) if c.kind == 'FOLLOWUP')
        self.assertEqual(followup.reasons['value_90_days_rupiah'], 250000)


def case_fixture(case):
    data = case['input']
    sales = make_user('case_sales', 'SALES')
    product = make_product(on_hand=data['on_hand'], price_rupiah=data['price_rupiah'])
    product.is_active = data['product_active']
    product.save()
    product.balance.reserved = data['reserved']
    product.balance.save()
    for row in data['customers']:
        customer = make_customer(sales, row['code'])
        customer.is_active = row.get('active', True)
        customer.save()
        for purchase in row.get('history', []):
            make_shipped_order(sales, customer, product, purchase['quantity'], purchase['at'])
        followup = row.get('followup')
        if followup:
            status = followup.get('status', 'PLANNED')
            Activity.objects.create(customer=customer, sales=sales, kind='FOLLOWUP', followup_date=date.fromisoformat(followup['due']), status=status, result='Sudah ditangani' if status == 'DONE' else '')
        if row.get('pending_quantity'):
            order = make_order(sales, customer, product, row['pending_quantity'])
            confirm_order(sales, order.id)
    return sales, date.fromisoformat(data['as_of'])


def normalize(candidates):
    return [{'customer_code': Customer.objects.get(pk=c.customer_id).code, 'product_sku': c.reasons.get('product_sku') if c.product_id else None, 'kind': c.kind, 'state': c.state, 'typical_quantity': c.typical_quantity, 'priority': c.priority} for c in candidates]


def baseline_a(actor, as_of):
    """Oldest last purchase; last order SKU/quantity; no stock gate."""
    from crm.access import customers_for
    result = []
    for customer in customers_for(actor).filter(is_active=True):
        lines = [line for line in OrderLine.objects.filter(order__customer=customer, order__status='SHIPPED', product__is_active=True).select_related('order', 'product', 'product__balance') if line.order.shipped_at and timezone.localdate(line.order.shipped_at) <= as_of]
        if not lines:
            continue
        last = max(lines, key=lambda line: (line.order.shipped_at, line.pk))
        result.append(actions.Candidate(key=f'BASEA:{customer.id}', customer_id=customer.id, product_id=last.product_id, kind='REORDER', due_date=timezone.localdate(last.order.shipped_at), typical_quantity=last.quantity, available_quantity=last.product.balance.available, priority=0, state='READY', reasons={'customer_code': customer.code, 'product_sku': last.product.sku}))
    return sorted(result, key=lambda c: (c.due_date, c.reasons['customer_code']))


class ActionCaseEvaluationTests(TestCase):
    def test_twenty_golden_cases_and_actual_baselines(self):
        self.assertTrue(hasattr(actions, 'compute_candidates'), 'compute_candidates not implemented')
        cases = json.loads((Path(__file__).parent / 'data/action_cases.json').read_text())
        self.assertEqual([c['id'] for c in cases], [f'C{n:02d}' for n in range(1, 21)])
        report = {'executed_at': timezone.now().isoformat(), 'data_type': 'synthetic', 'case_count': len(cases), 'passed_cases': 0, 'cases': [], 'methods': {name: {'invalid_offers': 0} for name in ['baseline_a', 'baseline_b', 'oneflow']}}
        report['sensitivity'] = {'weights': [1.0, 0.0], 'cases': [], 'changed_orders': 0}
        for case in cases:
            with self.subTest(case=case['id']), transaction.atomic():
                actor, as_of = case_fixture(case)
                oneflow = actions.list_actions(actor, as_of, limit=None)
                methods = {'baseline_a': baseline_a(actor, as_of), 'baseline_b': [replace(c, state='READY') for c in actions.list_actions(actor, as_of, limit=None)], 'oneflow': oneflow}
                urgency_only = sorted([replace(c, priority=actions.priority_score(c.reasons['overdue_days'], c.reasons['value_90_days_rupiah'], c.reasons['max_value_90_days_rupiah'], weights=(1.0, 0.0))) for c in oneflow], key=lambda c: (-c.priority, c.due_date, c.reasons['customer_code'], c.reasons.get('product_sku', ''), c.key))
                changed = [c.key for c in oneflow] != [c.key for c in urgency_only]
                report['sensitivity']['changed_orders'] += int(changed)
                report['sensitivity']['cases'].append({'id': case['id'], 'default': normalize(oneflow), 'urgency_only': normalize(urgency_only), 'order_changed': changed})
                actual = normalize(oneflow)
                matched = actual == case['expected']
                report['passed_cases'] += int(matched)
                row = {'id': case['id'], 'description': case['description'], 'expected': case['expected'], 'actual': actual, 'matches_expected': matched, 'methods': {}}
                for name, candidates in methods.items():
                    invalid = sum(1 for c in candidates if c.state == 'READY' and c.typical_quantity is not None and c.typical_quantity > c.available_quantity)
                    report['methods'][name]['invalid_offers'] += invalid
                    row['methods'][name] = {'actual': normalize(candidates), 'invalid_offers': invalid, 'available_quantities': [c.available_quantity for c in candidates]}
                report['cases'].append(row)
                transaction.set_rollback(True)
                self.assertEqual(actual, case['expected'])
        output = os.environ.get('ONEFLOW_EVALUATION_OUTPUT')
        if output:
            destination = Path(output)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


class ActionDecisionTests(TestCase):
    def setUp(self):
        self.assertTrue(hasattr(actions, 'record_action'), 'record_action not implemented')
        self.sales = make_user('sales', 'SALES')
        self.other = make_user('other', 'SALES')
        self.warehouse = make_user('warehouse', 'WAREHOUSE')
        self.customer = make_customer(self.sales)
        self.product = make_product(on_hand=10)
        self.as_of = timezone.localdate()
        for days in [90, 60, 30]:
            make_shipped_order(self.sales, self.customer, self.product, 8, self.as_of - timedelta(days=days))
        self.key = actions.list_actions(self.sales, self.as_of)[0].key

    def test_done_requires_note_or_linked_order(self):
        with self.assertRaises(BusinessError) as caught:
            actions.record_action(self.sales, self.key, 'DONE', '', as_of=self.as_of)
        self.assertEqual(caught.exception.code, 'INVALID_INPUT')
        order = make_order(self.sales, self.customer, self.product)
        decision = actions.record_action(self.sales, self.key, 'DONE', '', order_id=order.id, as_of=self.as_of)
        self.assertEqual(decision.order_id, order.id)
        self.assertEqual(actions.list_actions(self.sales, self.as_of), [])

    def test_snooze_requires_future_date(self):
        with self.assertRaises(BusinessError):
            actions.record_action(self.sales, self.key, 'SNOOZED', '', next_date=self.as_of, as_of=self.as_of)
        tomorrow = self.as_of + timedelta(days=1)
        actions.record_action(self.sales, self.key, 'SNOOZED', 'Hubungi besok', next_date=tomorrow, as_of=self.as_of)
        self.assertEqual(actions.list_actions(self.sales, self.as_of), [])
        self.assertEqual(actions.list_actions(self.sales, tomorrow)[0].key, self.key)

    def test_done_can_link_the_confirmed_order_that_resolved_reorder(self):
        order = make_order(self.sales, self.customer, self.product)
        confirm_order(self.sales, order.id)
        decision = actions.record_action(self.sales, self.key, 'DONE', '', order_id=order.id, as_of=self.as_of)
        self.assertEqual(decision.order_id, order.id)

    def test_repeated_submission_does_not_duplicate_decision(self):
        one = actions.record_action(self.sales, self.key, 'DONE', 'Pelanggan sudah dihubungi', as_of=self.as_of)
        two = actions.record_action(self.sales, self.key, 'DONE', 'Pelanggan sudah dihubungi', as_of=self.as_of)
        self.assertEqual(one.id, two.id)
        self.assertEqual(models.ActionDecision.objects.count(), 1)
        self.assertEqual(Activity.objects.filter(kind='INTERACTION').count(), 1)
        with self.assertRaises(BusinessError) as caught:
            actions.record_action(self.sales, self.key, 'DONE', 'Ubah hasil', as_of=self.as_of)
        self.assertEqual(caught.exception.code, 'ACTION_ALREADY_RESOLVED')

    def test_forged_action_key_is_rejected(self):
        with self.assertRaises(Http404):
            actions.record_action(self.other, self.key, 'DONE', 'Tidak sah', as_of=self.as_of)
        with self.assertRaises(Http404):
            actions.record_action(self.sales, 'FOLLOWUP:99999', 'DONE', 'Tidak ada', as_of=self.as_of)
        self.assertEqual(models.ActionDecision.objects.count(), 0)

    def test_new_stock_changes_ready_state(self):
        self.product.balance.on_hand = 0
        self.product.balance.save()
        self.client.force_login(self.sales)
        self.assertContains(self.client.get('/'), 'Koordinasi stok')
        receive_stock(self.warehouse, self.product.id, 10, 'Stok masuk', uuid4())
        self.assertContains(self.client.get('/'), 'Siap ditindaklanjuti')
        self.assertEqual(actions.list_actions(self.sales, self.as_of)[0].state, 'READY')

    def test_followup_overrides_reorder_card(self):
        followup = Activity.objects.create(customer=self.customer, sales=self.sales, kind='FOLLOWUP', followup_date=self.as_of, note='Janji telepon')
        self.assertEqual(actions.list_actions(self.sales, self.as_of)[0].key, f'FOLLOWUP:{followup.id}')
        actions.record_action(self.sales, f'FOLLOWUP:{followup.id}', 'DONE', 'Telepon selesai', as_of=self.as_of)
        followup.refresh_from_db()
        self.assertEqual((followup.status, followup.result), ('DONE', 'Telepon selesai'))
        self.assertEqual(actions.list_actions(self.sales, self.as_of)[0].kind, 'REORDER')

    def test_five_cards_and_full_list(self):
        for n in range(6):
            customer = make_customer(self.sales, f'EXTRA{n}')
            Activity.objects.create(customer=customer, sales=self.sales, kind='FOLLOWUP', followup_date=self.as_of)
        self.assertEqual(len(actions.list_actions(self.sales, self.as_of)), 5)
        self.assertEqual(len(actions.list_actions(self.sales, self.as_of, limit=None)), 7)
        self.client.force_login(self.sales)
        self.assertEqual(len(self.client.get('/').context['actions']), 5)
        self.assertEqual(len(self.client.get('/?all=1').context['actions']), 7)

    def test_wrong_customer_order_is_rejected(self):
        other_customer = make_customer(self.other, 'OTHER')
        order = make_order(self.other, other_customer, self.product)
        with self.assertRaises(BusinessError):
            actions.record_action(self.sales, self.key, 'DONE', '', order_id=order.id, as_of=self.as_of)
        self.assertEqual(models.ActionDecision.objects.count(), 0)

    def test_decision_post_has_csrf_and_get_does_not_mutate(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.sales)
        self.assertEqual(client.get('/actions/decision/').status_code, 405)
        self.assertEqual(client.post('/actions/decision/', {'key': self.key, 'outcome': 'DONE', 'note': 'Selesai'}).status_code, 403)
        self.assertEqual(models.ActionDecision.objects.count(), 0)

    def test_dismissed_requires_reason_and_remains_suppressed(self):
        with self.assertRaises(BusinessError):
            actions.record_action(self.sales, self.key, 'DISMISSED', '', as_of=self.as_of)
        actions.record_action(self.sales, self.key, 'DISMISSED', 'Belum berminat', as_of=self.as_of)
        receive_stock(self.warehouse, self.product.id, 10, 'Stok masuk', uuid4())
        self.assertEqual(actions.list_actions(self.sales, self.as_of), [])
