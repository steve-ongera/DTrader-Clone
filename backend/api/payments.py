"""Provider clients: M-Pesa (Daraja), Stripe (cards), PayPal, BTCPay Server (Bitcoin)."""
import base64
import hashlib
import hmac
import math
import re
from datetime import datetime

import requests
import stripe
from django.conf import settings

TIMEOUT = 20


class PaymentError(Exception):
    pass


def _json(r):
    try:
        r.raise_for_status()
        return r.json()
    except (requests.RequestException, ValueError) as e:
        raise PaymentError(f"Payment provider error: {e}")


def normalize_phone(raw):
    p = re.sub(r"\D", "", raw or "")
    if p.startswith("0") and len(p) == 10:
        p = "254" + p[1:]
    elif len(p) == 9:
        p = "254" + p
    if not re.fullmatch(r"254[17]\d{8}", p):
        raise PaymentError("Enter a valid Safaricom number, e.g. 0712345678.")
    return p


def usd_to_kes(amount):
    return int(math.ceil(float(amount) * settings.KES_PER_USD))


def webhook_url(path):
    return f"{settings.PUBLIC_API_URL}/api/payments/{path}/{settings.PAYMENT_WEBHOOK_SECRET}/"


# ------------------------------------------------------------------ M-Pesa
def _mpesa_base():
    return "https://sandbox.safaricom.co.ke" if settings.MPESA_ENV == "sandbox" else "https://api.safaricom.co.ke"


def _mpesa_token():
    r = requests.get(f"{_mpesa_base()}/oauth/v1/generate?grant_type=client_credentials",
                     auth=(settings.MPESA_CONSUMER_KEY, settings.MPESA_CONSUMER_SECRET), timeout=TIMEOUT)
    return _json(r)["access_token"]


def mpesa_stk_push(tx, phone):
    phone = normalize_phone(phone)
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    pwd = base64.b64encode(f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{ts}".encode()).decode()
    payload = {
        "BusinessShortCode": settings.MPESA_SHORTCODE, "Password": pwd, "Timestamp": ts,
        "TransactionType": "CustomerPayBillOnline", "Amount": usd_to_kes(tx.amount),
        "PartyA": phone, "PartyB": settings.MPESA_SHORTCODE, "PhoneNumber": phone,
        "CallBackURL": webhook_url("mpesa/callback"), "AccountReference": tx.reference[:12],
        "TransactionDesc": "Deposit",
    }
    r = requests.post(f"{_mpesa_base()}/mpesa/stkpush/v1/processrequest", json=payload,
                      headers={"Authorization": f"Bearer {_mpesa_token()}"}, timeout=TIMEOUT)
    data = _json(r)
    if data.get("ResponseCode") != "0":
        raise PaymentError(data.get("errorMessage") or data.get("ResponseDescription", "STK push failed"))
    return data["CheckoutRequestID"]


def mpesa_b2c(tx, phone):
    phone = normalize_phone(phone)
    payload = {
        "OriginatorConversationID": tx.reference, "InitiatorName": settings.MPESA_INITIATOR,
        "SecurityCredential": settings.MPESA_SECURITY_CREDENTIAL, "CommandID": "BusinessPayment",
        "Amount": usd_to_kes(-tx.amount), "PartyA": settings.MPESA_SHORTCODE, "PartyB": phone,
        "Remarks": "Withdrawal", "QueueTimeOutURL": webhook_url("mpesa/b2c-timeout"),
        "ResultURL": webhook_url("mpesa/b2c-result"), "Occasion": tx.reference,
    }
    r = requests.post(f"{_mpesa_base()}/mpesa/b2c/v3/paymentrequest", json=payload,
                      headers={"Authorization": f"Bearer {_mpesa_token()}"}, timeout=TIMEOUT)
    data = _json(r)
    if data.get("ResponseCode") != "0":
        raise PaymentError(data.get("errorMessage") or data.get("ResponseDescription", "B2C failed"))


# ------------------------------------------------------------------ Card (Stripe)
def stripe_checkout(tx):
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        s = stripe.checkout.Session.create(
            mode="payment", client_reference_id=tx.reference,
            line_items=[{"quantity": 1, "price_data": {
                "currency": "usd", "unit_amount": int(tx.amount * 100),
                "product_data": {"name": "Account deposit"}}}],
            success_url=f"{settings.FRONTEND_URL}/cashier?status=success",
            cancel_url=f"{settings.FRONTEND_URL}/cashier?status=cancelled")
    except stripe.StripeError as e:
        raise PaymentError(str(e))
    return s.id, s.url


def stripe_event(payload, sig):
    try:
        return stripe.Webhook.construct_event(payload, sig, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError):
        raise PaymentError("Invalid Stripe signature")


# ------------------------------------------------------------------ PayPal
def _paypal_base():
    return "https://api-m.sandbox.paypal.com" if settings.PAYPAL_ENV == "sandbox" else "https://api-m.paypal.com"


def _paypal_headers():
    r = requests.post(f"{_paypal_base()}/v1/oauth2/token", data={"grant_type": "client_credentials"},
                      auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET), timeout=TIMEOUT)
    return {"Authorization": f"Bearer {_json(r)['access_token']}", "Content-Type": "application/json"}


