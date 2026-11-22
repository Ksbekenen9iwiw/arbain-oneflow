"""Questions the assistant may ask the database.

Each tool takes the signed-in user, never a user named by the model, so answers
follow the same role rules as the screens. Each returns the figures plus the
pages where they can be checked.
"""
from urllib.parse import urlencode

from django.db.models import F, Q
from django.utils import timezone

from crm.access import customers_for, orders_for, role_of
from crm.models import Activity, Product
from crm.selectors import dashboard_metrics, dashboard_sales
from crm.services.visit_plan import attention, outlet_advice, visit_plan

REASONS = {'EMPTY': 'produk laku habis di rak', 'LATE': 'hari terlambat', 'TODAY': 'dijadwalkan hari ini', 'UNCHECKED': 'hari sejak cek terakhir'}


def _sales_id(actor, sales_name):
    """Resolve a sales name for a manager; a sales user is always themselves."""
    if role_of(actor) != 'MANAGER' or not sales_name:
        return None
    for user in dashboard_sales():
        if sales_name.lower() in f'{user.get_full_name()} {user.username}'.lower():
            return str(user.pk)
    return None


def _nice(name):
    return ' '.join(str(name or '').title().split())


def _rupiah(value):
    value = int(value or 0)
    if value >= 1_000_000:
        return f"Rp {value / 1_000_000:.1f} juta".replace('.', ',').replace(',0 juta', ' juta')
    return f"Rp {value:,}".replace(',', '.')


def _tone(percent):
    return 'danger' if percent < 10 else 'warning' if percent < 30 else 'ok'


def rencana_kunjungan(actor, sales_name=''):
    plan = visit_plan(actor, selected_sales=_sales_id(actor, sales_name))
    reason = lambda item: [f"{r['value']} {REASONS[r['kind']]}" if r['kind'] != 'TODAY' else REASONS['TODAY'] for r in item['reasons']]
    outlets = [{
        'outlet': item['name'], 'wilayah': item['area'], 'sales': item['sales_name'], 'alasan': reason(item),
        'bawa': [f"{row['name']} ({row['quantity']} unit)" for row in item['bring']],
        'coba_titipkan': [row['name'] for row in item['try']],
    } for item in plan]
    card = {'kind': 'route', 'title': 'Rencana kunjungan', 'summary': f"{len(plan)} outlet · {len({item['area'] for item in plan})} wilayah", 'stops': [{
        'name': _nice(item['name']), 'area': _nice(item['area']), 'href': f"/customers/{item['customer_id']}/?tab=consignment",
        'reasons': [{'text': text, 'tone': 'danger' if r['kind'] in ('EMPTY', 'LATE') else 'warning'} for text, r in zip(reason(item), item['reasons'])][:2],
        'rows': [{'label': _nice(row['name']), 'value': f"{row['quantity']} unit"} for row in item['bring']],
    } for item in plan]}
    return {'outlet': outlets}, [{'label': 'Rencana hari ini', 'href': '/'}], [card] if plan else []


def kunjungan_terlambat(actor, sales_name=''):
    today = timezone.localdate()
    planned = Activity.objects.filter(customer__in=customers_for(actor), status='PLANNED').filter(
        Q(followup_date__lt=today) | Q(scheduled_date__lt=today)).select_related('customer', 'customer__owner')
    sales_id = _sales_id(actor, sales_name)
    if sales_id:
        planned = planned.filter(customer__owner_id=sales_id)
    due = lambda activity: min(day for day in (activity.scheduled_date, activity.followup_date) if day)
    late = lambda activity: (today - due(activity)).days
    rows = sorted(planned, key=due)
    per_sales = {}
    for activity in rows:
        name = activity.customer.owner.get_full_name() or activity.customer.owner.username
        per_sales[name] = per_sales.get(name, 0) + 1
    oldest = [{'outlet': activity.customer.name, 'wilayah': (activity.customer.address or '').title(),
               'jadwal': due(activity).isoformat(), 'hari_terlambat': late(activity)} for activity in rows[:8]]
    parts = [{'label': name, 'value': str(count), 'percent': round(count * 100 / len(rows))} for name, count in sorted(per_sales.items(), key=lambda pair: -pair[1])]
    cards = [{'kind': 'stat', 'title': 'Kunjungan terlambat', 'value': len(rows), 'unit': 'kunjungan', 'tone': 'danger' if rows else 'ok',
              'parts': parts if len(parts) > 1 else []}]
    if rows:
        cards.append({'kind': 'ranking', 'title': 'Paling lama tertunda', 'items': [{
            'name': _nice(activity.customer.name), 'sub': _nice(activity.customer.address), 'href': f'/customers/{activity.customer_id}/',
            'value': f'{late(activity)} hari', 'percent': round(late(activity) * 100 / max(late(rows[0]), 1)), 'tone': 'danger',
        } for activity in rows[:6]]})
    return {'jumlah': len(rows), 'per_sales': per_sales, 'paling_lama': oldest}, [{'label': 'Agenda terlambat', 'href': '/?all=1'}], cards


