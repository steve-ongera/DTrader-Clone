from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

router = DefaultRouter()
router.register("contracts", views.ContractViewSet, basename="contract")
router.register("drawings", views.DrawingViewSet, basename="drawing")

urlpatterns = [
    # auth & accounts
    path("auth/register/", views.RegisterView.as_view()),
    path("auth/login/", TokenObtainPairView.as_view()),        # {"username": <email>, "password": ...}
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    path("accounts/", views.AccountListView.as_view()),
    path("accounts/<int:pk>/reset-demo/", views.ResetDemoView.as_view()),
    path("time/", views.server_time),
    # market data
    path("symbols/", views.InstrumentListView.as_view()),
    path("symbols/<str:code>/history/", views.history),
    # trading
    path("trade/proposal/", views.ProposalView.as_view()),
    path("trade/buy/", views.BuyView.as_view()),
    path("trade/sell/<int:pk>/", views.SellView.as_view()),
    path("statement/", views.StatementView.as_view()),
    # cashier
    path("payments/deposit/", views.DepositView.as_view()),
    path("payments/withdraw/", views.WithdrawView.as_view()),
    path("payments/paypal/capture/", views.PayPalCaptureView.as_view()),
    path("payments/stripe/webhook/", views.stripe_webhook),
    path("payments/btcpay/webhook/", views.btcpay_webhook),
    path("payments/mpesa/callback/<str:secret>/", views.mpesa_callback),
    path("payments/mpesa/b2c-result/<str:secret>/", views.mpesa_b2c_result),
    path("payments/mpesa/b2c-timeout/<str:secret>/", views.mpesa_b2c_timeout),
    path("", include(router.urls)),
]
