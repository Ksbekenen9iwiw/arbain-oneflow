from django.core.exceptions import PermissionDenied

BUSINESS_ROLES = {'SALES', 'WAREHOUSE', 'MANAGER'}


def role_of(actor):
    if not actor.is_authenticated or not actor.is_active:
        raise PermissionDenied('Akun aktif dengan satu peran bisnis diperlukan.')
    roles = list(actor.groups.filter(name__in=BUSINESS_ROLES).values_list('name', flat=True))
    if len(roles) != 1:
        raise PermissionDenied('Akun harus memiliki tepat satu peran bisnis. Hubungi manajer.')
    return roles[0]


def require_role(actor, allowed):
    if role_of(actor) not in allowed:
        raise PermissionDenied('Operasi ini tidak tersedia untuk peran Anda.')


def active_sales():
    from django.contrib.auth.models import User
    return User.objects.filter(is_active=True, groups__name='SALES').exclude(groups__name__in=['WAREHOUSE', 'MANAGER']).distinct().order_by('username')


def customers_for(actor):
    from crm.models import Customer
    role = role_of(actor)
    if role == 'WAREHOUSE':
        raise PermissionDenied('Profil pelanggan tersedia untuk sales dan manajer. Kontak pemenuhan ada pada pesanan.')
    customers = Customer.objects.select_related('owner')
    return customers.filter(owner=actor) if role == 'SALES' else customers


def orders_for(actor):
    from crm.models import Order
    role = role_of(actor)
    records = Order.objects.select_related('customer', 'sales', 'confirmed_by', 'shipped_by', 'cancelled_by')
    if role == 'SALES':
        return records.filter(sales=actor)
    if role == 'WAREHOUSE':
        return records.filter(status__in=['CONFIRMED', 'SHIPPED'])
    return records


def sample_requests_for(actor):
    from crm.models import SampleRequest
    role = role_of(actor)
    records = SampleRequest.objects.select_related(
        'customer', 'sales', 'decided_by', 'shipped_by', 'received_by',
        'cancelled_by', 'order',
    )
    if role == 'SALES':
        return records.filter(sales=actor)
    if role == 'WAREHOUSE':
        return records.filter(status=SampleRequest.Status.APPROVED)
    return records
