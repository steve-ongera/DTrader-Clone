import { useMemo, useState } from "react";
import Modal from "./Modal";
import { useTrading } from "../context/TradingContext";
import { MARKETS } from "../constants";

export default function SymbolSelector({ onClose }) {
  const { symbols, code, setCode } = useTrading();
  const [market, setMarket] = useState(symbols.find((s) => s.code === code)?.market || "synthetic");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return symbols.filter((s) => (term ? s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term) : s.market === market));
  }, [symbols, market, q]);
  const groups = list.reduce((acc, s) => { (acc[s.submarket || "Other"] ||= []).push(s); return acc; }, {});

  return (
    <Modal title="Select market" onClose={onClose}>
      <div className="input-group mb-3">
        <span className="input-group-text"><i className="bi bi-search" /></span>
        <input className="form-control" placeholder="Search markets" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {!q && (
        <ul className="nav nav-pills mb-3 gap-1">
          {MARKETS.map(([id, label]) => (
            <li key={id} className="nav-item">
              <button className={`nav-link py-1 ${market === id ? "active" : ""}`} onClick={() => setMarket(id)}>{label}</button>
            </li>
          ))}
        </ul>
      )}
      {Object.entries(groups).map(([sub, items]) => (
        <div key={sub} className="mb-3">
          <div className="small text-body-secondary mb-1">{sub}</div>
          <div className="list-group">
            {items.map((s) => (
              <button key={s.code} className={`list-group-item list-group-item-action d-flex justify-content-between ${s.code === code ? "active" : ""}`}
                onClick={() => { setCode(s.code); onClose(); }}>
                <span>{s.name}</span><small className="opacity-75">{s.code}</small>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!list.length && <p className="text-body-secondary mb-0">No markets match your search.</p>}
    </Modal>
  );
}
