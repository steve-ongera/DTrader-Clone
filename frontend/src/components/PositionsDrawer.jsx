import { Link } from "react-router-dom";
import ContractRow from "./ContractRow";
import { useTrading } from "../context/TradingContext";

export default function PositionsDrawer({ onClose }) {
  const { openContracts, account, sellContract } = useTrading();
  const list = Object.values(openContracts).filter((c) => !account || c.account === account.id).sort((a, b) => b.id - a.id);
  return (
    <div className="drawer">
      <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
        <strong>Open positions ({list.length})</strong>
        <button className="btn-close" aria-label="Close" onClick={onClose} />
      </div>
      <div className="flex-grow-1 overflow-auto">
        {list.length === 0 && <p className="text-body-secondary p-3 mb-0">No open positions. Place a trade and it will appear here.</p>}
        {list.map((c) => <ContractRow key={c.id} c={c} onSell={sellContract} />)}
      </div>
      <Link to="/reports" className="btn btn-outline-secondary m-3" onClick={onClose}>View trade history</Link>
    </div>
  );
}
