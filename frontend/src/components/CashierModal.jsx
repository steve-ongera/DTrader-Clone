import Modal from "./Modal";
import CashierForm from "./CashierForm";

export default function CashierModal({ onClose }) {
  return (
    <Modal title="Cashier" onClose={onClose}>
      <CashierForm />
    </Modal>
  );
}
