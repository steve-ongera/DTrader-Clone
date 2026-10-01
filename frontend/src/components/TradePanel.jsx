import { useEffect, useMemo, useRef, useState } from "react";
import { trade, errorMessage } from "../services/api";
import { useTrading } from "../context/TradingContext";
import { CATEGORIES, GROWTH_RATES, MULTIPLIERS, UNITS } from "../constants";
import { fmt, useNow } from "../utils";
import Stepper from "./Stepper";

const DUR = { t: { min: 5, max: 10, def: 5 }, s: { min: 15, max: 3600, def: 15 }, m: { min: 1, max: 1440, def: 1 }, h: { min: 1, max: 24, def: 1 }, d: { min: 1, max: 7, def: 1 } };

export default function TradePanel() {
  const { category, symbolInfo, tick, account, buyContract, wsOpen } = useTrading();
  const cat = CATEGORIES.find((c) => c.id === category);
  const [side, setSide] = useState(0);
  const [dur, setDur] = useState({ value: "5", unit: "t" });
  const [stake, setStake] = useState("2");
  const [barrier, setBarrier] = useState("");
  const [digit, setDigit] = useState(5);
  const [mult, setMult] = useState(100);
  const [growth, setGrowth] = useState(0.01);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [quote, setQuote] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  const now = useNow(1000);

  // reset per category
  useEffect(() => {
    setSide(0); setQuote(null); setErr("");
    if (cat.digits) setDur({ value: "1", unit: "t" });
    else setDur((d) => (d.unit === "t" && Number(d.value) < 5 ? { value: "5", unit: "t" } : d));
    if (cat.id === "over_under") setDigit(4);
    touched.current = false; setBarrier("");
  }, [cat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { touched.current = false; setBarrier(""); }, [symbolInfo?.code]);
  useEffect(() => {
    if (cat.barrier && tick && symbolInfo && !touched.current && barrier === "") setBarrier("+" + (tick.quote * 0.0004).toFixed(symbolInfo.decimals));
  }, [cat.barrier, tick, barrier, symbolInfo]);

  useEffect(() => {                         // keep digit within the valid range for Over/Under
    if (cat.id !== "over_under") return;
    if (side === 0 && digit > 8) setDigit(8);
    if (side === 1 && digit < 1) setDigit(1);
  }, [cat.id, side, digit]);

  const params = useMemo(() => {
    if (!symbolInfo) return null;
    const s = Number(stake);
    if (!(s > 0)) return null;
    const base = { symbol: symbolInfo.code, stake: s.toFixed(2), contract_type: cat.sides[side]?.[0] || cat.sides[0][0] };
    if (cat.kind === "accu") return { ...base, growth_rate: growth, ...(Number(tp) > 0 && { take_profit: Number(tp).toFixed(2) }) };
    if (cat.kind === "mult") return { ...base, multiplier: mult, ...(Number(tp) > 0 && { take_profit: Number(tp).toFixed(2) }), ...(Number(sl) > 0 && { stop_loss: Number(sl).toFixed(2) }) };
    const p = { ...base, duration: Number(dur.value) || undefined, duration_unit: dur.unit };
    if (cat.barrier && barrier !== "" && !Number.isNaN(parseFloat(barrier))) p.barrier = parseFloat(barrier);
    if (cat.pick) p.prediction = digit;
    return p;
  }, [symbolInfo, stake, cat, side, growth, mult, tp, sl, dur, barrier, digit]);

  const key = JSON.stringify(params);
  useEffect(() => {
    if (!params) { setQuote(null); return undefined; }
    let dead = false;
    const run = () => trade.proposal(params)
      .then((q) => { if (!dead) { setQuote(q); setErr(""); } })
      .catch((e) => { if (!dead) { setQuote(null); setErr(errorMessage(e)); } });
    const t = setTimeout(run, 250), iv = setInterval(run, 3000);
    return () => { dead = true; clearTimeout(t); clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onBuy = async () => {
    if (!params || !account) return;
    setBusy(true);
    try { await buyContract(params); setErr(""); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  const limits = DUR[dur.unit];
  const digitMin = cat.digits ? 1 : limits.min;
  const isDown = side === 1;
  const cost = quote ? Number(quote.ask_price) : null;

  return (
    <div className="trade-panel">
      <div className="panel-title">{cat.name} <i className="bi bi-info-circle text-body-secondary" title={cat.blurb} /></div>

      {cat.sides.length > 1 && (
        <div className="seg">
          {cat.sides.map(([, label], i) => (
            <button key={label} className={`${side === i ? "on" : ""} ${i === 0 ? "pos" : "neg"}`} onClick={() => setSide(i)}>{label}</button>
          ))}
        </div>
      )}

      {cat.kind === "fixed" && (
        <>
          <div className="field">
            <label className="field-label">Duration</label>
            <div className="d-flex gap-2">
              <select className="form-select unit-select" value={dur.unit} disabled={cat.digits}
                onChange={(e) => setDur({ unit: e.target.value, value: String(DUR[e.target.value].def) })}>
                {UNITS.map(([u, l]) => <option key={u} value={u}>{l}</option>)}
              </select>
              <div className="flex-grow-1">
                <Stepper label="" value={dur.value} onChange={(v) => setDur({ ...dur, value: v })} min={digitMin} max={limits.max} />
              </div>
            </div>
          </div>
          {cat.barrier && (
            <div className="field">
              <label className="field-label">Barrier offset <span className="text-body-secondary">(from entry spot, e.g. +0.50 or -0.50)</span></label>
              <input className="form-control" value={barrier} onChange={(e) => { touched.current = true; setBarrier(e.target.value.replace(/[^0-9.+-]/g, "")); }} />
            </div>
          )}
          {cat.pick && (
            <div className="field">
              <label className="field-label">Last digit prediction</label>
              <div className="digit-grid">
                {Array.from({ length: 10 }, (_, n) => {
                  const off = cat.id === "over_under" && ((side === 0 && n > 8) || (side === 1 && n < 1));
                  return <button key={n} disabled={off} className={digit === n ? "on" : ""} onClick={() => setDigit(n)}>{n}</button>;
                })}
              </div>
            </div>
          )}
        </>
      )}

      {cat.kind === "accu" && (
        <div className="field">
          <label className="field-label">Growth rate</label>
          <div className="chips">
            {GROWTH_RATES.map((g) => <button key={g} className={growth === g ? "on" : ""} onClick={() => setGrowth(g)}>{g * 100}%</button>)}
          </div>
          <small className="text-body-secondary d-block mt-2">Stake grows {growth * 100}% per tick while the price stays between the barriers. Sell any time.</small>
        </div>
      )}

      {cat.kind === "mult" && (
        <div className="field">
          <label className="field-label">Multiplier</label>
          <div className="chips">
            {MULTIPLIERS.map((m) => <button key={m} className={mult === m ? "on" : ""} onClick={() => setMult(m)}>x{m}</button>)}
          </div>
        </div>
      )}

      <Stepper label="Stake" value={stake} onChange={setStake} min={0.35} max={2000} step={1} prefix="$" decimals={2} />

      {(cat.kind === "accu" || cat.kind === "mult") && (
        <div className="row g-2">
          <div className="col"><Stepper label="Take profit (optional)" value={tp} onChange={setTp} min={0} step={1} prefix="$" decimals={2} /></div>
          {cat.kind === "mult" && <div className="col"><Stepper label="Stop loss (optional)" value={sl} onChange={setSl} min={0} max={Number(stake) || 2000} step={1} prefix="$" decimals={2} /></div>}
        </div>
      )}

      {cat.kind === "mult" && quote && <div className="small text-body-secondary mb-2">Commission ${fmt(quote.commission)} · total cost ${fmt(cost)}</div>}

      <button className={`buy-btn ${cat.kind === "fixed" ? (isDown ? "down" : "up") : cat.kind === "mult" && isDown ? "down" : "up"}`}
        disabled={busy || !quote || !account} onClick={onBuy}>
        <span className="fw-bold">{busy ? "Buying…" : cat.kind === "fixed" ? `Buy · ${cat.sides[side][1]}` : cat.kind === "accu" ? "Buy accumulator" : `Buy · ${cat.sides[side][1]}`}</span>
        <small>{quote ? (quote.payout ? `Payout $${fmt(quote.payout)}` : `Cost $${fmt(cost)}`) : "Getting price…"}</small>
      </button>
      {err && <div className="text-danger small mt-2">{err}</div>}
      {account?.account_type === "demo" && <div className="small text-body-secondary mt-2"><i className="bi bi-info-circle" /> Trading on your demo account with virtual funds.</div>}

      <div className="panel-footer">
        <span><i className={`bi bi-circle-fill ${wsOpen ? "text-success" : "text-danger"}`} style={{ fontSize: 9 }} /> {wsOpen ? "Live" : "Reconnecting"}</span>
        <span>{new Date(now).toISOString().slice(0, 10)} {new Date(now).toISOString().slice(11, 19)} GMT</span>
      </div>
    </div>
  );
}