def capaian_target(actor, sales_name=''):
    metrics = dashboard_metrics(actor, timezone.localdate(), _sales_id(actor, sales_name))
    rows = [{'sales': row['sales_name'], 'terkirim_rupiah': row['shipped_value_rupiah'], 'target_rupiah': row['target_rupiah'] if row['target_set'] else None,
             'capaian_persen': row['achievement_percent']} for row in metrics['sales_rows']]
    percent = metrics['target_summary']['achievement_percent']
    parts = [{'label': row['sales'], 'value': _rupiah(row['terkirim_rupiah']) + (f" · {row['capaian_persen']}%" if row['target_rupiah'] else ''),
              'percent': min(row['capaian_persen'] or 0, 100)} for row in rows]
    card = {'kind': 'stat', 'title': 'Terkirim bulan ini', 'text': _rupiah(metrics['shipped_value_rupiah']), 'unit': f"{metrics['shipped_order_count']} pesanan",
            'tone': 'ok', 'parts': parts if len(parts) > 1 else []}
    if percent is not None:
        card['progress'] = {'percent': min(percent, 100), 'label': f'{percent}% dari target'}
    return {'bulan': timezone.localdate().strftime('%Y-%m'), 'pesanan_terkirim': metrics['shipped_order_count'],
            'nilai_terkirim_rupiah': metrics['shipped_value_rupiah'], 'capaian_tim_persen': percent,
            'per_sales': rows}, [{'label': 'Dashboard', 'href': '/'}], [card]


def _stock_item(product):
    floor, available = max(product.min_stock, 1), product.balance.available
    return {'name': _nice(product.name), 'sub': f'minimum {product.min_stock} {product.unit}', 'href': '/stock/?' + urlencode({'q': product.name}),
            'value': f'{available} {product.unit}', 'percent': max(0, min(round(available * 100 / (floor * 2)), 100)),
            'tone': 'danger' if available <= 0 else 'warning' if available < floor else 'ok'}


def stok_gudang(actor, nama_produk=''):
    products = Product.objects.filter(is_active=True, balance__isnull=False).select_related('balance')
    if nama_produk:
        found = products
        for word in nama_produk.split():
            found = found.filter(name__icontains=word)
        found = list(found.order_by('name')[:8])
        rows = [{'produk': product.name, 'stok': product.balance.on_hand, 'dipesan': product.balance.reserved,
                 'tersedia': product.balance.available, 'batas_minimum': product.min_stock, 'satuan': product.unit} for product in found]
        cards = [{'kind': 'ranking', 'title': 'Stok tersedia', 'items': [_stock_item(product) for product in found]}] if found else []
        return {'produk': rows}, [{'label': f'Stok "{nama_produk}"', 'href': '/stock/?' + urlencode({'q': nama_produk})}] if rows else [], cards
    low = products.filter(balance__on_hand__lt=F('balance__reserved') + F('min_stock')).order_by('name')
    count, low = low.count(), list(low[:10])
    rows = [{'produk': product.name, 'tersedia': product.balance.available, 'batas_minimum': product.min_stock, 'satuan': product.unit} for product in low]
    cards = [{'kind': 'stat', 'title': 'Stok menipis', 'value': count, 'unit': f'dari {products.count()} produk', 'tone': 'warning' if count else 'ok', 'parts': []}]
    if low:
        cards.append({'kind': 'ranking', 'title': 'Di bawah batas minimum', 'items': [_stock_item(product) for product in low]})
    return {'jumlah_produk_aktif': products.count(), 'jumlah_menipis': count, 'menipis': rows}, [{'label': 'Stok menipis', 'href': '/stock/?filter=low&status=active'}], cards


def pesanan_menunggu_kirim(actor):
    waiting = orders_for(actor).filter(status='CONFIRMED').select_related('customer').order_by('confirmed_at')
    count, today = waiting.count(), timezone.localdate()
    waiting = list(waiting[:8])
    days = lambda order: (today - timezone.localdate(order.confirmed_at)).days
    rows = [{'outlet': order.customer.name, 'nilai_rupiah': order.total_rupiah, 'dikonfirmasi': timezone.localdate(order.confirmed_at).isoformat()} for order in waiting]
    cards = [{'kind': 'stat', 'title': 'Menunggu dikirim', 'value': count, 'unit': 'pesanan', 'tone': 'warning' if count else 'ok', 'parts': []}]
    if waiting:
        cards.append({'kind': 'ranking', 'title': 'Paling lama menunggu', 'items': [{
            'name': _nice(order.customer.name), 'sub': _rupiah(order.total_rupiah), 'href': f'/orders/{order.pk}/',
            'value': f'{days(order)} hari' if days(order) else 'hari ini', 'percent': round(days(order) * 100 / max(days(waiting[0]), 1)), 'tone': 'warning',
        } for order in waiting]})
    return {'jumlah': count, 'pesanan': rows}, [{'label': 'Pesanan menunggu kirim', 'href': '/orders/?status=CONFIRMED'}], cards


