import { useEffect, useRef, useState } from "react";
import { useTrading } from "../context/TradingContext";
import { CHART_TYPES, DRAW_COLORS, DRAW_TOOLS, INTERVALS } from "../constants";

export default function ChartToolbar({ tool, setTool, color, setColor, onClear, onScreenshot }) {
  const { chartType, setChartType, interval, setInterval } = useTrading();
  const [open, setOpen] = useState(null);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggle = (k) => setOpen(open === k ? null : k);
  const ct = CHART_TYPES.find((c) => c.id === chartType);
  const iv = INTERVALS.find((i) => i.v === interval);

  return (
    <div className="chart-tools" ref={ref}>
      <div className="tool-wrap">
        <button className={`tool-btn ${open === "type" ? "on" : ""}`} title="Chart type" onClick={() => toggle("type")}>
          <i className={`bi ${ct.icon}`} />
        </button>
        {open === "type" && (
          <div className="tool-pop">
            {CHART_TYPES.map((c) => (
              <button key={c.id} className={`pop-item ${c.id === chartType ? "on" : ""}`} onClick={() => { setChartType(c.id); setOpen(null); }}>
                <i className={`bi ${c.icon}`} /> {c.l}
              </button>
            ))}
            {interval === 0 && <small className="text-body-secondary px-2 pb-1">Candles/OHLC need a time interval</small>}
          </div>
        )}
      </div>

      <div className="tool-wrap">
        <button className={`tool-btn text ${open === "interval" ? "on" : ""}`} title="Time interval" onClick={() => toggle("interval")}>
          {iv?.s}
        </button>
        {open === "interval" && (
          <div className="tool-pop grid-pop">
            {INTERVALS.map((i) => (
              <button key={i.v} className={`pop-item ${i.v === interval ? "on" : ""}`} onClick={() => { setInterval(i.v); setOpen(null); }}>{i.l}</button>
            ))}
          </div>
        )}
      </div>

      <div className="tool-wrap">
        <button className={`tool-btn ${open === "draw" || tool !== "cursor" ? "on" : ""}`} title="Drawing tools" onClick={() => toggle("draw")}>
          <i className="bi bi-pencil" />
        </button>
        {open === "draw" && (
          <div className="tool-pop">
            {DRAW_TOOLS.map((t) => (
              <button key={t.id} className={`pop-item ${t.id === tool ? "on" : ""}`} onClick={() => { setTool(t.id); setOpen(null); }}>
                <i className={`bi ${t.icon}`} /> {t.l}
              </button>
            ))}
            <div className="d-flex gap-2 px-2 py-2">
              {DRAW_COLORS.map((c) => (
                <button key={c} className={`swatch ${c === color ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
              ))}
            </div>
            <button className="pop-item text-danger" onClick={() => { onClear(); setOpen(null); }}><i className="bi bi-trash" /> Clear all drawings</button>
          </div>
        )}
      </div>

      <button className="tool-btn" title="Download chart image" onClick={onScreenshot}><i className="bi bi-download" /></button>
    </div>
  );
}
