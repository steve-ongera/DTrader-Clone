import Modal from "./Modal";
import { useTrading } from "../context/TradingContext";
import { CATEGORIES } from "../constants";

export default function ContractTypeMenu({ onClose }) {
  const { category, setCategory } = useTrading();
  return (
    <Modal title="Trade types" onClose={onClose}>
      <div className="list-group">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`list-group-item list-group-item-action d-flex gap-3 align-items-start ${c.id === category ? "active" : ""}`}
            onClick={() => { setCategory(c.id); onClose(); }}>
            <i className={`bi ${c.icon} fs-5`} />
            <div><div className="fw-semibold">{c.name}</div><small className="opacity-75">{c.blurb}</small></div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
