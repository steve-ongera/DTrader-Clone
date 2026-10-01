import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";
import { market } from "../services/api";
import { socket } from "../services/socket";
import { useTrading } from "../context/TradingContext";
import DrawingLayer from "./DrawingLayer";

const THEMES = {
  light: { bg: "#ffffff", text: "#555", grid: "#f1f2f3", line: "#111", top: "rgba(0,0,0,0.12)", bottom: "rgba(0,0,0,0)", up: "#00c390", down: "#ff444f" },
  dark: { bg: "#151717", text: "#aaa", grid: "#232627", line: "#f2f2f2", top: "rgba(255,255,255,0.14)", bottom: "rgba(255,255,255,0)", up: "#00c390", down: "#ff444f" },
};

/** Chart with live, eased tick animation. Exposes zoom/fit/screenshot and coordinate helpers to the drawing layer. */
const PriceChart = forwardRef(function PriceChart({ tool, color, clearToken, onToolDone }, ref) {
  const { symbolInfo, interval, chartType, theme, openContracts } = useTrading();
  const host = useRef();
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const timesRef = useRef([]);
  const stepRef = useRef(1);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const code = symbolInfo?.code;
  const effType = interval === 0 && (chartType === "candle" || chartType === "ohlc") ? "area" : chartType;

  // ---- chart instance
  useEffect(() => {
    const T = THEMES[theme];
    const chart = createChart(host.current, {
      autoSize: true,
      layout: { background: { color: T.bg }, textColor: T.text, fontFamily: "inherit" },
      grid: { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.14 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: true, rightOffset: 12, barSpacing: 9 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;
    setReady(true);
    return () => { chart.remove(); chartRef.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const T = THEMES[theme];
    chartRef.current?.applyOptions({
      layout: { background: { color: T.bg }, textColor: T.text },
      grid: { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
    });
  }, [theme, ready]);

  // ---- series + history + live ticks
  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart || !code) return undefined;
    const T = THEMES[theme];
    const dec = symbolInfo.decimals;
    const priceFormat = { type: "price", precision: dec, minMove: 1 / 10 ** dec };
    const isOHLC = effType === "candle" || effType === "ohlc";
    let series;
    if (effType === "candle") series = chart.addCandlestickSeries({ upColor: T.up, downColor: T.down, borderVisible: false, wickUpColor: T.up, wickDownColor: T.down, priceFormat });
    else if (effType === "ohlc") series = chart.addBarSeries({ upColor: T.up, downColor: T.down, priceFormat });
    else if (effType === "line") series = chart.addLineSeries({ color: T.line, lineWidth: 2, priceFormat });
    else series = chart.addAreaSeries({ lineColor: T.line, topColor: T.top, bottomColor: T.bottom, lineWidth: 2, priceFormat });
    seriesRef.current = series;
    setLoading(true);

    let cancelled = false, raf = 0, off = () => {};
    let cur = null, realClose = 0, disp = 0, target = 0;

    const draw = () => series.update(isOHLC
      ? { time: cur.time, open: cur.open, high: Math.max(cur.high, disp), low: Math.min(cur.low, disp), close: disp }
      : { time: cur.time, value: disp });
    const frame = () => {
      raf = 0;
      const d = target - disp;
      disp = Math.abs(d) < 0.5 / 10 ** dec ? target : disp + d * 0.35;     // ease toward the latest tick
      draw();
      if (disp !== target) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    market.history(code, interval, interval === 0 ? 1000 : 600).then((h) => {
      if (cancelled) return;
      let data = [];
      if (h.type === "ticks") {
        let last = -1;
        h.times.forEach((t, i) => { const s = Math.floor(t); if (s > last) { data.push({ time: s, value: h.prices[i] }); last = s; } else data[data.length - 1].value = h.prices[i]; });
      } else {
        data = isOHLC ? h.candles : h.candles.map((c) => ({ time: c.time, value: c.close }));
      }
      if (!data.length) { setLoading(false); return; }
      series.setData(data);
      timesRef.current = data.map((d) => d.time);
      stepRef.current = interval || Math.max(1, (data[data.length - 1].time - data[0].time) / Math.max(1, data.length - 1));
      const last = data[data.length - 1];
      cur = isOHLC ? { ...last } : { time: last.time };
      realClose = disp = target = isOHLC ? last.close : last.value;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - (interval === 0 ? 140 : 90)), to: data.length + 10 });
      setLoading(false);
      setVersion((v) => v + 1);

      off = socket.on("tick", (m) => {
        if (m.symbol !== code || !cur) return;
        const p = m.quote;
        const t = interval === 0 ? Math.floor(m.epoch) : Math.floor(m.epoch / interval) * interval;
        if (t > cur.time) {
          cur = isOHLC ? { time: t, open: realClose, high: Math.max(realClose, p), low: Math.min(realClose, p), close: p } : { time: t };
          if (isOHLC) disp = realClose;
          timesRef.current.push(t);
        } else if (t === cur.time && isOHLC) {
          cur.high = Math.max(cur.high, p); cur.low = Math.min(cur.low, p); cur.close = p;
        } else if (t < cur.time) return;
        realClose = target = p;
        kick();
      });
    }).catch(() => setLoading(false));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      off();
      try { chart.removeSeries(series); } catch { /* chart already disposed */ }
      seriesRef.current = null;
      timesRef.current = [];
    };
  }, [ready, code, interval, effType, theme, symbolInfo?.decimals]);

  // ---- entry/barrier lines for open contracts
  useEffect(() => {
    const s = seriesRef.current;
    if (!s || !code) return undefined;
    const lines = [];
    const add = (price, title, color, lineStyle = LineStyle.Dashed) => {
      if (price != null) lines.push(s.createPriceLine({ price, color, lineWidth: 1, lineStyle, axisLabelVisible: true, title }));
    };
    Object.values(openContracts).filter((c) => c.symbol === code).forEach((c) => {
      add(c.entry_price, `#${c.id} entry`, "#888");
      add(c.meta?.abs_barrier, "Barrier", "#ff9800");
      if (c.contract_type === "ACCU") { add(c.meta?.high, "Upper", "#ff444f", LineStyle.Solid); add(c.meta?.low, "Lower", "#ff444f", LineStyle.Solid); }
    });
    return () => lines.forEach((l) => { try { s.removePriceLine(l); } catch { /* series gone */ } });
  }, [openContracts, version, code]);

  // ---- time/price <-> pixel helpers for the drawing layer
  const api = useMemo(() => {
    const locate = (time) => {
      const t = timesRef.current, n = t.length, step = stepRef.current;
      if (!n) return null;
      if (time <= t[0]) return (time - t[0]) / step;
      if (time >= t[n - 1]) return n - 1 + (time - t[n - 1]) / step;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= time) lo = mid; else hi = mid; }
      return lo + (time - t[lo]) / (t[lo + 1] - t[lo]);
    };
    const timeAt = (idx) => {
      const t = timesRef.current, n = t.length, step = stepRef.current;
      if (!n) return null;
      if (idx <= 0) return t[0] + idx * step;
      if (idx >= n - 1) return t[n - 1] + (idx - (n - 1)) * step;
      const i = Math.floor(idx);
      return t[i] + (idx - i) * (t[i + 1] - t[i]);
    };
    return {
      toX: (time) => { const i = locate(time); return i == null ? null : chartRef.current?.timeScale().logicalToCoordinate(i) ?? null; },
      toY: (price) => seriesRef.current?.priceToCoordinate(price) ?? null,
      toTime: (x) => { const i = chartRef.current?.timeScale().coordinateToLogical(x); return i == null ? null : timeAt(i); },
      toPrice: (y) => seriesRef.current?.coordinateToPrice(y) ?? null,
      decimals: () => symbolInfo?.decimals ?? 2,
    };
  }, [symbolInfo?.decimals]);

  useImperativeHandle(ref, () => ({
    zoom(f) {
      const ts = chartRef.current.timeScale(), r = ts.getVisibleLogicalRange();
      if (r) { const w = (r.to - r.from) * f; ts.setVisibleLogicalRange({ from: r.to - w, to: r.to }); }
    },
    follow() { chartRef.current.timeScale().scrollToRealTime(); },
    screenshot() {
      const a = document.createElement("a");
      a.download = `${code}-${Date.now()}.png`;
      a.href = chartRef.current.takeScreenshot().toDataURL();
      a.click();
    },
  }), [code]);

  return (
    <>
      <div ref={host} className="chart-host" />
      {ready && code && (
        <DrawingLayer api={api} version={version} symbol={code} tool={tool} color={color} clearToken={clearToken} onDone={onToolDone} />
      )}
      {loading && <div className="chart-loading"><div className="spinner-border spinner-border-sm" /> Loading chart…</div>}
    </>
  );
});

export default PriceChart;
