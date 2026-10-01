import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import CashierForm from "../components/CashierForm";
import { cashier } from "../services/api";
import { useTrading } from "../context/TradingContext";

export default function Cashier() {
  const [params, setParams] = useSearchParams();
  const { toast, refreshAccounts } = useTrading();
  const handled = useRef(false);

  // return from payment providers
  useEffect(() => {
    if (handled.current) return;
    const status = params.get("status");
    if (!status) return;
    handled.current = true;
    if (status === "paypal" && params.get("token")) {
      cashier.paypalCapture(params.get("token"))
        .then((r) => { toast(r.status === "completed" ? "PayPal deposit received" : "PayPal payment could not be confirmed", r.status === "completed" ? "success" : "danger"); refreshAccounts(); })
        .catch(() => toast("PayPal payment could not be confirmed", "danger"));
    } else if (status === "cancelled") toast("Payment cancelled", "secondary");
    else toast("Payment submitted. Your balance updates as soon as it is confirmed.", "success");
    setParams({}, { replace: true });
  }, [params, setParams, toast, refreshAccounts]);

  return (
    <Layout>
      <div className="page-scroll">
        <div className="page-card" style={{ maxWidth: 520 }}>
          <h6 className="mb-3">Cashier</h6>
          <CashierForm />
        </div>
      </div>
    </Layout>
  );
}
