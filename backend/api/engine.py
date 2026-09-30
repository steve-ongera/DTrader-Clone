"""Real-time market engine.

* One asyncio task per instrument generates ticks (0.5-2 s interval) with a stochastic model
  (random walk + volatility clustering + slight mean reversion; boom/crash spike processes).
* Each tick is: cached (for pricing), buffered (tick charts), aggregated into a 1-minute candle,
  broadcast to `ticks.<symbol>` websocket groups, and used to settle/advance open contracts.

Forex/commodity/stock prices are SIMULATED by default. To use a real feed, replace `step()`
in `MarketEngine._tick` with a call that reads the latest price from your data provider.
"""
import asyncio
import logging
import math
import random
import time
from collections import OrderedDict, deque

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.core.cache import cache
from django.http import Http404

from . import services
from .models import Candle, Instrument

log = logging.getLogger(__name__)
TICK_BUFFER = 5000
KAPPA = 2e-5          # log-price mean reversion speed per second


class SymbolState:
    def __init__(self, inst, price):
        self.inst_id, self.code = inst.id, inst.code
        self.kind, self.spike_every = inst.kind, inst.spike_every
        self.base, self.volatility = inst.base_price, inst.volatility
        self.interval, self.decimals = inst.tick_interval, inst.decimals
        self.price, self.vol = price, 1.0
        self.buffer = deque(maxlen=TICK_BUFFER)
        self.cur = None            # [open_time, o, h, l, c]


def step(st):
    dt = st.interval
    z = random.gauss(0, 1)
    st.vol = min(2.0, max(0.6, 0.98 * st.vol + 0.02 + 0.03 * (abs(z) - 0.8)))   # vol clustering
    sd = st.volatility * st.vol * math.sqrt(dt)
    r = sd * z - KAPPA * math.log(st.price / st.base) * dt
    if st.kind in ("boom", "crash") and st.spike_every:
        sign = 1 if st.kind == "boom" else -1
        r -= sign * sd * 11 / st.spike_every                                     # slow drift between spikes
        if random.random() < 1 / st.spike_every:
            r += sign * sd * random.uniform(8, 14)                               # spike
    st.price = round(st.price * math.exp(r), st.decimals)
    return st.price


def simulate_candles(inst, days):
    """Backfill 1-minute candles ending at base_price."""
    st = SymbolState(inst, inst.base_price)
    st.interval = 10.0
    now_min = int(time.time() // 60 * 60)
    n = days * 1440
    rows = []
    for i in range(n):
        o = st.price
        path = [step(st) for _ in range(6)]
        rows.append([now_min - (n - i) * 60, o, max(o, *path), min(o, *path), path[-1]])
    scale = inst.base_price / rows[-1][4]
    return [(t, o * scale, h * scale, l * scale, c * scale) for t, o, h, l, c in rows]


class MarketEngine:
    def __init__(self):
        self.symbols = {}
        self.running = False

    def start(self):
        if self.running:
            return
        self.running = True
        asyncio.get_running_loop().create_task(self._boot())

    async def _boot(self):
        instruments = await sync_to_async(list)(Instrument.objects.filter(is_active=True))
        for inst in instruments:
            st = await sync_to_async(self._init_state)(inst)
            self.symbols[inst.code] = st
            asyncio.create_task(self._run_symbol(st))
        log.info("Market engine started with %d instruments", len(instruments))

    def _init_state(self, inst):
        last = Candle.objects.filter(instrument=inst).order_by("-open_time").first()
        start = last.close if last else inst.base_price
        st = SymbolState(inst, start)
        n = 1200                                        # pre-fill tick history so charts are never empty
        ticks = [step(st) for _ in range(n)]
        scale = start / st.price
        st.price = start
        now = time.time()
        for i, p in enumerate(ticks):
            st.buffer.append((round(now - (n - i) * st.interval, 3), round(p * scale, st.decimals)))
        cache.set(f"tick:{st.code}", {"epoch": now, "quote": start}, 120)
        return st

    async def _run_symbol(self, st):
        next_t = time.time()
        while True:
            next_t += st.interval
            await asyncio.sleep(max(0.0, next_t - time.time()))
            if next_t < time.time() - 5:
                next_t = time.time()
            try:
                await self._tick(st)
            except Exception:
                log.exception("tick failed for %s", st.code)

    async def _tick(self, st):
        price, epoch = step(st), round(time.time(), 3)
        st.buffer.append((epoch, price))
        cache.set(f"tick:{st.code}", {"epoch": epoch, "quote": price}, 120)
        await self._update_candle(st, epoch, price)
        await get_channel_layer().group_send(f"ticks.{st.code}", {"type": "tick", "data": {
            "msg": "tick", "symbol": st.code, "epoch": epoch, "quote": price,
            "digit": services.last_digit(price, st.decimals)}})
        events = await sync_to_async(services.process_tick)(st.code, price, epoch)
        await services.push_events_async(events)

    async def _update_candle(self, st, epoch, price):
        minute = int(epoch // 60 * 60)
        if st.cur is None or st.cur[0] != minute:
            if st.cur is not None:
                await sync_to_async(self._save_candle)(st.inst_id, st.cur)
            st.cur = [minute, price, price, price, price]
        else:
            st.cur[2], st.cur[3], st.cur[4] = max(st.cur[2], price), min(st.cur[3], price), price

    @staticmethod
    def _save_candle(inst_id, c):
        Candle.objects.update_or_create(instrument_id=inst_id, open_time=c[0],
                                        defaults=dict(open=c[1], high=c[2], low=c[3], close=c[4]))


engine = MarketEngine()


# ------------------------------------------------------------------ history for charts
def _aggregate(rows, g):
    buckets = OrderedDict()
    for t, o, h, l, c in rows:
        b = int(t // g * g)
        if b in buckets:
            x = buckets[b]
            x[2], x[3], x[4] = max(x[2], h), min(x[3], l), c
        else:
            buckets[b] = [b, o, h, l, c]
    return list(buckets.values())


def build_history(code, granularity, count):
    st = engine.symbols.get(code)
    if st is None:
        raise Http404("Symbol not available")
    count = max(1, min(count, 5000))
    if granularity == 0:
        ticks = list(st.buffer)[-count:]
        return {"type": "ticks", "symbol": code, "times": [t for t, _ in ticks], "prices": [p for _, p in ticks]}
    if granularity < 60:
        rows = [(t, p, p, p, p) for t, p in st.buffer]
    else:
        need = min(count * granularity // 60 + granularity // 60 + 2, 60000)
        db = Candle.objects.filter(instrument_id=st.inst_id).order_by("-open_time")[:need]
        rows = [(c.open_time, c.open, c.high, c.low, c.close) for c in reversed(list(db))]
        if st.cur and (not rows or rows[-1][0] < st.cur[0]):
            rows.append(tuple(st.cur))
    candles = _aggregate(rows, granularity)[-count:]
    return {"type": "candles", "symbol": code, "granularity": granularity,
            "candles": [{"time": t, "open": o, "high": h, "low": l, "close": c} for t, o, h, l, c in candles]}
