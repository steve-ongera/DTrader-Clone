import { useRef, useState } from "react";
import Layout from "../components/Layout";
import PriceChart from "../components/PriceChart";
import ChartToolbar from "../components/ChartToolbar";
import TradePanel from "../components/TradePanel";
import { useTrading } from "../context/TradingContext";
import { DRAW_COLORS } from "../constants";
import { fmt } from "../utils";

export default function Trade() {
  const chart = useRef();
  const { tick, symbolInfo } = useTrading();
  const [tool, setTool] = useState("cursor");
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [clearToken, setClearToken] = useState(0);

  return (
    <Layout trade>
      <div className="workspace">
        <section className="chart-area">
          <PriceChart ref={chart} tool={tool} color={color} clearToken={clearToken} onToolDone={() => setTool("cursor")} />
          {tool !== "cursor" && <div className="draw-hint">Click on the chart to place points · Esc to cancel</div>}
          <ChartToolbar tool={tool} setTool={setTool} color={color} setColor={setColor}
            onClear={() => setClearToken((n) => n + 1)} onScreenshot={() => chart.current?.screenshot()} />
          <div className="zoom-ctl">
            <button className="tool-btn" onClick={() => chart.current?.zoom(1.4)} title="Zoom out"><i className="bi bi-dash" /></button>
            <button className="tool-btn" onClick={() => chart.current?.follow()} title="Jump to latest"><i className="bi bi-crosshair" /></button>
            <button className="tool-btn" onClick={() => chart.current?.zoom(0.7)} title="Zoom in"><i className="bi bi-plus" /></button>
          </div>
          {tick && symbolInfo && <div className="live-quote">{fmt(tick.quote, symbolInfo.decimals)}</div>}
        </section>
        <aside className="trade-side"><TradePanel /></aside>
      </div>
    </Layout>
  );
}
