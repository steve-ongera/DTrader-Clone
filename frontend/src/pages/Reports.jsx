import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useTrading } from "../context/TradingContext";
import { trade } from "../services/api";
import { CONTRACT_NAMES } from "../constants";
import { fmt, fmtDate, pnlClass, signed } from "../utils";

const LIMIT = 25;

function usePaged(fetcher, deps) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (offset) => {
    setLoading(true);
    try {
      const p = await fetcher(offset);
      setRows((r) => (offset ? [...r, ...p.results] : p.results));
      setCount(p.count);
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(0); }, [load]);
  return { rows, count, loading, more: () => load(rows.length) };
}

export default function Reports() {
  const { account } = useTrading();
  const [tab, setTab] = useState("trades");
  const id = account?.id;
  const trades = usePaged((o) => (id ? trade.contracts({ status: "closed", account: id, limit: LIMIT, offset: o }) : Promise.resolve({ results: [], count: 0 })), [id]);
  const stmt = usePaged((o) => (id ? trade.statement({ account: id, limit: LIMIT, offset: o }) : Promise.resolve({ results: [], count: 0 })), [id]);
  const cur = tab === "trades" ? trades : stmt;

  return (
    <Layout>
      <div className="page-scroll">
        <div className="page-card">
          <ul className="nav nav-underline mb-3">
            <li className="nav-item"><button className={`nav-link ${tab === "trades" ? "active" : ""}`} onClick={() => setTab("trades")}>Trade table</button></li>
            <li className="nav-item"><button className={`nav-link ${tab === "statement" ? "active" : ""}`} onClick={() => setTab("statement")}>Statement</button></li>
          </ul>
          <div className="table-responsive">
            {tab === "trades" ? (
              <table className="table table-sm align-middle">
                <thead><tr><th>Ref</th><th>Market</th><th>Type</th><th className="text-end">Stake</th><th className="text-end">Entry</th><th className="text-end">Exit</th><th className="text-end">Profit/Loss</th><th>Closed</th></tr></thead>
                <tbody>
                  {trades.rows.map((c) => (
                    <tr key={c.id}>
                      <td>#{c.id}</td><td>{c.symbol_name}</td><td>{CONTRACT_NAMES[c.contract_type]}</td>
                      <td className="text-end">{fmt(c.buy_price)}</td><td className="text-end">{c.entry_price ?? "—"}</td><td className="text-end">{c.exit_price ?? "—"}</td>
                      <td className={`text-end fw-semibold ${pnlClass(c.profit)}`}>{signed(c.profit)}</td>
                      <td className="small">{c.exit_epoch ? fmtDate(c.exit_epoch * 1000) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="table table-sm align-middle">
                <thead><tr><th>Date</th><th>Type</th><th>Method</th><th>Status</th><th className="text-end">Amount</th><th className="text-end">Balance</th></tr></thead>
                <tbody>
                  {stmt.rows.map((t) => (
                    <tr key={t.id}>
                      <td className="small">{fmtDate(t.created_at)}</td><td className="text-capitalize">{t.tx_type}</td><td className="text-capitalize">{t.method}</td>
                      <td><span className={`badge ${t.status === "completed" ? "bg-success" : t.status === "pending" ? "bg-warning text-dark" : "bg-danger"}`}>{t.status}</span></td>
                      <td className={`text-end fw-semibold ${pnlClass(t.amount)}`}>{signed(t.amount)}</td>
                      <td className="text-end">{t.balance_after != null ? fmt(t.balance_after) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!cur.loading && cur.rows.length === 0 && <p className="text-body-secondary mb-0">Nothing here yet.</p>}
          {cur.rows.length < cur.count && (
            <button className="btn btn-outline-secondary btn-sm" disabled={cur.loading} onClick={cur.more}>{cur.loading ? "Loading…" : "Load more"}</button>
          )}
        </div>
      </div>
    </Layout>
  );
}
