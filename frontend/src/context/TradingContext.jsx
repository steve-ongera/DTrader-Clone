import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { accounts as accountsApi, market, trade } from "../services/api";
import { socket } from "../services/socket";
import { CONTRACT_NAMES } from "../constants";
import { fmt, usePersisted } from "../utils";

const Ctx = createContext(null);
export const useTrading = () => useContext(Ctx);

export function TradingProvider({ children }) {
  const { user } = useAuth();
  const [symbols, setSymbols] = useState([]);
  const [code, setCode] = usePersisted("dt_symbol", "1HZ100V");
  const [category, setCategory] = usePersisted("dt_category", "rise_fall");
  const [chartType, setChartType] = usePersisted("dt_chart", "area");
  const [interval, setIntervalRaw] = usePersisted("dt_interval", "0");
  const [theme, setTheme] = usePersisted("dt_theme", "light");
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = usePersisted("dt_account", "");
  const [openContracts, setOpen] = useState({});
  const [tick, setTick] = useState(null);
  const [wsOpen, setWsOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const codeRef = useRef(code);
  const openRef = useRef({});
  codeRef.current = code;
  openRef.current = openContracts;

  useEffect(() => { document.documentElement.setAttribute("data-bs-theme", theme); }, [theme]);

  const toast = useCallback((text, variant = "dark") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, text, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  // instruments (public)
  useEffect(() => {
    market.symbols().then((list) => {
      setSymbols(list);
      if (list.length && !list.some((s) => s.code === code)) setCode(list[0].code);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // user data + websocket lifecycle
  useEffect(() => {
    if (!user) { socket.disconnect(); setAccounts([]); setOpen({}); return; }
    accountsApi.list().then(setAccounts).catch(() => {});
    trade.contracts({ status: "open", limit: 100 }).then((p) =>
      setOpen(Object.fromEntries(p.results.map((c) => [c.id, c])))).catch(() => {});

    const offs = [
      socket.on("open", () => setWsOpen(true)),
      socket.on("close", () => setWsOpen(false)),
      socket.on("tick", (m) => { if (m.symbol === codeRef.current) setTick(m); }),
      socket.on("balance", (m) =>
        setAccounts((list) => list.map((a) => (a.id === m.account_id ? { ...a, balance: m.balance } : a)))),
      socket.on("contract", (c) => {
        if (c.status === "open") { setOpen((o) => ({ ...o, [c.id]: c })); return; }
        const wasOpen = c.id in openRef.current;
        setOpen((o) => { const { [c.id]: _gone, ...rest } = o; return rest; });
        if (wasOpen) {
          const name = CONTRACT_NAMES[c.contract_type];
          const p = Number(c.profit);
          toast(`${name} on ${c.symbol_name}: ${c.status === "won" || p > 0 ? "won" : c.status === "sold" ? "closed" : "lost"} ${p >= 0 ? "+" : ""}${fmt(p)} USD`,
            p > 0 ? "success" : p < 0 ? "danger" : "secondary");
        }
      }),
    ];
    socket.connect();
    return () => offs.forEach((off) => off());
  }, [user, toast]);

  // subscribe the selected symbol
  useEffect(() => {
    setTick(null);
    socket.subscribe(code);
    return () => socket.unsubscribe(code);
  }, [code]);

  const account = useMemo(
    () => accounts.find((a) => String(a.id) === String(accountId)) || accounts.find((a) => a.account_type === "demo") || accounts[0] || null,
    [accounts, accountId]);
  const symbolInfo = useMemo(() => symbols.find((s) => s.code === code) || null, [symbols, code]);

  const buyContract = useCallback(async (params) => {
    const c = await trade.buy({ ...params, account_id: account.id });
    setOpen((o) => ({ ...o, [c.id]: o[c.id] || c }));
    toast(`${CONTRACT_NAMES[c.contract_type]} bought · stake ${fmt(c.buy_price)} USD`, "dark");
    return c;
  }, [account, toast]);

  const sellContract = useCallback(async (id) => {
    try { await trade.sell(id); } catch (e) { toast(e.response?.data?.detail || "Could not sell contract", "danger"); }
  }, [toast]);

  const resetDemo = useCallback(async () => {
    const demo = accounts.find((a) => a.account_type === "demo");
    if (!demo) return;
    await accountsApi.resetDemo(demo.id);
    toast("Demo balance reset", "success");
  }, [accounts, toast]);

  const value = {
    symbols, symbolInfo, code, setCode, category, setCategory, chartType, setChartType,
    interval: Number(interval), setInterval: (v) => setIntervalRaw(String(v)),
    theme, toggleTheme: () => setTheme(theme === "light" ? "dark" : "light"),
    accounts, account, setAccountId, openContracts, tick, wsOpen,
    buyContract, sellContract, resetDemo, toasts, toast,
    refreshAccounts: () => accountsApi.list().then(setAccounts),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
