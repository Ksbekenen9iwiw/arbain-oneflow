"""Visit plan: which outlets to visit first, what to bring, and what is slowing down.

Every suggestion carries the figures it was derived from, so the screen can show why.
"""
from collections import defaultdict
from math import sqrt

from django.utils import timezone

from crm.access import customers_for, role_of
from crm.models import Activity, ConsignmentStock

CYCLE_DAYS = 30
NEIGHBOURS = 30


def _area(customer):
    return (customer.address or '').strip().title()


def _rows(customers):
    return list(
        ConsignmentStock.objects.filter(customer__in=customers)
        .values('customer_id', 'product_id', 'product__name', 'quantity_on_display', 'total_sold', 'last_checked_date')
    )


def _open_activities(customers, sales_id=None):
    planned = Activity.objects.filter(customer__in=customers, status='PLANNED')
    if sales_id:
        planned = planned.filter(sales_id=sales_id)
    due = {}
    for activity_id, customer_id, scheduled, followup in planned.values_list('pk', 'customer_id', 'scheduled_date', 'followup_date'):
        day = scheduled or followup
        if day and (customer_id not in due or day < due[customer_id][0]):
            due[customer_id] = (day, activity_id)
    return due


def visit_plan(actor, as_of=None, selected_sales=None, limit=8):
    """Outlets worth visiting today, best first, each with the reason and the items to bring."""
    role = role_of(actor)
    if role == 'WAREHOUSE':
        return []
    as_of = as_of or timezone.localdate()
    customers = customers_for(actor).filter(is_active=True)
    sales_id = actor.pk if role == 'SALES' else selected_sales
    if sales_id:
        customers = customers.filter(owner_id=sales_id)
    by_outlet = defaultdict(list)
    for row in _rows(customers):
        by_outlet[row['customer_id']].append(row)
    due = _open_activities(customers, sales_id)
    candidates = []
    for customer in customers.filter(pk__in=set(by_outlet) | set(due)).select_related('owner'):
        rows = by_outlet.get(customer.pk, [])
        empty = [row for row in rows if row['total_sold'] > 0 and row['quantity_on_display'] == 0]
        checked = max((row['last_checked_date'] for row in rows if row['last_checked_date']), default=None)
        since = (as_of - checked).days if checked else None
        day, activity_id = due.get(customer.pk, (None, None))
        late = (as_of - day).days if day else None
        reasons = []
        if empty:
            reasons.append((30 * min(len(empty), 3), 'EMPTY', len(empty)))
        if late is not None and late > 0:
            reasons.append((40 + min(late, 30), 'LATE', late))
        elif late == 0:
            reasons.append((50, 'TODAY', 0))
        if since is not None and since > CYCLE_DAYS:
            reasons.append((min(since - CYCLE_DAYS, 40), 'UNCHECKED', since))
        if not reasons:
            continue
        reasons.sort(reverse=True)
        candidates.append({
            'customer_id': str(customer.pk), 'name': customer.name, 'area': _area(customer),
            'sales_name': customer.owner.get_full_name() or customer.owner.username,
            'activity_id': str(activity_id) if activity_id else '',
            'score': sum(points for points, _, _ in reasons),
            'reasons': [{'kind': kind, 'value': value} for _, kind, value in reasons],
            'bring': _bring(rows)[:5],
        })
    # Greedy pick: an outlet in an area already on the route gets a bonus, so the day stays in one direction.
    chosen, areas = [], set()
    while candidates and len(chosen) < limit:
        best = max(candidates, key=lambda item: (item['score'] + (15 if item['area'] and item['area'] in areas else 0), item['name']))
        candidates.remove(best)
        chosen.append(best)
        areas.add(best['area'])
    sold, carried, names = _sold_matrix() if chosen else ({}, {}, {})
    order = {}
    for item in chosen:
        rows = by_outlet.get(int(item['customer_id']), [])
        item['try'] = recommend_products(int(item['customer_id']), sold, carried, names) if rows else []
        item['pull'] = _pull(rows)
        order.setdefault(item['area'], len(order))
    chosen.sort(key=lambda item: (order[item['area']], -item['score'], item['name']))
    return chosen


def _bring(rows):
    """Top-up per product: what sold since the last check, less what is still on the shelf."""
    items = []
    for row in rows:
        quantity = row['total_sold'] - row['quantity_on_display']
        if row['total_sold'] > 0 and quantity > 0:
            items.append({'product_id': str(row['product_id']), 'name': row['product__name'], 'quantity': quantity,
                          'sold': row['total_sold'], 'on_display': row['quantity_on_display']})
    return sorted(items, key=lambda item: (-item['sold'], item['name']))


