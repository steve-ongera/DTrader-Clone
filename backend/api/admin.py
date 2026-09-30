from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin

from . import services
from .models import Account, Candle, Contract, Drawing, Instrument, Transaction, User


@admin.register(User)
class AppUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Profile", {"fields": ("phone", "country", "kyc_verified")}),)
    list_display = ("email", "phone", "country", "kyc_verified", "is_staff")


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("login_id", "user", "account_type", "balance", "currency", "is_active")
    list_filter = ("account_type",)
    search_fields = ("login_id", "user__email")


@admin.register(Instrument)
class InstrumentAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "market", "kind", "volatility", "tick_interval", "is_active")
    list_filter = ("market", "is_active")
    list_editable = ("is_active",)


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = ("id", "account", "instrument", "contract_type", "stake", "profit", "status", "created_at")
    list_filter = ("status", "contract_type")
    readonly_fields = [f.name for f in Contract._meta.fields]


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("id", "account", "tx_type", "method", "amount", "status", "reference", "created_at")
    list_filter = ("tx_type", "method", "status")
    search_fields = ("reference", "external_id", "account__user__email")
    actions = ["approve_withdrawals", "reject_withdrawals"]

    @admin.action(description="Mark selected withdrawals PAID (after sending funds manually)")
    def approve_withdrawals(self, request, qs):
        for tx in qs.filter(tx_type="withdrawal", status="pending"):
            services.resolve_withdrawal(tx.pk, True)
        self.message_user(request, "Withdrawals marked as paid.", messages.SUCCESS)

    @admin.action(description="Reject selected withdrawals and refund the account")
    def reject_withdrawals(self, request, qs):
        for tx in qs.filter(tx_type="withdrawal", status="pending"):
            _, events = services.resolve_withdrawal(tx.pk, False)
            services.push_events(events)
        self.message_user(request, "Withdrawals rejected and refunded.", messages.WARNING)


admin.site.register(Candle)
admin.site.register(Drawing)
