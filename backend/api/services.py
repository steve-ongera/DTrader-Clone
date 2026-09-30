"""Business logic: pricing, buying/selling, contract settlement, wallet operations.
Everything that touches money is wrapped in transactions with row locks."""
import logging
import math
import time
from decimal import ROUND_HALF_UP, Decimal as D

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.core.cache import cache
from django.db import transaction

from .models import Account, Contract, Instrument, Transaction

log = logging.getLogger(__name__)
C, S, T = Contract.Type, Contract.Status, Transaction.Type

DIGIT_TYPES = {C.DIGITMATCH, C.DIGITDIFF, C.DIGITOVER, C.DIGITUNDER, C.DIGITEVEN, C.DIGITODD}
BARRIER_TYPES = {C.HIGHER, C.LOWER, C.TOUCH, C.NOTOUCH}
MULT_TYPES = {C.MULTUP, C.MULTDOWN}
ACCU_K = {1: 2.50, 2: 2.25, 3: 2.10, 4: 1.98, 5: 1.90}   # barrier half-width in tick-sigmas per growth %
MULTIPLIERS = (20, 50, 100, 200, 400)


class TradeError(Exception):
    pass


# ------------------------------------------------------------------ helpers
def money(x):
    return D(str(x)).quantize(D("0.01"), rounding=ROUND_HALF_UP)


def _phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def last_digit(price, decimals):
    return int(f"{price:.{decimals}f}"[-1])


def latest_tick(code):
    t = cache.get(f"tick:{code}")
    if not t:
        raise TradeError("Market is currently unavailable.")
    if time.time() - t["epoch"] > 30:
        raise TradeError("Market feed is stale, try again shortly.")
    return t


def duration_seconds(inst, n, unit):
    return {"t": n * inst.tick_interval, "s": n, "m": n * 60, "h": n * 3600, "d": n * 86400}[unit]


# ------------------------------------------------------------------ events (websocket push)
def balance_event(account):
    return (account.user_id, {"msg": "balance", "account_id": account.id,
                              "balance": str(account.balance), "currency": account.currency})


def contract_event(c):
    from .serializers import ContractSerializer
    return (c.account.user_id, {"msg": "contract", **dict(ContractSerializer(c).data)})


async def push_events_async(events):
    layer = get_channel_layer()
    for user_id, data in events:
        await layer.group_send(f"user.{user_id}", {"type": "user.event", "data": data})


def push_events(events):
    if events:
        async_to_sync(push_events_async)(events)


# ------------------------------------------------------------------ pricing
def _check_duration(ct, n, unit):
    if not n:
        raise TradeError("Duration is required.")
    if unit == "t":
        lo = 1 if ct in DIGIT_TYPES else 5
        if not lo <= n <= 10:
            raise TradeError(f"Tick duration must be between {lo} and 10.")
    else:
        if ct in DIGIT_TYPES:
            raise TradeError("Digit contracts only support tick durations.")
        secs = {"s": n, "m": n * 60, "h": n * 3600, "d": n * 86400}[unit]
        if not 15 <= secs <= 7 * 86400:
            raise TradeError("Duration must be between 15 seconds and 7 days.")


def _probability(ct, s, barrier, pred):
    if ct in (C.RISE, C.FALL, C.DIGITEVEN, C.DIGITODD):
        return 0.5
    if ct in (C.DIGITMATCH, C.DIGITDIFF, C.DIGITOVER, C.DIGITUNDER):
        if pred is None:
            raise TradeError("Last-digit prediction is required.")
        if ct == C.DIGITMATCH:
            return 0.1
        if ct == C.DIGITDIFF:
            return 0.9
        if ct == C.DIGITOVER:
            if not 0 <= pred <= 8:
                raise TradeError("Over prediction must be 0-8.")
            return (9 - pred) / 10
        if not 1 <= pred <= 9:
            raise TradeError("Under prediction must be 1-9.")
        return pred / 10
    if not barrier:
        raise TradeError("Barrier offset is required.")
    z = barrier / s
    if ct == C.HIGHER:
        p = 1 - _phi(z)
    elif ct == C.LOWER:
        p = _phi(z)
    else:
        touch = 2 * (1 - _phi(abs(z)))
        p = touch if ct == C.TOUCH else 1 - touch
    return min(max(p, 0.03), 0.95)