def _pull(rows):
    """Products on the shelf that have not sold at all."""
    idle = sorted((row for row in rows if row['total_sold'] == 0 and row['quantity_on_display'] >= 3), key=lambda row: (-row['quantity_on_display'], row['product__name']))[:3]
    return [{'product_id': str(row['product_id']), 'name': row['product__name'], 'on_display': row['quantity_on_display']} for row in idle]


def _sold_matrix():
    """Outlet -> {product: units sold}, plus which products each outlet already carries."""
    sold, carried, names = defaultdict(dict), defaultdict(set), {}
    for customer_id, product_id, name, total_sold in ConsignmentStock.objects.values_list('customer_id', 'product_id', 'product__name', 'total_sold'):
        carried[customer_id].add(product_id)
        names[product_id] = name
        if total_sold > 0:
            sold[customer_id][product_id] = total_sold
    return sold, carried, names


def _overlap(left, right):
    """Cosine similarity on which products sell at both outlets (units are too sparse to weigh)."""
    shared = len(left.keys() & right.keys())
    return shared / sqrt(len(left) * len(right)) if shared else 0.0


def recommend_products(customer_id, sold, carried, names, limit=2, exclude_carried=True):
    """Products that sell at the outlets most similar to this one (similarity on which products sell)."""
    mine = sold.get(customer_id, {})
    neighbours = sorted(((_overlap(mine, other), other_id) for other_id, other in sold.items() if other_id != customer_id), reverse=True)[:NEIGHBOURS]
    neighbours = [(weight, other_id) for weight, other_id in neighbours if weight > 0]
    scores, sellers = defaultdict(float), defaultdict(int)
    for weight, other_id in neighbours:
        for product_id, units in sold[other_id].items():
            if exclude_carried and product_id in carried.get(customer_id, ()):
                continue
            scores[product_id] += weight * units
            sellers[product_id] += 1
    ranked = sorted(scores, key=lambda product_id: (-scores[product_id], names[product_id]))[:limit]
    return [{'product_id': str(product_id), 'name': names[product_id], 'sellers': sellers[product_id], 'neighbours': len(neighbours)} for product_id in ranked]


def outlet_advice(actor, customer_id):
    """What to bring, what to try, and what to pull for one outlet the actor may see."""
    if role_of(actor) == 'WAREHOUSE':
        return None
    customer = customers_for(actor).filter(pk=customer_id).first()
    if not customer:
        return None
    rows = _rows([customer])
    if not rows:
        return {'bring': [], 'try': [], 'pull': []}
    sold, carried, names = _sold_matrix()
    return {
        'bring': _bring(rows)[:6],
        'try': recommend_products(customer.pk, sold, carried, names),
        'pull': _pull(rows),
    }


def attention(actor, selected_sales=None, limit=8):
    """Manager view: slow products, slow outlets, and products worth placing at more outlets."""
    if role_of(actor) != 'MANAGER':
        return None
    customers = customers_for(actor).filter(is_active=True)
    if selected_sales:
        customers = customers.filter(owner_id=selected_sales)
    customers = {customer.pk: customer for customer in customers.select_related('owner')}
    products, outlets = {}, {}
    for row in _rows(list(customers)):
        product = products.setdefault(row['product_id'], {'product_id': str(row['product_id']), 'name': row['product__name'], 'outlets': 0, 'on_display': 0, 'sold': 0})
        product['outlets'] += 1
        product['on_display'] += row['quantity_on_display']
        product['sold'] += row['total_sold']
        customer = customers[row['customer_id']]
        outlet = outlets.setdefault(customer.pk, {'customer_id': str(customer.pk), 'name': customer.name, 'area': _area(customer),
                                                  'sales_name': customer.owner.get_full_name() or customer.owner.username, 'on_display': 0, 'sold': 0})
        outlet['on_display'] += row['quantity_on_display']
        outlet['sold'] += row['total_sold']

    def slowest(items, floor):
        for item in items:
            total = item['sold'] + item['on_display']
            item['sell_through'] = round(100 * item['sold'] / total) if total else 0
        return sorted((item for item in items if item['on_display'] >= floor), key=lambda item: (item['sell_through'], -item['on_display'], item['name']))[:limit]

    sold, carried, names = _sold_matrix()
    wanted = defaultdict(list)
    for customer_id in customers:
        if customer_id in carried:
            for pick in recommend_products(customer_id, sold, carried, names):
                wanted[pick['product_id']].append(customer_id)
    opportunities = [{'product_id': product_id, 'name': names[int(product_id)], 'outlet_count': len(ids),
                      'outlets': [{'customer_id': str(pk), 'name': customers[pk].name} for pk in ids[:3]]}
                     for product_id, ids in sorted(wanted.items(), key=lambda item: (-len(item[1]), names[int(item[0])]))[:limit]]
    return {'slow_products': slowest(products.values(), 20), 'slow_outlets': slowest(outlets.values(), 30), 'opportunities': opportunities,
            'covered_outlets': len(outlets), 'total_outlets': len(customers)}
