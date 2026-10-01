import { useEffect, useState } from "react";
import { cashier, errorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTrading } from "../context/TradingContext";
import { fmt } from "../utils";

const METHODS = [
  { id: "mpesa", name: "M-Pesa", icon: "bi-phone", hint: "Phone number, e.g. 0712345678" },
  { id: "card", name: "Bank card", icon: "bi-credit-card", hint: "Card holder name / bank details" },
  { id: "paypal", name: "PayPal", icon: "bi-paypal", hint: "PayPal email address" },
  { id: "bitcoin", name: "Bitcoin", icon: "bi-currency-bitcoin", hint: "Bitcoin wallet address" },
];
const KES = Number(import.meta.env.VITE_KES_PER_USD || 129);

export default function CashierForm({ onDone }) {
  const { user } = useAuth();
  const { accounts, setAccountId, refreshAccounts, toast } = useTrading();
  const real = accounts.find((a) => a.account_type === "real");
  const [tab, setTab] = useState("deposit");
  const [method, setMethod] = useState("mpesa");
  const [amount, setAmount] = useState("10");
  const [phone, setPhone] = useState(user?.phone || "");
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { setMsg(null); }, [tab, method]);
  const m = METHODS.find((x) => x.id === method);

  const submit = async (e) => {
    e.preventDefault();
    if (!real) return;
    setBusy(true); setMsg(null);
    try {
      if (tab === "deposit") {
        const r = await cashier.deposit({ account_id: real.id, method, amount, phone: method === "mpesa" ? phone : undefined });
        if (r.redirect_url) { window.location.href = r.redirect_url; return; }
        setMsg({ ok: true, text: r.message });
      } else {
        const r = await cashier.withdraw({ account_id: real.id, method, amount, destination: method === "mpesa" ? phone : dest });
        setMsg({ ok: true, text: r.state === "review"
          ? "Withdrawal requested. It will be reviewed and paid shortly."
          : "Withdrawal is being processed." });
        refreshAccounts();
      }
      toast(tab === "deposit" ? "Deposit started" : "Withdrawal requested", "success");
      onDone?.();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally { setBusy(false); }
  };

  if (!real) return <p className="text-body-secondary">Loading accounts…</p>;
  return (
    <form onSubmit={submit}>
      <ul className="nav nav-underline mb-3">
        {["deposit", "withdraw"].map((t) => (
          <li className="nav-item" key={t}>
            <button type="button" className={`nav-link text-capitalize ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
          </li>
        ))}
      </ul>
      <div className="small text-body-secondary mb-3">
        {tab === "deposit" ? "Funds are added to your real account" : "Withdraw from your real account"} · balance <strong>{fmt(real.balance)} USD</strong>
        {real.account_type === "real" && tab === "deposit" && (
          <button type="button" className="btn btn-link btn-sm py-0" onClick={() => setAccountId(String(real.id))}>Switch to real</button>
        )}
      </div>

      <div className="row g-2 mb-3">
        {METHODS.map((x) => (
          <div className="col-6" key={x.id}>
            <button type="button" className={`method-card ${method === x.id ? "active" : ""}`} onClick={() => setMethod(x.id)}>
              <i className={`bi ${x.icon}`} /> {x.name}
            </button>
          </div>
        ))}
      </div>

      <label className="form-label small">Amount (USD)</label>
      <input type="number" min="1" step="0.01" className="form-control mb-2" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <div className="d-flex gap-2 mb-3">
        {[10, 25, 50, 100].map((v) => (
          <button type="button" key={v} className="btn btn-sm btn-outline-secondary" onClick={() => setAmount(String(v))}>${v}</button>
        ))}
      </div>
      {method === "mpesa" && Number(amount) > 0 && <div className="small text-body-secondary mb-2">≈ KES {fmt(Number(amount) * KES, 0)}</div>}

      {method === "mpesa" ? (
        <>
          <label className="form-label small">M-Pesa phone number</label>
          <input className="form-control mb-3" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={m.hint} required />
        </>
      ) : tab === "withdraw" ? (
        <>
          <label className="form-label small">Destination</label>
          <input className="form-control mb-3" value={dest} onChange={(e) => setDest(e.target.value)} placeholder={m.hint} required />
        </>
      ) : null}

      {msg && <div className={`alert py-2 ${msg.ok ? "alert-success" : "alert-danger"}`}>{msg.text}</div>}
      <button className="btn btn-danger w-100" disabled={busy}>
        {busy ? "Please wait…" : tab === "deposit" ? `Deposit with ${m.name}` : `Withdraw to ${m.name}`}
      </button>
    </form>
  );
}