def quote(p, inst, spot):
    ct = p["contract_type"]
    stake = D(p["stake"])
    if not D(str(settings.MIN_STAKE)) <= stake <= D(str(settings.MAX_STAKE)):
        raise TradeError(f"Stake must be between {settings.MIN_STAKE} and {settings.MAX_STAKE}.")
    out = {"spot": spot, "stake": stake, "commission": D("0"), "payout": None, "ask_price": stake}

    if ct == C.ACCU:
        key = int(round((p.get("growth_rate") or 0) * 100))
        if key not in ACCU_K:
            raise TradeError("Growth rate must be 1%-5%.")
        out.update(growth_rate=key / 100, k=ACCU_K[key])
        return out

    if ct in MULT_TYPES:
        m = p.get("multiplier")
        if m not in MULTIPLIERS:
            raise TradeError(f"Multiplier must be one of {MULTIPLIERS}.")
        sl = p.get("stop_loss")
        if sl is not None and D(sl) > stake:
            raise TradeError("Stop loss cannot exceed the stake.")
        commission = money(stake * m * D(str(settings.MULTIPLIER_COMMISSION)))
        out.update(multiplier=m, commission=commission, ask_price=stake + commission)
        return out

    n, unit = p.get("duration"), p.get("duration_unit") or "t"
    _check_duration(ct, n, unit)
    secs = max(duration_seconds(inst, n, unit), 1.0)
    s = spot * inst.volatility * math.sqrt(secs)
    prob = _probability(ct, s, p.get("barrier"), p.get("prediction"))
    payout = money(stake / D(str(prob)) * (1 - D(str(settings.PAYOUT_MARGIN))))
    out.update(payout=max(payout, stake + D("0.01")), probability=round(prob, 4))
    return out


def get_quote(p):
    try:
        inst = Instrument.objects.get(code=p["symbol"], is_active=True)
    except Instrument.DoesNotExist:
        raise TradeError("Unknown symbol.")
    return quote(p, inst, latest_tick(inst.code)["quote"])


# ------------------------------------------------------------------ buy / sell
@transaction.atomic
def buy_contract(user, p):
    qs = Account.objects.select_for_update().filter(user=user, is_active=True)
    try:
        account = qs.get(pk=p["account_id"]) if p.get("account_id") else qs.get(account_type=Account.DEMO)
    except Account.DoesNotExist:
        raise TradeError("Account not found.")
    try:
        inst = Instrument.objects.get(code=p["symbol"], is_active=True)
    except Instrument.DoesNotExist:
        raise TradeError("Unknown symbol.")

    spot = latest_tick(inst.code)["quote"]
    q = quote(p, inst, spot)
    cost = q["ask_price"]
    if account.balance < cost:
        raise TradeError("Insufficient balance.")
    account.balance -= cost
    account.save(update_fields=["balance"])

    ct, unit, now = p["contract_type"], p.get("duration_unit") or "t", time.time()
    fixed = ct not in MULT_TYPES and ct != C.ACCU
    c = Contract.objects.create(
        account=account, instrument=inst, contract_type=ct, stake=q["stake"], buy_price=cost,
        payout=q["payout"] or D("0"), current_value=q["stake"] if not fixed else D("0"),
        duration=p.get("duration") if fixed else None, duration_unit=unit if fixed else "",
        barrier=p.get("barrier") if ct in BARRIER_TYPES else None,
        prediction=p.get("prediction") if ct in DIGIT_TYPES else None,
        multiplier=q.get("multiplier"), growth_rate=q.get("growth_rate"),
        take_profit=p.get("take_profit") if not fixed else None,
        stop_loss=p.get("stop_loss") if ct in MULT_TYPES else None,
        start_epoch=now,
        expiry_epoch=(now + duration_seconds(inst, p["duration"], unit)) if fixed and unit != "t" else None,
        meta={"spot_at_buy": spot, **({"k": q["k"]} if "k" in q else {})},
    )
    Transaction.objects.create(account=account, tx_type=T.BUY, amount=-cost, balance_after=account.balance,
                               status=Transaction.Status.COMPLETED, contract=c)
    return c, [balance_event(account), contract_event(c)]


