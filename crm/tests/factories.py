from django.contrib.auth.models import Group, User


def make_user(username, role):
    user = User.objects.create_user(username=username, password='test-password-123', first_name=username)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    return user


def make_customer(owner, code='CUS001'):
    from crm.models import Customer
    return Customer.objects.create(code=code, name=f'Pelanggan {code}', phone='081200000000', address='Alamat simulasi', owner=owner)


def make_product(sku='MADU01', on_hand=0, price_rupiah=50000):
    from crm.models import InventoryBalance, Product
    product = Product.objects.create(sku=sku, name=f'Produk {sku}', unit='botol', price_rupiah=price_rupiah, min_stock=5)
    InventoryBalance.objects.create(product=product, on_hand=on_hand)
    return product


def make_order(sales, customer, product, quantity=8):
    from crm.services.orders import create_draft
    return create_draft(sales, customer.id, [{'product_id': product.id, 'quantity': quantity}])


def make_shipped_order(sales, customer, product, quantity, at):
    """Fixture for read-only rule tests; the demo uses transaction services."""
    from datetime import date, datetime, time
    from django.utils import timezone
    from crm.models import Order, OrderLine
    if isinstance(at, str):
        at = datetime.fromisoformat(at) if 'T' in at else date.fromisoformat(at)
    if not isinstance(at, datetime):
        at = timezone.make_aware(datetime.combine(at, time(12)))
    order = Order.objects.create(customer=customer, sales=sales, status='SHIPPED', total_rupiah=quantity * product.price_rupiah, confirmed_at=at, shipped_at=at, confirmed_by=sales)
    OrderLine.objects.create(order=order, product=product, quantity=quantity, unit_price_rupiah=product.price_rupiah)
    return order
