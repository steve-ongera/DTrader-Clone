import { useTrading } from "../context/TradingContext";

export default function ToastHost() {
  const { toasts } = useTrading();
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`dt-toast bg-${t.variant}`}>{t.text}</div>
      ))}
    </div>
  );
}