@transaction.atomic
def sell_contract(user, contract_id):
    try:
        c = Contract.objects.select_for_update().select_related("instrument", "account") \
            .get(pk=contract_id, account__user=user)
    except Contract.DoesNotExist:
        raise TradeError("Contract not found.")
    if c.status != S.OPEN:
        raise TradeError("Contract is already closed.")
    if c.contract_type != C.ACCU and c.contract_type not in MULT_TYPES:
        raise TradeError("This contract cannot be sold early.")
    if c.entry_price is None:
        raise TradeError("Waiting for the entry tick.")
    tick = latest_tick(c.instrument.code)
    if c.contract_type != C.ACCU:          # refresh multiplier value at the latest tick
        c.current_value = _mult_value(c, tick["quote"])
    return c, _finalize(c, S.SOLD, c.current_value, tick["quote"], tick["epoch"], T.SALE)


# ------------------------------------------------------------------ settlement engine
def process_tick(code, price, epoch):
    """Called by the engine on every tick. Returns [(user_id, event)] to push."""
    events = []
    ids = list(Contract.objects.filter(instrument__code=code, status=S.OPEN).values_list("id", flat=True))
    for cid in ids:
        try:
            with transaction.atomic():
                c = Contract.objects.select_for_update().select_related("instrument", "account").get(pk=cid)
                if c.status == S.OPEN:
                    events += _advance(c, price, epoch)
        except Exception:
            log.exception("advance failed for contract %s", cid)
    return events


def _advance(c, price, epoch):
    ct = c.contract_type
    if c.entry_price is None:                       # first tick after purchase = entry spot
        c.entry_price, c.entry_epoch, c.ticks_elapsed = price, epoch, 0
        if ct in BARRIER_TYPES:
            c.meta["abs_barrier"] = price + c.barrier
        if ct == C.ACCU:
            _set_accu_barriers(c, price)
        c.save()
        return [contract_event(c)]
    c.ticks_elapsed += 1
    if ct == C.ACCU:
        return _advance_accu(c, price, epoch)
    if ct in MULT_TYPES:
        return _advance_mult(c, price, epoch)
    return _advance_fixed(c, price, epoch)


def _advance_fixed(c, price, epoch):
    ct = c.contract_type
    if ct in (C.TOUCH, C.NOTOUCH):
        b = c.meta["abs_barrier"]
        if (price >= b) if c.barrier > 0 else (price <= b):
            return _settle(c, ct == C.TOUCH, price, epoch)
    expired = (c.ticks_elapsed >= c.duration) if c.duration_unit == "t" else (epoch >= c.expiry_epoch)
    if expired:
        return _settle(c, _outcome(c, price), price, epoch)
    c.save(update_fields=["ticks_elapsed"])
    return [contract_event(c)]


def _outcome(c, price):
    ct, pred = c.contract_type, c.prediction
    if ct == C.RISE:
        return price > c.entry_price
    if ct == C.FALL:
        return price < c.entry_price
    if ct == C.HIGHER:
        return price > c.meta["abs_barrier"]
    if ct == C.LOWER:
        return price < c.meta["abs_barrier"]
    if ct == C.NOTOUCH:
        return True
    if ct == C.TOUCH:
        return False
    d = last_digit(price, c.instrument.decimals)
    return {C.DIGITMATCH: d == pred, C.DIGITDIFF: d != pred, C.DIGITOVER: d > (pred or 0),
            C.DIGITUNDER: d < (pred or 0), C.DIGITEVEN: d % 2 == 0, C.DIGITODD: d % 2 == 1}[ct]


def _settle(c, won, price, epoch):
    return _finalize(c, S.WON if won else S.LOST, c.payout if won else D("0"), price, epoch)


def _set_accu_barriers(c, price):
    inst = c.instrument
    rng = price * inst.volatility * math.sqrt(inst.tick_interval) * c.meta["k"]
    c.meta.update(prev=price, high=round(price + rng, inst.decimals + 2), low=round(price - rng, inst.decimals + 2))
    return rng


def _advance_accu(c, price, epoch):
    prev = c.meta["prev"]
    rng = prev * c.instrument.volatility * math.sqrt(c.instrument.tick_interval) * c.meta["k"]
    if abs(price - prev) > rng:                     # barrier breached
        return _finalize(c, S.LOST, D("0"), price, epoch)
    c.current_value = money(c.stake * D(str(1 + c.growth_rate)) ** c.ticks_elapsed)
    c.profit = c.current_value - c.buy_price
    _set_accu_barriers(c, price)
    if c.take_profit is not None and c.profit >= c.take_profit:
        return _finalize(c, S.WON, c.current_value, price, epoch)
    c.save()
    return [contract_event(c)]


