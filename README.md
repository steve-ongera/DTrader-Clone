# DTrader Clone — Django + React (Vite)

A real-time binary/derivatives trading platform modelled on Deriv's DTrader.
One Django API app (`api`), one React SPA, one WebSocket for ticks + private account events.

> ⚠️ **Legal notice.** Offering real-money Rise/Fall, digits, accumulators or multipliers to the public is a
> regulated activity (in Kenya: CMA for forex/CFDs, BCLB for gaming/betting-style products; and card/PayPal/crypto
> processors have their own restricted-business rules). Get legal advice and licences **before** enabling the real
> account with live payment keys. Everything below works safely in demo mode.

## Features
| Area | What is implemented |
|---|---|
| Contracts | Rise/Fall, Higher/Lower, Touch/No Touch, Accumulators, Multipliers (Up/Down, TP/SL, stop-out), Digits: Matches/Differs, Over/Under, Even/Odd |
| Markets | Synthetics (Volatility 10–100, 1s variants, Boom/Crash), Forex, Commodities, Stocks (32 instruments, seedable) |
| Real time | Per-instrument tick generator → WebSocket push; contracts settle on the tick; balance updates pushed instantly |
| Accounts | Demo (resettable, $10,000) + Real; switch from the top bar |
| Charts (frontend) | Area/Line/Candle/OHLC, tick + 1s…1d intervals, drawing tools (trendline, ray, H/V line, rectangle, Fibonacci, channel, text) persisted per user/symbol |
| Cashier | M-Pesa (Daraja STK push + B2C), Card (Stripe Checkout), PayPal (Orders v2 + Payouts), Bitcoin (BTCPay Server); admin-approved withdrawals |

## Project structure
```
deriv-clone/
├── README.md
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── config/
│   │   ├── settings.py            # env-driven; Redis optional
│   │   ├── urls.py                # admin/ + api/
│   │   ├── asgi.py                # HTTP + WebSocket router, starts embedded engine
│   │   └── wsgi.py
│   └── api/                       # the ONE application
│       ├── models.py              # User, Account, Instrument, Candle, Contract, Transaction, Drawing
│       ├── serializers.py
│       ├── services.py            # pricing, buy/sell, settlement, wallet (all money logic, row-locked)
│       ├── engine.py              # tick generator, candle aggregation, history builder
│       ├── payments.py            # M-Pesa, Stripe, PayPal, BTCPay clients
│       ├── consumers.py           # /ws/market/ (ticks + user events)
│       ├── routing.py
│       ├── views.py               # REST endpoints + payment webhooks
│       ├── urls.py
│       ├── admin.py               # withdrawal approve/reject actions
│       ├── migrations/0001_initial.py
│       └── management/commands/
│           ├── seed_market.py     # instruments + candle backfill
│           └── run_engine.py      # standalone engine (scale-out mode)
└── frontend/                      # (scaffold included; components/pages are the next step)
    ├── index.html                 # Bootstrap Icons CDN
    ├── package.json  vite.config.js  .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── services/   api.js  socket.js
        ├── context/    AuthContext.jsx  TradingContext.jsx      (next)
        ├── components/ TopBar, SymbolSelector, ChartToolbar, PriceChart, DrawingLayer,
        │               TradePanel, ContractTypeMenu, PositionsDrawer, AccountSwitcher,
        │               CashierModal                              (next)
        └── pages/      Trade, Login, Register, Positions, Reports, Cashier   (next)
```

## Run it
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_market --days 3        # instruments + 3 days of 1m candles
python manage.py createsuperuser
daphne -b 0.0.0.0 -p 8000 config.asgi:application    # do NOT use runserver for websockets

cd ../frontend
cp .env.example .env && npm install && npm run dev      # http://localhost:5173
```

## Architecture
```
 React ──REST (JWT)──▶ views.py ─▶ services.py ─▶ DB
   ▲                                   ▲
   └──WebSocket /ws/market/?token=…    │ process_tick()
            ▲                          │
            └── channel layer ◀── engine.py (1 asyncio task / instrument)
```
* **Tick loop** (`engine.py`): log-price random walk + volatility clustering + slow mean reversion; Boom/Crash add
  spike processes. Each tick → cache → buffer (5,000) → 1m candle → `ticks.<symbol>` group → `process_tick()`.
* **Entry spot** is the first tick *after* purchase (as on Deriv). Tick contracts count ticks after entry.
* **Pricing**: `payout = stake / P(win) × (1 − PAYOUT_MARGIN)`. Rise/Fall $2 → $3.80 (matches the screenshot).
  Higher/Lower and Touch use a normal / reflection-principle probability from the instrument's volatility.
* **Accumulators**: barrier = previous tick ± k·σ (k by growth rate); stake compounds each surviving tick; sell any time.
* **Multipliers**: P/L = stake × multiplier × Δ%; stop-out at −stake; optional TP/SL; commission on open.
* **Money safety**: `Decimal` everywhere, `select_for_update` on accounts/contracts/transactions, idempotent webhooks,
  webhook secrets/signatures, amount verification (M-Pesa, Stripe, PayPal), withdrawals hold funds immediately.
* **Scaling**: dev mode embeds the engine in the ASGI process (in-memory layer). For production set `REDIS_URL`,
  `ENGINE_EMBEDDED=0`, run `python manage.py run_engine` once and any number of web workers.
  (Tick *history* endpoint reads the engine's memory, so keep history on the engine host or move the buffer to Redis.)
* **Prices are simulated** (like Deriv's synthetics). For real forex/commodity/stock prices, feed `engine._tick`
  from a provider (Twelve Data, Finnhub, Polygon) and respect market hours.

## REST API (prefix `/api`)
| Method | Path | Notes |
|---|---|---|
| POST | `auth/register/`, `auth/login/`, `auth/refresh/` | login body `{username: <email>, password}` |
| GET | `auth/me/`, `accounts/`, POST `accounts/<id>/reset-demo/` | |
| GET | `symbols/`, `symbols/<code>/history/?granularity=0\|1..86400&count=500` | 0 = ticks |
| POST | `trade/proposal/`, `trade/buy/`, `trade/sell/<id>/` | body below |
| GET | `contracts/?status=open\|closed&account=<id>`, `statement/?type=&account=` | |
| CRUD | `drawings/?symbol=` | drawing tools persistence |
| POST | `payments/deposit/`, `payments/withdraw/`, `payments/paypal/capture/` | |
| POST | `payments/mpesa/callback/<secret>/`, `…/b2c-result/<secret>/`, `payments/stripe/webhook/`, `payments/btcpay/webhook/` | provider → server |

Trade body: `{account_id, symbol, contract_type, stake, duration, duration_unit(t|s|m|h|d), barrier, prediction, multiplier, growth_rate, take_profit, stop_loss}`
(only the fields a contract type needs). `barrier` is a signed **offset** from entry (e.g. `+0.50`).

## WebSocket `/ws/market/?token=<access JWT>`
Client → `{"action":"subscribe","symbols":["1HZ100V"]}` · `unsubscribe` · `ping`
Server → `{"msg":"tick","symbol","epoch","quote","digit"}` · `{"msg":"contract",…}` · `{"msg":"balance",…}`

## Roadmap
1. Frontend components/pages (next message): chart with smooth interpolation, drawing layer, trade panel per contract type.
2. Payments go-live checklist: KYC, AML limits, withdrawal method matching, reconciliation job for pending transactions.
3. Real feeds, market hours, deal cancellation, tests (pytest) and Dockerfile/compose.
