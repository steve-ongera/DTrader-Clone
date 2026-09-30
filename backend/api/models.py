import random
import string
from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=15, blank=True, help_text="2547XXXXXXXX")
    country = models.CharField(max_length=2, default="KE")
    kyc_verified = models.BooleanField(default=False)

    REQUIRED_FIELDS = ["email"]


class Account(models.Model):
    DEMO, REAL = "demo", "real"
    TYPES = [(DEMO, "Demo"), (REAL, "Real")]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="accounts")
    account_type = models.CharField(max_length=4, choices=TYPES)
    login_id = models.CharField(max_length=16, unique=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal("0"))
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "account_type"], name="one_account_per_type")]

    def save(self, *args, **kwargs):
        if not self.login_id:
            prefix = "VRTC" if self.account_type == self.DEMO else "CR"
            self.login_id = prefix + "".join(random.choices(string.digits, k=8))
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.login_id} ({self.account_type})"


class Instrument(models.Model):
    SYNTHETIC, FOREX, COMMODITY, STOCK = "synthetic", "forex", "commodity", "stock"
    MARKETS = [(SYNTHETIC, "Derived / Synthetic"), (FOREX, "Forex"),
               (COMMODITY, "Commodities"), (STOCK, "Stocks")]
    KINDS = [("gbm", "Random walk"), ("boom", "Boom (spikes up)"), ("crash", "Crash (spikes down)")]

    code = models.CharField(max_length=20, unique=True)          # 1HZ100V, frxEURUSD, AAPL
    name = models.CharField(max_length=80)
    market = models.CharField(max_length=12, choices=MARKETS)
    submarket = models.CharField(max_length=40, blank=True)
    kind = models.CharField(max_length=6, choices=KINDS, default="gbm")
    spike_every = models.PositiveIntegerField(default=0)         # boom/crash: avg ticks between spikes
    base_price = models.FloatField()
    volatility = models.FloatField(help_text="Std-dev of relative move per sqrt(second)")
    tick_interval = models.FloatField(default=1.0)
    decimals = models.PositiveSmallIntegerField(default=2)
    is_active = models.BooleanField(default=True)
    sort = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort", "code"]

    def __str__(self):
        return self.code


class Candle(models.Model):
    """Only 1-minute candles are stored. Higher timeframes are aggregated on demand;
    sub-minute timeframes and ticks come from the engine's in-memory tick buffer."""
    instrument = models.ForeignKey(Instrument, on_delete=models.CASCADE, related_name="candles")
    open_time = models.BigIntegerField()
    open = models.FloatField()
    high = models.FloatField()
    low = models.FloatField()
    close = models.FloatField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["instrument", "open_time"], name="uniq_candle")]
        indexes = [models.Index(fields=["instrument", "-open_time"])]


class Contract(models.Model):
    class Type(models.TextChoices):
        RISE = "RISE"
        FALL = "FALL"
        HIGHER = "HIGHER"
        LOWER = "LOWER"
        TOUCH = "TOUCH"
        NOTOUCH = "NOTOUCH"
        ACCU = "ACCU"
        MULTUP = "MULTUP"
        MULTDOWN = "MULTDOWN"
        DIGITMATCH = "DIGITMATCH"
        DIGITDIFF = "DIGITDIFF"
        DIGITOVER = "DIGITOVER"
        DIGITUNDER = "DIGITUNDER"
        DIGITEVEN = "DIGITEVEN"
        DIGITODD = "DIGITODD"

    class Status(models.TextChoices):
        OPEN = "open"
        WON = "won"
        LOST = "lost"
        SOLD = "sold"

    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="contracts")
    instrument = models.ForeignKey(Instrument, on_delete=models.PROTECT, related_name="contracts")
    contract_type = models.CharField(max_length=12, choices=Type.choices)
    status = models.CharField(max_length=5, choices=Status.choices, default=Status.OPEN, db_index=True)

    stake = models.DecimalField(max_digits=14, decimal_places=2)
    buy_price = models.DecimalField(max_digits=14, decimal_places=2)    # stake (+ commission)
    payout = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))  # fixed-payout types
    current_value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    profit = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))

    duration = models.PositiveIntegerField(null=True, blank=True)
    duration_unit = models.CharField(max_length=1, blank=True)           # t s m h d
    barrier = models.FloatField(null=True, blank=True)                   # signed offset from entry
    prediction = models.PositiveSmallIntegerField(null=True, blank=True)  # digit 0-9
    multiplier = models.PositiveIntegerField(null=True, blank=True)
    growth_rate = models.FloatField(null=True, blank=True)
    take_profit = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    stop_loss = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    start_epoch = models.FloatField()
    entry_epoch = models.FloatField(null=True, blank=True)
    expiry_epoch = models.FloatField(null=True, blank=True)
    exit_epoch = models.FloatField(null=True, blank=True)
    entry_price = models.FloatField(null=True, blank=True)
    exit_price = models.FloatField(null=True, blank=True)
    ticks_elapsed = models.PositiveIntegerField(default=0)

    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        indexes = [models.Index(fields=["instrument", "status"])]


class Transaction(models.Model):
    class Type(models.TextChoices):
        DEPOSIT = "deposit"
        WITHDRAWAL = "withdrawal"
        BUY = "buy"
        PAYOUT = "payout"
        SALE = "sale"
        ADJUSTMENT = "adjustment"

    class Status(models.TextChoices):
        PENDING = "pending"
        COMPLETED = "completed"
        FAILED = "failed"

    class Method(models.TextChoices):
        MPESA = "mpesa"
        CARD = "card"
        PAYPAL = "paypal"
        BITCOIN = "bitcoin"
        INTERNAL = "internal"

    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="transactions")
    tx_type = models.CharField(max_length=10, choices=Type.choices)
    method = models.CharField(max_length=8, choices=Method.choices, default=Method.INTERNAL)
    amount = models.DecimalField(max_digits=14, decimal_places=2)       # signed
    balance_after = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.COMPLETED, db_index=True)
    reference = models.CharField(max_length=64, blank=True, db_index=True)
    external_id = models.CharField(max_length=128, blank=True, db_index=True)
    contract = models.ForeignKey(Contract, null=True, blank=True, on_delete=models.SET_NULL)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]


class Drawing(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="drawings")
    symbol = models.CharField(max_length=20, db_index=True)
    tool = models.CharField(max_length=20)    # trendline, ray, hline, vline, rect, fib, channel, text, brush, arrow
    points = models.JSONField(default=list)   # [{time, price}, ...]
    style = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