def titip_jual_melambat(actor, sales_name=''):
    result = attention(actor, _sales_id(actor, sales_name), limit=6)
    slim = lambda item, key: {key: item['name'], 'terjual': item['sold'], 'dipajang': item['on_display'], 'persen_terjual': item['sell_through']}
    bar = lambda item, sub, href=None: {'name': _nice(item['name']), 'sub': sub, 'href': href, 'value': f"{item['sold']} dari {item['on_display']} terjual",
                                        'percent': item['sell_through'], 'tone': _tone(item['sell_through'])}
    most = max([item['outlet_count'] for item in result['opportunities']] or [1])
    cards = [card for card in (
        {'kind': 'ranking', 'title': 'Outlet melambat', 'items': [
            bar(item, ' · '.join(part for part in (_nice(item['area']), item['sales_name']) if part), f"/customers/{item['customer_id']}/?tab=consignment")
            for item in result['slow_outlets']]},
        {'kind': 'ranking', 'title': 'Produk melambat', 'items': [bar(item, f"{item['outlets']} outlet") for item in result['slow_products']]},
        {'kind': 'ranking', 'title': 'Peluang titip', 'items': [
            {'name': _nice(item['name']), 'sub': 'laku di outlet serupa', 'value': f"{item['outlet_count']} outlet",
             'percent': round(item['outlet_count'] * 100 / most), 'tone': 'ok'} for item in result['opportunities']]},
    ) if card['items']]
    return {
        'outlet_dengan_data': result['covered_outlets'], 'total_outlet': result['total_outlets'],
        'produk_melambat': [slim(item, 'produk') | {'jumlah_outlet': item['outlets']} for item in result['slow_products']],
        'outlet_melambat': [slim(item, 'outlet') | {'wilayah': item['area'], 'sales': item['sales_name']} for item in result['slow_outlets']],
        'peluang_titip': [{'produk': item['name'], 'jumlah_outlet': item['outlet_count']} for item in result['opportunities']],
    }, [{'label': 'Perlu perhatian', 'href': '/attention/'}], cards


def saran_outlet(actor, nama_outlet):
    matches = customers_for(actor)
    for word in nama_outlet.split():
        matches = matches.filter(name__icontains=word)
    matches = list(matches.order_by('name')[:5])
    if not matches:
        return {'ditemukan': False}, [], []
    if len(matches) > 1 and not any(customer.name.lower() == nama_outlet.lower() for customer in matches):
        return {'ditemukan': False, 'pilihan': [customer.name for customer in matches]}, [], [
            {'kind': 'choices', 'title': 'Outlet yang mana?', 'items': [f'Saran untuk {_nice(customer.name)}' for customer in matches]}]
    customer = next((c for c in matches if c.name.lower() == nama_outlet.lower()), matches[0])
    advice = outlet_advice(actor, customer.pk)
    href = f'/customers/{customer.pk}/?tab=consignment'
    groups = [group for group in (
        {'label': 'Bawa', 'tone': 'ok', 'rows': [
            {'label': _nice(row['name']), 'value': f"{row['quantity']} unit", 'sub': f"terjual {row['sold']}, sisa rak {row['on_display']}"} for row in advice['bring']]},
        {'label': 'Coba titipkan', 'tone': 'accent', 'rows': [
            {'label': _nice(row['name']), 'value': f"{row['sellers']} outlet", 'sub': 'laku di outlet serupa'} for row in advice['try']]},
        {'label': 'Tidak laku, tarik', 'tone': 'danger', 'rows': [
            {'label': _nice(row['name']), 'value': f"{row['on_display']} di rak", 'sub': 'belum terjual'} for row in advice['pull'][:5]]},
    ) if group['rows']]
    cards = [{'kind': 'groups', 'title': _nice(customer.name), 'summary': _nice(customer.address), 'href': href, 'groups': groups}] if groups else []
    return {
        'ditemukan': True, 'outlet': customer.name, 'wilayah': (customer.address or '').title(),
        'bawa': [f"{row['name']} ({row['quantity']} unit; terjual {row['sold']}, sisa rak {row['on_display']})" for row in advice['bring']],
        'coba_titipkan': [f"{row['name']} (laku di {row['sellers']} outlet serupa)" for row in advice['try']],
        'tidak_laku': [f"{row['name']} ({row['on_display']} di rak)" for row in advice['pull']],
    }, [{'label': customer.name, 'href': href}], cards


