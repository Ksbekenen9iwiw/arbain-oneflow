from django.contrib.auth.views import LoginView, LogoutView
from django.urls import include, path
from crm.frontend import FrontendLoginView

handler403 = "crm.frontend.permission_denied"
handler404 = "crm.frontend.not_found"

urlpatterns = [path('login/', FrontendLoginView.as_view(), name='login'), path('logout/', LogoutView.as_view(), name='logout'), path('', include('crm.urls'))]