def _mult_value(c, price):
    direction = 1 if c.contract_type == C.MULTUP else -1
    pl = float(c.stake) * c.multiplier * direction * (price / c.entry_price - 1)
    return money(max(float(c.stake) + pl, 0))


def _advance_mult(c, price, epoch):
    value = _mult_value(c, price)
    pl = value - c.stake
    if value <= 0:                                  # stop-out
        return _finalize(c, S.LOST, D("0"), price, epoch)
    if c.take_profit is not None and pl >= c.take_profit:
        return _finalize(c, S.WON, value, price, epoch)
    if c.stop_loss is not None and pl <= -c.stop_loss:
        return _finalize(c, S.SOLD, value, price, epoch)
    c.current_value, c.profit = value, value - c.buy_price
    c.save()
    return [contract_event(c)]


def _finalize(c, status, payout, price, epoch, tx_type=T.PAYOUT):
    payout = money(payout)
    c.status, c.exit_price, c.exit_epoch = status, price, epoch
    c.current_value, c.profit = payout, payout - c.buy_price
    events = []
    account = Account.objects.select_for_update().get(pk=c.account_id)
    if payout > 0:
        account.balance += payout
        account.save(update_fields=["balance"])
        Transaction.objects.create(account=account, tx_type=tx_type, amount=payout,
                                   balance_after=account.balance, status=Transaction.Status.COMPLETED, contract=c)
    c.account = account
    c.save()
    events.append(contract_event(c))
    if payout > 0:
        events.append(balance_event(account))
    return events


# ------------------------------------------------------------------ wallet
@transaction.atomic
def reset_demo(user, account_id):
    try:
        a = Account.objects.select_for_update().get(pk=account_id, user=user, account_type=Account.DEMO)
    except Account.DoesNotExist:
        raise TradeError("Demo account not found.")
    a.balance = money(settings.DEMO_BALANCE)
    a.save(update_fields=["balance"])
    return a, [balance_event(a)]


@transaction.atomic
def settle_deposit(tx_id, success, external_id=None):
    tx = Transaction.objects.select_for_update().get(pk=tx_id, tx_type=T.DEPOSIT)
    if tx.status != Transaction.Status.PENDING:     # idempotent: webhooks may repeat
        return tx, []
    if external_id:
        tx.external_id = external_id
    if not success:
        tx.status = Transaction.Status.FAILED
        tx.save()
        return tx, []
    account = Account.objects.select_for_update().get(pk=tx.account_id)
    account.balance += tx.amount
    account.save(update_fields=["balance"])
    tx.status, tx.balance_after = Transaction.Status.COMPLETED, account.balance
    tx.save()
    return tx, [balance_event(account)]


@transaction.atomic
def request_withdrawal(user, account_id, method, amount, destination):
    try:
        a = Account.objects.select_for_update().get(pk=account_id, user=user, account_type=Account.REAL)
    except Account.DoesNotExist:
        raise TradeError("Withdrawals are only available from your real account.")
    amount = D(amount)
    if a.balance < amount:
        raise TradeError("Insufficient balance.")
    # TODO (production): KYC check, deposit-method matching, daily limits, AML rules.
    a.balance -= amount
    a.save(update_fields=["balance"])
    tx = Transaction.objects.create(account=a, tx_type=T.WITHDRAWAL, method=method, amount=-amount,
                                    balance_after=a.balance, status=Transaction.Status.PENDING,
                                    meta={"destination": destination})
    tx.reference = f"W{tx.pk:08d}"
    tx.save(update_fields=["reference"])
    return tx, [balance_event(a)]


@transaction.atomic
def resolve_withdrawal(tx_id, success, external_id=None):
    tx = Transaction.objects.select_for_update().get(pk=tx_id, tx_type=T.WITHDRAWAL)
    if tx.status != Transaction.Status.PENDING:
        return tx, []
    if external_id:
        tx.external_id = external_id
    if success:
        tx.status = Transaction.Status.COMPLETED
        tx.save()
        return tx, []
    a = Account.objects.select_for_update().get(pk=tx.account_id)   # refund the hold
    a.balance += -tx.amount
    a.save(update_fields=["balance"])
    tx.status = Transaction.Status.FAILED
    tx.save()
    return tx, [balance_event(a)]
