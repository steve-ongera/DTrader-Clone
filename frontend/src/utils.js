import { useEffect, useState } from "react";

export const fmt = (v, d = 2) =>
  Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const signed = (v) => `${Number(v) > 0 ? "+" : ""}${fmt(v)}`;
export const pnlClass = (v) => (Number(v) > 0 ? "text-success" : Number(v) < 0 ? "text-danger" : "text-body-secondary");
export const fmtDate = (iso) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" });

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

export function usePersisted(key, initial) {
  const [v, setV] = useState(() => localStorage.getItem(key) ?? initial);
  useEffect(() => { localStorage.setItem(key, v); }, [key, v]);
  return [v, setV];
}
