from django.core.management.base import BaseCommand

from api.engine import simulate_candles
from api.models import Candle, Instrument

I = Instrument
# code, name, market, submarket, kind, spike_every, base, vol/sqrt(s), tick_s, decimals
ROWS = [
    ("1HZ10V", "Volatility 10 (1s) Index", I.SYNTHETIC, "Volatility", "gbm", 0, 6000.0, 4e-5, 1, 3),
    ("1HZ25V", "Volatility 25 (1s) Index", I.SYNTHETIC, "Volatility", "gbm", 0, 2500.0, 1e-4, 1, 3),
    ("1HZ50V", "Volatility 50 (1s) Index", I.SYNTHETIC, "Volatility", "gbm", 0, 250.0, 2e-4, 1, 4),
    ("1HZ75V", "Volatility 75 (1s) Index", I.SYNTHETIC, "Volatility", "gbm", 0, 4500.0, 3.5e-4, 1, 2),
    ("1HZ100V", "Volatility 100 (1s) Index", I.SYNTHETIC, "Volatility", "gbm", 0, 1040.0, 5e-4, 1, 2),
    ("R_10", "Volatility 10 Index", I.SYNTHETIC, "Volatility", "gbm", 0, 6000.0, 4e-5, 2, 3),
    ("R_50", "Volatility 50 Index", I.SYNTHETIC, "Volatility", "gbm", 0, 250.0, 2e-4, 2, 4),
    ("R_100", "Volatility 100 Index", I.SYNTHETIC, "Volatility", "gbm", 0, 1040.0, 5e-4, 2, 2),
    ("BOOM500", "Boom 500 Index", I.SYNTHETIC, "Crash/Boom", "boom", 500, 8000.0, 2e-4, 1, 3),
    ("BOOM1000", "Boom 1000 Index", I.SYNTHETIC, "Crash/Boom", "boom", 1000, 9000.0, 2e-4, 1, 3),
    ("CRASH500", "Crash 500 Index", I.SYNTHETIC, "Crash/Boom", "crash", 500, 7500.0, 2e-4, 1, 3),
    ("CRASH1000", "Crash 1000 Index", I.SYNTHETIC, "Crash/Boom", "crash", 1000, 8500.0, 2e-4, 1, 3),
    ("frxEURUSD", "EUR/USD", I.FOREX, "Major pairs", "gbm", 0, 1.0850, 2.5e-5, 1, 5),
    ("frxGBPUSD", "GBP/USD", I.FOREX, "Major pairs", "gbm", 0, 1.2700, 3e-5, 1, 5),
    ("frxUSDJPY", "USD/JPY", I.FOREX, "Major pairs", "gbm", 0, 150.00, 3e-5, 1, 3),
    ("frxAUDUSD", "AUD/USD", I.FOREX, "Major pairs", "gbm", 0, 0.6600, 3e-5, 1, 5),
    ("frxUSDCAD", "USD/CAD", I.FOREX, "Major pairs", "gbm", 0, 1.3600, 2.5e-5, 1, 5),
    ("frxUSDCHF", "USD/CHF", I.FOREX, "Major pairs", "gbm", 0, 0.8800, 2.5e-5, 1, 5),
    ("frxEURGBP", "EUR/GBP", I.FOREX, "Minor pairs", "gbm", 0, 0.8550, 2e-5, 1, 5),
    ("frxEURJPY", "EUR/JPY", I.FOREX, "Minor pairs", "gbm", 0, 162.50, 3.5e-5, 1, 3),
    ("frxXAUUSD", "Gold/USD", I.COMMODITY, "Metals", "gbm", 0, 2650.00, 3e-5, 1, 2),
    ("frxXAGUSD", "Silver/USD", I.COMMODITY, "Metals", "gbm", 0, 31.000, 5e-5, 1, 3),
    ("cmdWTI", "Oil WTI", I.COMMODITY, "Energy", "gbm", 0, 70.00, 5e-5, 1, 2),
    ("cmdBRENT", "Oil Brent", I.COMMODITY, "Energy", "gbm", 0, 74.00, 5e-5, 1, 2),
    ("AAPL", "Apple Inc.", I.STOCK, "US stocks", "gbm", 0, 230.00, 4e-5, 1, 2),
    ("TSLA", "Tesla Inc.", I.STOCK, "US stocks", "gbm", 0, 250.00, 8e-5, 1, 2),
    ("AMZN", "Amazon.com", I.STOCK, "US stocks", "gbm", 0, 185.00, 5e-5, 1, 2),
    ("MSFT", "Microsoft Corp.", I.STOCK, "US stocks", "gbm", 0, 420.00, 4e-5, 1, 2),
    ("GOOGL", "Alphabet Inc.", I.STOCK, "US stocks", "gbm", 0, 170.00, 4e-5, 1, 2),
    ("NVDA", "NVIDIA Corp.", I.STOCK, "US stocks", "gbm", 0, 120.00, 8e-5, 1, 2),
    ("META", "Meta Platforms", I.STOCK, "US stocks", "gbm", 0, 560.00, 5e-5, 1, 2),
    ("NFLX", "Netflix Inc.", I.STOCK, "US stocks", "gbm", 0, 700.00, 6e-5, 1, 2),
]


class Command(BaseCommand):
    help = "Create instruments and backfill 1-minute candles."

    def add_arguments(self, p):
        p.add_argument("--days", type=int, default=3)
        p.add_argument("--no-backfill", action="store_true")

    def handle(self, *a, **o):
        for i, r in enumerate(ROWS):
            code, name, mkt, sub, kind, spike, base, vol, tick, dec = r
            inst, _ = Instrument.objects.update_or_create(code=code, defaults=dict(
                name=name, market=mkt, submarket=sub, kind=kind, spike_every=spike, base_price=base,
                volatility=vol, tick_interval=tick, decimals=dec, sort=i))
            if not o["no_backfill"] and not Candle.objects.filter(instrument=inst).exists():
                rows = simulate_candles(inst, o["days"])
                Candle.objects.bulk_create([Candle(instrument=inst, open_time=t, open=op, high=h, low=l, close=c)
                                            for t, op, h, l, c in rows], batch_size=2000, ignore_conflicts=True)
            self.stdout.write(f"  {code}")
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(ROWS)} instruments."))
