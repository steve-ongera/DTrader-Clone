import hmac
import json
import time
import uuid

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, viewsets
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import payments, services
from .engine import build_history
from .models import Account, Contract, Drawing, Instrument, Transaction
from .serializers import (AccountSerializer, ContractSerializer, DepositSerializer, DrawingSerializer,
                          InstrumentSerializer, RegisterSerializer, TradeRequestSerializer,
                          TransactionSerializer, UserSerializer, WithdrawSerializer)

TX = Transaction


def err(msg, code=400):
    return Response({"detail": str(msg)}, status=code)


# ------------------------------------------------------------------ auth / accounts
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        return Response(UserSerializer(user).data, status=201)


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class AccountListView(generics.ListAPIView):
    serializer_class = AccountSerializer
    pagination_class = None

    def get_queryset(self):
        return Account.objects.filter(user=self.request.user, is_active=True).order_by("account_type")


class ResetDemoView(APIView):
    def post(self, request, pk):
        try:
            account, events = services.reset_demo(request.user, pk)
        except services.TradeError as e:
            return err(e)
        services.push_events(events)
        return Response(AccountSerializer(account).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def server_time(request):
    return Response({"time": time.time()})


# ------------------------------------------------------------------ market data
class InstrumentListView(generics.ListAPIView):
    serializer_class = InstrumentSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    queryset = Instrument.objects.filter(is_active=True)


@api_view(["GET"])
@permission_classes([AllowAny])
def history(request, code):
    """?granularity=0 (ticks) | 1,2,5,10,15,30 | 60,120,180,300,600,900,1800,3600,7200,14400,28800,86400  &count=500"""
    try:
        g, n = int(request.query_params.get("granularity", 0)), int(request.query_params.get("count", 500))
    except ValueError:
        return err("Invalid parameters")
    return Response(build_history(code, g, n))


# ------------------------------------------------------------------ trading
class ProposalView(APIView):
    def post(self, request):
        s = TradeRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            q = services.get_quote(s.validated_data)
        except services.TradeError as e:
            return err(e)
        return Response({k: (str(v) if hasattr(v, "quantize") else v) for k, v in q.items()})


class BuyView(APIView):
    def post(self, request):
        s = TradeRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            contract, events = services.buy_contract(request.user, s.validated_data)
        except services.TradeError as e:
            return err(e)
        services.push_events(events)
        return Response(ContractSerializer(contract).data, status=201)


class SellView(APIView):
    def post(self, request, pk):
        try:
            contract, events = services.sell_contract(request.user, pk)
        except services.TradeError as e:
            return err(e)
        services.push_events(events)
        return Response(ContractSerializer(contract).data)


class ContractViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ContractSerializer

    def get_queryset(self):
        qs = Contract.objects.filter(account__user=self.request.user).select_related("instrument")
        if self.request.query_params.get("account"):
            qs = qs.filter(account_id=self.request.query_params["account"])
        st = self.request.query_params.get("status")
        if st == "open":
            qs = qs.filter(status=Contract.Status.OPEN)
        elif st == "closed":
            qs = qs.exclude(status=Contract.Status.OPEN)
        return qs


class StatementView(generics.ListAPIView):
    serializer_class = TransactionSerializer

    def get_queryset(self):
        qs = Transaction.objects.filter(account__user=self.request.user)
        if self.request.query_params.get("account"):
            qs = qs.filter(account_id=self.request.query_params["account"])
        if self.request.query_params.get("type"):
            qs = qs.filter(tx_type=self.request.query_params["type"])
        return qs


class DrawingViewSet(viewsets.ModelViewSet):
    serializer_class = DrawingSerializer

    def get_queryset(self):
        qs = Drawing.objects.filter(user=self.request.user)
        if self.request.query_params.get("symbol"):
            qs = qs.filter(symbol=self.request.query_params["symbol"])
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ------------------------------------------------------------------ cashier
class DepositView(APIView):
    def post(self, request):
        s = DepositSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        account = get_object_or_404(Account, pk=d["account_id"], user=request.user, account_type=Account.REAL)
        tx = Transaction.objects.create(account=account, tx_type=TX.Type.DEPOSIT, method=d["method"],
                                        amount=d["amount"], status=TX.Status.PENDING,
                                        reference=uuid.uuid4().hex[:20])
        try:
            data = payments.start_deposit(tx, request.user, d)
        except payments.PaymentError as e:
            tx.status = TX.Status.FAILED
            tx.save(update_fields=["status"])
            return err(e)
        return Response({"reference": tx.reference, **data}, status=201)


class WithdrawView(APIView):
    def post(self, request):
        s = WithdrawSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        try:
            tx, events = services.request_withdrawal(request.user, d["account_id"], d["method"],
                                                     d["amount"], d["destination"])
        except services.TradeError as e:
            return err(e)
        services.push_events(events)
        try:
            state = payments.start_withdrawal(tx)
        except payments.PaymentError as e:
            _, ev = services.resolve_withdrawal(tx.pk, False)
            services.push_events(ev)
            return err(e)
        if state == "completed":
            services.resolve_withdrawal(tx.pk, True)
        return Response({"reference": tx.reference, "state": state}, status=201)


def _secret_ok(secret):
    return hmac.compare_digest(secret, settings.PAYMENT_WEBHOOK_SECRET)


def _ok():
    return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def mpesa_callback(request, secret):
    if not _secret_ok(secret):
        return err("Forbidden", 403)
    cb = request.data.get("Body", {}).get("stkCallback", {})
    tx = Transaction.objects.filter(tx_type=TX.Type.DEPOSIT, method="mpesa",
                                    external_id=cb.get("CheckoutRequestID", "")).first()
    if tx:
        ok = cb.get("ResultCode") == 0
        if ok:   # verify the amount paid matches what we asked for
            items = {i["Name"]: i.get("Value") for i in cb.get("CallbackMetadata", {}).get("Item", [])}
            ok = float(items.get("Amount", 0)) >= payments.usd_to_kes(tx.amount)
            tx.meta = {**tx.meta, "mpesa_receipt": items.get("MpesaReceiptNumber")}
            tx.save(update_fields=["meta"])
        _, events = services.settle_deposit(tx.pk, ok)
        services.push_events(events)
    return _ok()


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def mpesa_b2c_result(request, secret):
    if not _secret_ok(secret):
        return err("Forbidden", 403)
    res = request.data.get("Result", {})
    tx = Transaction.objects.filter(tx_type=TX.Type.WITHDRAWAL, reference=res.get("OriginatorConversationID", "")).first()
    if tx:
        _, events = services.resolve_withdrawal(tx.pk, res.get("ResultCode") == 0, res.get("TransactionID"))
        services.push_events(events)
    return _ok()


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def mpesa_b2c_timeout(request, secret):
    return _ok() if _secret_ok(secret) else err("Forbidden", 403)   # stays pending; staff reconcile


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def stripe_webhook(request):
    try:
        event = payments.stripe_event(request.body, request.META.get("HTTP_STRIPE_SIGNATURE", ""))
    except payments.PaymentError as e:
        return err(e)
    if event["type"] == "checkout.session.completed":
        s = event["data"]["object"]
        tx = Transaction.objects.filter(tx_type=TX.Type.DEPOSIT, method="card",
                                        reference=s.get("client_reference_id", "")).first()
        if tx and s.get("payment_status") == "paid" and s.get("amount_total") == int(tx.amount * 100):
            _, events = services.settle_deposit(tx.pk, True)
            services.push_events(events)
    return Response({"received": True})


class PayPalCaptureView(APIView):
    """Frontend calls this after the buyer approves the order on PayPal."""
    def post(self, request):
        order_id = request.data.get("order_id", "")
        tx = get_object_or_404(Transaction, tx_type=TX.Type.DEPOSIT, method="paypal",
                               external_id=order_id, account__user=request.user)
        try:
            ref, amount, st = payments.paypal_capture(order_id)
        except payments.PaymentError as e:
            return err(e)
        ok = st == "COMPLETED" and ref == tx.reference and float(amount) == float(tx.amount)
        tx, events = services.settle_deposit(tx.pk, ok)
        services.push_events(events)
        return Response({"status": tx.status})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def btcpay_webhook(request):
    try:
        payments.btcpay_verify(request.body, request.META.get("HTTP_BTCPAY_SIG", ""))
    except payments.PaymentError as e:
        return err(e, 403)
    body = json.loads(request.body or b"{}")
    tx = Transaction.objects.filter(tx_type=TX.Type.DEPOSIT, method="bitcoin",
                                    external_id=body.get("invoiceId", "")).first()
    if tx and body.get("type") == "InvoiceSettled":
        _, events = services.settle_deposit(tx.pk, True)
        services.push_events(events)
    elif tx and body.get("type") in ("InvoiceExpired", "InvoiceInvalid"):
        services.settle_deposit(tx.pk, False)
    return Response({"received": True})
