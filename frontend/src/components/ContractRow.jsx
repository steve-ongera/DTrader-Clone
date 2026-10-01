import { CONTRACT_NAMES } from "../constants";
import { fmt, pnlClass, signed, useNow } from "../utils";

export default function ContractRow({ c, onSell }) {
  const open = c.status === "open";
  const now = useNow(1000);
  const sellable = open && (c.contract_type === "ACCU" || c.contract_type.startsWith("MULT")) && c.entry_price != null;
  let progress = "Waiting for entry…";
  if (c.entry_price != null && open) {
    if (c.duration_unit === "t") progress = `${c.ticks_elapsed}/${c.duration} ticks`;
    else if (c.expiry_epoch) progress = `${Math.max(0, Math.round(c.expiry_epoch - now / 1000))}s left`;
    else progress = `${c.ticks_elapsed} ticks`;
  }
  const live = c.contract_type === "ACCU" || c.contract_type.startsWith("MULT");
  const value = open ? (live ? c.profit : null) : c.profit;
  return (
    <div className="contract-row">
      <div className="flex-grow-1 min-w-0">
        <div className="d-flex justify-content-between">
          <strong>{CONTRACT_NAMES[c.contract_type]}{c.prediction != null ? ` ${c.prediction}` : ""}</strong>
          {open
            ? <span className="small text-body-secondary">{progress}</span>
            : <span className={`badge ${c.status === "won" ? "bg-success" : c.status === "lost" ? "bg-danger" : "bg-secondary"}`}>{c.status}</span>}
        </div>
        <div className="small text-body-secondary text-truncate">{c.symbol_name} · stake {fmt(c.buy_price)}</div>
      </div>
      <div className="text-end ms-3">
        {value != null
          ? <div className={`fw-semibold ${pnlClass(value)}`}>{signed(value)}</div>
          : <div className="small text-body-secondary">Payout {fmt(c.payout)}</div>}
        {sellable && <button className="btn btn-sm btn-outline-danger py-0 mt-1" onClick={() => onSell(c.id)}>Sell</button>}
      </div>
    </div>
  );
}
