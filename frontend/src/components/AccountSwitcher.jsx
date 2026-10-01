import { useEffect, useRef, useState } from "react";
import { useTrading } from "../context/TradingContext";
import { fmt } from "../utils";

export default function AccountSwitcher() {
  const { accounts, account, setAccountId, resetDemo } = useTrading();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  if (!account) return null;
  const demo = account.account_type === "demo";
  return (
    <div className="position-relative" ref={ref}>
      <button className="acct-btn" onClick={() => setOpen(!open)}>
        <div className={demo ? "acct-demo" : "acct-real"}>{demo ? "Demo account" : "Real account"} <i className="bi bi-chevron-down" /></div>
        <div className="acct-bal">{fmt(account.balance)} {account.currency}</div>
      </button>
      {open && (
        <div className="dropdown-panel end-0">
          {accounts.map((a) => (
            <button key={a.id} className={`acct-row ${a.id === account.id ? "active" : ""}`}
              onClick={() => { setAccountId(String(a.id)); setOpen(false); }}>
              <div>
                <div className={a.account_type === "demo" ? "acct-demo" : "acct-real"}>{a.account_type === "demo" ? "Demo" : "Real"}</div>
                <small className="text-body-secondary">{a.login_id}</small>
              </div>
              <strong>{fmt(a.balance)} {a.currency}</strong>
            </button>
          ))}
          {demo && (
            <button className="btn btn-sm btn-outline-secondary w-100 mt-2" onClick={() => { resetDemo(); setOpen(false); }}>
              Reset demo balance
            </button>
          )}
        </div>
      )}
    </div>
  );
}
