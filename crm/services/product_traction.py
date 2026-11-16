"""Slow-moving product analysis across pharmacies and manager carry directives."""
from collections import defaultdict
from datetime import timedelta

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from crm.access import require_role
from crm.errors import BusinessError
from crm.models import OrderLine, Product, ProductCarryDirective
from crm.services.inventory import atomic_write


@atomic_write
def save_carry_directive(actor, product_id, directive, substitute_product_id=None, reason=''):
    """Manager sets or updates carry instruction ('Arahan Bawaan Sales') for a product."""
    require_role(actor, {'MANAGER'})
    product = get_object_or_404(Product, pk=product_id)
    if directive == 'CLEAR':
        ProductCarryDirective.objects.filter(product=product).delete()
        return None
    if directive not in ProductCarryDirective.Directive.values:
        raise BusinessError('INVALID_INPUT', 'Pilih jenis arahan bawaan yang valid.')
    substitute = None
    if substitute_product_id:
        if str(substitute_product_id) == str(product.pk):
            raise BusinessError('INVALID_INPUT', 'Produk pengganti harus berbeda dari produk yang dihentikan.')
        substitute = get_object_or_404(Product, pk=substitute_product_id, is_active=True)
    clean_reason = (reason or '').strip()
    if not clean_reason:
        raise BusinessError('INVALID_INPUT', 'Isi alasan atau instruksi bawaan untuk sales.')
    obj, _ = ProductCarryDirective.objects.update_or_create(
        product=product,
        defaults={
            'directive': directive,
            'substitute_product': substitute,
            'reason': clean_reason,
            'updated_by': actor,
        },
    )
    return obj


def product_traction_analysis(as_of=None):
    """Evaluate product movement across pharmacies (fast-moving vs slow/dead-moving)
    and attach Manager carry directives.
    """
    as_of = as_of or timezone.localdate()
    since_30d = as_of - timedelta(days=30)
    products = list(
        Product.objects.filter(is_active=True)
        .select_related('balance', 'carry_directive__substitute_product', 'carry_directive__updated_by')
        .prefetch_related('consignment_stocks__customer', 'consignment_entries')
    )
    shipped_30d = defaultdict(int)
    for row in (
        OrderLine.objects.filter(
            order__status='SHIPPED',
            order__shipped_at__date__gte=since_30d,
            order__shipped_at__date__lte=as_of,
        )
        .values('product_id')
        .annotate(total=Sum('quantity'))
    ):
        shipped_30d[row['product_id']] = row['total'] or 0

    rows = []
    for product in products:
        stocks = [s for s in product.consignment_stocks.all() if s.quantity_on_display > 0 or s.total_placed > 0]
        entries_30d = [e for e in product.consignment_entries.all() if since_30d <= e.visit_date <= as_of]
        consign_sold_30d = sum(e.sold_quantity for e in entries_30d)
        on_display = sum(s.quantity_on_display for s in stocks)
        active_outlets = sum(1 for s in stocks if s.quantity_on_display > 0)
        weak_outlets = []
        for s in stocks:
            denom = s.total_sold + s.quantity_on_display
            ratio = (s.total_sold * 100 // denom) if denom else 0
            if s.quantity_on_display >= 4 and ratio < 25:
                weak_outlets.append(s.customer.name)

        exposure = consign_sold_30d + on_display
        sell_through_pct = round(consign_sold_30d * 100 / exposure, 1) if exposure > 0 else 0.0
        total_demand_30d = consign_sold_30d + shipped_30d[product.pk]

        if (sell_through_pct >= 50 and consign_sold_30d >= 12) or total_demand_30d >= 60:
            movement = 'FAST'
            movement_label = 'Laku keras'
        elif active_outlets >= 2 and consign_sold_30d == 0 and on_display >= 6:
            movement = 'DEAD'
            movement_label = 'Tidak laku di apotek'
        elif (active_outlets >= 2 and sell_through_pct < 25 and on_display >= 6) or len(weak_outlets) >= 2:
            movement = 'SLOW'
            movement_label = 'Kurang laku'
        else:
            movement = 'NORMAL'
            movement_label = 'Normal'

        directive = getattr(product, 'carry_directive', None)
        rows.append({
            'id': str(product.pk),
            'product_id': str(product.pk),
            'sku': product.sku,
            'name': product.name,
            'unit': product.unit,
            'on_display': on_display,
            'active_outlets': active_outlets,
            'consign_sold_30d': consign_sold_30d,
            'shipped_30d': shipped_30d[product.pk],
            'total_demand_30d': total_demand_30d,
            'sell_through_pct': sell_through_pct,
            'weak_outlet_count': len(weak_outlets),
            'weak_outlets': weak_outlets[:5],
            'movement': movement,
            'movement_label': movement_label,
            'directive': {
                'code': directive.directive,
                'label': directive.get_directive_display(),
                'substitute_id': str(directive.substitute_product_id) if directive.substitute_product_id else '',
                'substitute_name': directive.substitute_product.name if directive.substitute_product else '',
                'substitute_sku': directive.substitute_product.sku if directive.substitute_product else '',
                'reason': directive.reason,
                'updated_by': directive.updated_by.get_full_name() or directive.updated_by.username,
            } if directive else None,
        })
    order_priority = {'DEAD': 0, 'SLOW': 1, 'FAST': 2, 'NORMAL': 3}
    rows.sort(key=lambda r: (0 if r['directive'] else 1, order_priority.get(r['movement'], 9), r['sku']))
    return rows
