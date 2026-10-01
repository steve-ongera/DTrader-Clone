import { useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import SymbolSelector from "./SymbolSelector";
import ContractTypeMenu from "./ContractTypeMenu";
import PositionsDrawer from "./PositionsDrawer";
import CashierModal from "./CashierModal";
import ToastHost from "./ToastHost";

export default function Layout({ trade = false, children }) {
  const [modal, setModal] = useState(null);       // symbols | types | cashier
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <TopBar trade={trade} onSymbols={() => setModal("symbols")} onTypes={() => setModal("types")}
          onPositions={() => setDrawer(!drawer)} onDeposit={() => setModal("cashier")} />
        {children}
      </div>
      {modal === "symbols" && <SymbolSelector onClose={() => setModal(null)} />}
      {modal === "types" && <ContractTypeMenu onClose={() => setModal(null)} />}
      {modal === "cashier" && <CashierModal onClose={() => setModal(null)} />}
      {drawer && <PositionsDrawer onClose={() => setDrawer(false)} />}
      <ToastHost />
    </div>
  );
}