# What the user sees for each tool, and what is worth asking next.
LABELS = {
    'rencana_kunjungan': 'Rencana kunjungan', 'kunjungan_terlambat': 'Agenda kunjungan', 'capaian_target': 'Penjualan dan target',
    'stok_gudang': 'Stok gudang', 'pesanan_menunggu_kirim': 'Pesanan', 'titip_jual_melambat': 'Titip jual', 'saran_outlet': 'Titip jual outlet',
}
# question -> the tool that answers it, so a role is never offered a question it cannot ask.
QUESTIONS = {
    'Berapa kunjungan yang terlambat?': 'kunjungan_terlambat', 'Bagaimana capaian target bulan ini?': 'capaian_target',
    'Hari ini sebaiknya ke outlet mana?': 'rencana_kunjungan', 'Produk dan outlet mana yang melambat?': 'titip_jual_melambat',
    'Berapa pesanan yang menunggu dikirim?': 'pesanan_menunggu_kirim', 'Produk apa yang stoknya menipis?': 'stok_gudang',
}


def follow_ups(actor, used):
    """Up to two next questions about something this answer did not already cover."""
    allowed = tools_for(actor)
    return [question for question, tool in QUESTIONS.items() if tool in allowed and tool not in used][:2] if used else []


SALES_ARG = {'sales_name': {'type': 'string', 'description': 'Nama sales; hanya untuk manajer. Kosongkan untuk seluruh tim.'}}
# name -> (function, roles allowed, description for the model, parameters)
TOOLS = {
    'rencana_kunjungan': (rencana_kunjungan, {'SALES', 'MANAGER'}, 'Outlet yang sebaiknya dikunjungi hari ini atau besok, urut prioritas, dengan alasan dan barang yang dibawa.', SALES_ARG),
    'kunjungan_terlambat': (kunjungan_terlambat, {'SALES', 'MANAGER'}, 'Jumlah kunjungan yang terlambat, per sales, dan yang paling lama tertunda.', SALES_ARG),
    'capaian_target': (capaian_target, {'SALES', 'MANAGER'}, 'Penjualan terkirim bulan ini dan capaian terhadap target.', SALES_ARG),
    'stok_gudang': (stok_gudang, {'SALES', 'MANAGER', 'WAREHOUSE'}, 'Stok gudang satu produk (isi nama_produk) atau daftar produk yang menipis (kosongkan).',
                    {'nama_produk': {'type': 'string', 'description': 'Sebagian nama produk, misalnya "madu klengkeng".'}}),
    'pesanan_menunggu_kirim': (pesanan_menunggu_kirim, {'SALES', 'MANAGER', 'WAREHOUSE'}, 'Pesanan yang sudah dikonfirmasi dan belum dikirim.', {}),
    'titip_jual_melambat': (titip_jual_melambat, {'MANAGER'}, 'Produk dan outlet titip jual yang melambat, serta produk yang berpeluang dititipkan di outlet lain.', SALES_ARG),
    'saran_outlet': (saran_outlet, {'SALES', 'MANAGER'}, 'Untuk satu outlet: barang yang perlu dibawa, produk yang layak dicoba, dan yang tidak laku.',
                     {'nama_outlet': {'type': 'string', 'description': 'Nama outlet, misalnya "ap sidomulyo".'}}),
}


def tools_for(actor):
    """Tools for this role. Only a manager may name a sales; everyone else is scoped to themselves."""
    role = role_of(actor)
    return {name: (run, roles, text, params if role == 'MANAGER' else {key: value for key, value in params.items() if key != 'sales_name'})
            for name, (run, roles, text, params) in TOOLS.items() if role in roles}


def run_tool(actor, name, args):
    """Run one tool for the signed-in user. Unknown or disallowed tools answer with an error, not data."""
    spec = tools_for(actor).get(name)
    if not spec:
        return {'error': 'Tidak tersedia untuk peran ini.'}, [], []
    allowed = {key: str(value)[:80] for key, value in (args or {}).items() if key in spec[3] and value}
    role, scope = role_of(actor), 'seluruh gudang'
    if 'sales_name' in allowed:
        if not _sales_id(actor, allowed['sales_name']):
            return {'error': f"Sales \"{allowed['sales_name']}\" tidak ditemukan."}, [], []
        scope = f"outlet milik sales {allowed['sales_name']}"
    elif role == 'SALES':
        scope = f'hanya outlet milik {actor.get_full_name() or actor.username}; data sales lain tidak tersedia'
    elif role == 'MANAGER':
        scope = 'seluruh tim'
    data, links, cards = spec[0](actor, **allowed)
    return {'cakupan': scope, **data}, links, cards
