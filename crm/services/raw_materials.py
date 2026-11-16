"""Early Warning System (EWS) for raw materials linked to finished products."""
from django.shortcuts import get_object_or_404
from django.utils import timezone

from crm.access import require_role
from crm.errors import BusinessError
from crm.models import RawMaterial
from crm.services.inventory import atomic_write, integer_input
from crm.services.product_traction import product_traction_analysis


@atomic_write
def save_raw_material(actor, material_id, on_hand, min_threshold, fast_moving_threshold, note=''):
    """Warehouse or Manager updates raw material stock and early-warning thresholds."""
    require_role(actor, {'MANAGER', 'WAREHOUSE'})
    material = get_object_or_404(RawMaterial, pk=material_id)
    integer_input(on_hand, 0)
    integer_input(min_threshold, 1)
    integer_input(fast_moving_threshold, 1)
    if fast_moving_threshold < min_threshold:
        raise BusinessError('INVALID_INPUT', 'Target stok saat produk laku keras tidak boleh di bawah batas minimum standar.')
    material.on_hand = on_hand
    material.min_threshold = min_threshold
    material.fast_moving_threshold = fast_moving_threshold
    material.note = (note or '').strip()
    material.updated_by = actor
    material.save(update_fields=['on_hand', 'min_threshold', 'fast_moving_threshold', 'note', 'updated_by', 'updated_at'])
    return material


def raw_material_alerts(as_of=None):
    """Compute Early Warning System alarms for raw materials ('bahan pokok / bahan baku')
    based on whether linked finished products are fast-moving.
    """
    as_of = as_of or timezone.localdate()
    traction_by_id = {int(r['product_id']): r for r in product_traction_analysis(as_of)}
    materials = list(RawMaterial.objects.prefetch_related('products').order_by('code'))
    alerts = []
    for mat in materials:
        linked = list(mat.products.all())
        fast_products = [
            p.name for p in linked
            if traction_by_id.get(p.pk, {}).get('movement') == 'FAST'
        ]
        is_fast_demand = len(fast_products) > 0
        required_stock = mat.fast_moving_threshold if is_fast_demand else mat.min_threshold
        shortage = max(0, required_stock - mat.on_hand)
        ratio_pct = round(mat.on_hand * 100 / required_stock, 1) if required_stock > 0 else 100.0

        if mat.on_hand <= required_stock * 0.5:
            severity = 'CRITICAL'
            severity_label = 'Alarm kritis (≤ 50% kebutuhan)'
        elif mat.on_hand < required_stock:
            severity = 'WARNING'
            severity_label = 'Perlu pengadaan segera'
        else:
            severity = 'SAFE'
            severity_label = 'Stok bahan baku aman'

        if is_fast_demand and severity != 'SAFE':
            explanation = (
                f'Produk {", ".join(fast_products)} sedang laku keras: wajib sedia minimal '
                f'{required_stock} {mat.unit}, saat ini tersisa {mat.on_hand} {mat.unit} '
                f'(kurang {shortage} {mat.unit}).'
            )
        elif is_fast_demand:
            explanation = (
                f'Produk {", ".join(fast_products)} laku keras: target stok {required_stock} {mat.unit} terpenuhi.'
            )
        elif severity != 'SAFE':
            explanation = (
                f'Stok di bawah batas minimum standar {required_stock} {mat.unit} (kurang {shortage} {mat.unit}).'
            )
        else:
            explanation = f'Memenuhi batas minimum standar ({required_stock} {mat.unit}).'

        alerts.append({
            'id': str(mat.pk),
            'code': mat.code,
            'name': mat.name,
            'unit': mat.unit,
            'on_hand': mat.on_hand,
            'min_threshold': mat.min_threshold,
            'fast_moving_threshold': mat.fast_moving_threshold,
            'required_stock': required_stock,
            'shortage': shortage,
            'ratio_pct': ratio_pct,
            'is_fast_demand': is_fast_demand,
            'fast_products': fast_products,
            'linked_products': [{'id': str(p.pk), 'sku': p.sku, 'name': p.name} for p in linked],
            'severity': severity,
            'severity_label': severity_label,
            'explanation': explanation,
            'note': mat.note,
        })
    severity_rank = {'CRITICAL': 0, 'WARNING': 1, 'SAFE': 2}
    alerts.sort(key=lambda a: (severity_rank.get(a['severity'], 9), a['code']))
    return alerts
