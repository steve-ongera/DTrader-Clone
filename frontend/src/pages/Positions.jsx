import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ContractRow from "../components/ContractRow";
import { useTrading } from "../context/TradingContext";
import { trade } from "../services/api";

export default function Positions() {
  const { openContracts, account, sellContract } = useTrading();
  const [closed, setClosed] = useState([]);
  const open = Object.values(openContracts).filter((c) => !account || c.account === account.id).sort((a, b) => b.id - a.id);

  useEffect(() => {
    if (!account) return;
    trade.contracts({ status: "closed", account: account.id, limit: 10 }).then((p) => setClosed(p.results)).catch(() => {});
  }, [account, open.length]);

  return (
    <Layout>
      <div className="page-scroll">
        <div className="page-card">
          <h6 className="mb-3">Open positions</h6>
          {open.length === 0 && <p className="text-body-secondary mb-0">You have no open positions.</p>}
          {open.map((c) => <ContractRow key={c.id} c={c} onSell={sellContract} />)}
        </div>
        <div className="page-card">
          <h6 className="mb-3">Recently closed</h6>
          {closed.length === 0 && <p className="text-body-secondary mb-0">Closed contracts will show up here.</p>}
          {closed.map((c) => <ContractRow key={c.id} c={c} />)}
        </div>
      </div>
    </Layout>
  );
}