def paypal_create_order(tx):
    body = {"intent": "CAPTURE", "purchase_units": [{
        "custom_id": tx.reference, "amount": {"currency_code": "USD", "value": f"{tx.amount:.2f}"}}],
        "application_context": {"return_url": f"{settings.FRONTEND_URL}/cashier?status=paypal",
                                "cancel_url": f"{settings.FRONTEND_URL}/cashier?status=cancelled"}}
    data = _json(requests.post(f"{_paypal_base()}/v2/checkout/orders", json=body,
                               headers=_paypal_headers(), timeout=TIMEOUT))
    approve = next(l["href"] for l in data["links"] if l["rel"] in ("approve", "payer-action"))
    return data["id"], approve


def paypal_capture(order_id):
    """Returns (custom_id/reference, captured_amount_str, status)."""
    data = _json(requests.post(f"{_paypal_base()}/v2/checkout/orders/{order_id}/capture",
                               headers=_paypal_headers(), timeout=TIMEOUT))
    unit = data["purchase_units"][0]
    cap = unit["payments"]["captures"][0]
    return unit.get("custom_id") or cap.get("custom_id"), cap["amount"]["value"], data["status"]


def paypal_payout(tx, email):
    body = {"sender_batch_header": {"sender_batch_id": tx.reference, "email_subject": "Your withdrawal"},
            "items": [{"recipient_type": "EMAIL", "receiver": email, "sender_item_id": tx.reference,
                       "amount": {"value": f"{-tx.amount:.2f}", "currency": "USD"}}]}
    return _json(requests.post(f"{_paypal_base()}/v1/payments/payouts", json=body,
                               headers=_paypal_headers(), timeout=TIMEOUT))["batch_header"]["payout_batch_id"]


# ------------------------------------------------------------------ Bitcoin (BTCPay Server)
def btcpay_invoice(tx):
    body = {"amount": f"{tx.amount:.2f}", "currency": "USD", "metadata": {"orderId": tx.reference},
            "checkout": {"redirectURL": f"{settings.FRONTEND_URL}/cashier?status=btc"}}
    data = _json(requests.post(f"{settings.BTCPAY_URL}/api/v1/stores/{settings.BTCPAY_STORE_ID}/invoices",
                               json=body, headers={"Authorization": f"token {settings.BTCPAY_API_KEY}"},
                               timeout=TIMEOUT))
    return data["id"], data["checkoutLink"]


def btcpay_verify(raw_body, sig_header):
    expected = "sha256=" + hmac.new(settings.BTCPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig_header or ""):
        raise PaymentError("Invalid BTCPay signature")


# ------------------------------------------------------------------ dispatch
def start_deposit(tx, user, data):
    m = tx.method
    if m == "mpesa":
        tx.external_id = mpesa_stk_push(tx, data.get("phone") or user.phone)
        tx.save(update_fields=["external_id"])
        return {"message": "Enter your M-Pesa PIN on your phone to complete the deposit."}
    if m == "card":
        tx.external_id, url = stripe_checkout(tx)
        tx.save(update_fields=["external_id"])
        return {"redirect_url": url}
    if m == "paypal":
        tx.external_id, url = paypal_create_order(tx)
        tx.save(update_fields=["external_id"])
        return {"order_id": tx.external_id, "redirect_url": url}
    tx.external_id, url = btcpay_invoice(tx)
    tx.save(update_fields=["external_id"])
    return {"redirect_url": url}


def start_withdrawal(tx):
    """Returns 'processing' (async provider callback will resolve), 'completed', or 'review' (manual)."""
    dest = tx.meta.get("destination", "")
    if settings.AUTO_PAYOUTS and tx.method == "mpesa":
        mpesa_b2c(tx, dest)
        return "processing"
    if settings.AUTO_PAYOUTS and tx.method == "paypal":
        tx.external_id = paypal_payout(tx, dest)
        tx.save(update_fields=["external_id"])
        return "completed"
    return "review"     # card / bitcoin (or AUTO_PAYOUTS off): approved by staff in Django admin
