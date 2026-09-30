from decimal import Decimal

from django.conf import settings
from rest_framework import serializers

from .models import Account, Contract, Drawing, Instrument, Transaction, User


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=15)
    country = serializers.CharField(required=False, max_length=2, default="KE")

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def create(self, data):
        user = User.objects.create_user(
            username=data["email"], email=data["email"], password=data["password"],
            phone=data.get("phone", ""), country=data.get("country", "KE"))
        Account.objects.create(user=user, account_type=Account.DEMO,
                               balance=Decimal(str(settings.DEMO_BALANCE)))
        Account.objects.create(user=user, account_type=Account.REAL)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "phone", "country", "kyc_verified"]


class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ["id", "login_id", "account_type", "currency", "balance"]


class InstrumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Instrument
        fields = ["code", "name", "market", "submarket", "decimals", "tick_interval", "kind"]


class TradeRequestSerializer(serializers.Serializer):
    account_id = serializers.IntegerField(required=False)
    symbol = serializers.CharField()
    contract_type = serializers.ChoiceField(choices=Contract.Type.choices)
    stake = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    duration = serializers.IntegerField(required=False, min_value=1)
    duration_unit = serializers.ChoiceField(choices=["t", "s", "m", "h", "d"], default="t")
    barrier = serializers.FloatField(required=False)
    prediction = serializers.IntegerField(required=False, min_value=0, max_value=9)
    multiplier = serializers.IntegerField(required=False)
    growth_rate = serializers.FloatField(required=False)
    take_profit = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=Decimal("0.01"))
    stop_loss = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=Decimal("0.01"))


class ContractSerializer(serializers.ModelSerializer):
    symbol = serializers.CharField(source="instrument.code", read_only=True)
    symbol_name = serializers.CharField(source="instrument.name", read_only=True)

    class Meta:
        model = Contract
        fields = ["id", "symbol", "symbol_name", "contract_type", "status", "stake", "buy_price", "payout",
                  "current_value", "profit", "duration", "duration_unit", "barrier", "prediction",
                  "multiplier", "growth_rate", "take_profit", "stop_loss", "start_epoch", "entry_epoch",
                  "expiry_epoch", "exit_epoch", "entry_price", "exit_price", "ticks_elapsed", "meta",
                  "account"]


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = ["id", "tx_type", "method", "amount", "balance_after", "status", "reference",
                  "contract", "created_at"]


class DepositSerializer(serializers.Serializer):
    account_id = serializers.IntegerField()
    method = serializers.ChoiceField(choices=["mpesa", "card", "paypal", "bitcoin"])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2,
                                      min_value=Decimal(str(settings.MIN_DEPOSIT)))
    phone = serializers.CharField(required=False, allow_blank=True)


class WithdrawSerializer(serializers.Serializer):
    account_id = serializers.IntegerField()
    method = serializers.ChoiceField(choices=["mpesa", "card", "paypal", "bitcoin"])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2,
                                      min_value=Decimal(str(settings.MIN_WITHDRAWAL)))
    destination = serializers.CharField(max_length=200,
                                        help_text="Phone (mpesa), email (paypal), BTC address, or bank/card details")


class DrawingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Drawing
        fields = ["id", "symbol", "tool", "points", "style", "created_at"]
        read_only_fields = ["id", "created_at"]
