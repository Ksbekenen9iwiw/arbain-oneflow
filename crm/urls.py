from django.urls import path
from crm import views

urlpatterns = [
    path('', views.today, name='today'),
    path('actions/decision/', views.action_decision, name='action_decision'),
    path('targets/', views.target_save, name='target_save'),
    path('customers/', views.customers, name='customers'),
    path('customers/new/', views.customer_create, name='customer_create'),
    path('customers/<int:customer_id>/', views.customer_detail, name='customer_detail'),
    path('customers/<int:customer_id>/activities/new/', views.activity_create, name='activity_create'),
    path('activities/<int:activity_id>/complete/', views.activity_complete, name='activity_complete'),
    path('products/new/', views.product_create, name='product_create'),
    path('products/<int:product_id>/', views.product_detail, name='product_detail'),
    path('products/<int:product_id>/edit/', views.product_edit, name='product_edit'),
    path('stock/', views.stock, name='stock'),
    path('stock/<int:product_id>/receive/', views.stock_receive, name='stock_receive'),
    path('stock/<int:product_id>/reconcile/', views.stock_reconcile, name='stock_reconcile'),
    path('orders/', views.orders, name='orders'),
    path('orders/new/', views.order_create, name='order_create'),
    path('orders/<int:order_id>/edit/', views.order_create, name='order_edit'),
    path('orders/<int:order_id>/', views.order_detail, name='order_detail'),
    path('orders/<int:order_id>/confirm/', views.order_confirm, name='order_confirm'),
    path('orders/<int:order_id>/ship/', views.order_ship, name='order_ship'),
    path('orders/<int:order_id>/cancel/', views.order_cancel, name='order_cancel'),
]
