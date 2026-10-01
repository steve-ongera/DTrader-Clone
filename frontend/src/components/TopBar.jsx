import AccountSwitcher from "./AccountSwitcher";
import { useTrading } from "../context/TradingContext";
import { CATEGORIES } from "../constants";

export default function TopBar({ trade, onSymbols, onTypes, onPositions, onDeposit }) {
  const { symbolInfo, category, openContracts } = useTrading();
  const cat = CATEGORIES.find((c) => c.id === category);
  const count = Object.keys(openContracts).length;
  return (
    <header className="topbar">
      {trade ? (
        <div className="d-flex gap-2 min-w-0">
          <button className="tab-btn" onClick={onSymbols}>
            <i className="bi bi-activity fs-4 text-danger" />
            <div className="text-start min-w-0">
              <div className="fw-semibold text-truncate">{symbolInfo?.name || "Select market"}</div>
              <div className="small text-body-secondary">Market <i className="bi bi-chevron-down" /></div>
            </div>
          </button>
          <button className="tab-btn" onClick={onTypes}>
            <i className={`bi ${cat.icon} fs-4`} />
            <div className="text-start">
              <div className="fw-semibold">{cat.name}</div>
              <div className="small text-body-secondary">Trade type <i className="bi bi-chevron-down" /></div>
            </div>
          </button>
        </div>
      ) : <div />}
      <div className="ms-auto d-flex align-items-center gap-3">
        <button className="btn btn-outline-secondary position-relative" onClick={onPositions}>
          <i className="bi bi-clock-history" /> <span className="d-none d-md-inline">Positions</span>
          {count > 0 && <span className="badge rounded-pill bg-danger ms-1">{count}</span>}
        </button>
        <AccountSwitcher />
        <button className="btn btn-danger rounded-pill px-4 fw-semibold" onClick={onDeposit}>Deposit</button>
      </div>
    </header>
  );
}
