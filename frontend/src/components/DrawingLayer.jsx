import { useEffect, useRef, useState } from "react";
import { drawings } from "../services/api";
import { DRAW_TOOLS } from "../constants";

const NEED = Object.fromEntries(DRAW_TOOLS.map((t) => [t.id, t.need]));
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const distSeg = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
const extend = (a, b, w) => {                       // extend a->b towards the edge of the canvas
  const dx = b.x - a.x;
  if (!dx) return { x: b.x, y: b.y + (b.y - a.y) * 1000 };
  const k = ((dx > 0 ? w + 50 : -50) - a.x) / dx;
  return { x: a.x + dx * k, y: a.y + (b.y - a.y) * k };
};

/** Computes pixel geometry for a drawing: list of segments + optional rect/labels used for drawing and hit-testing. */
function geometry(tool, pts, api, w) {
  const px = pts.map((p) => ({ x: api.toX(p.time), y: api.toY(p.price), price: p.price }));
  if (px.some((p) => p.x == null || p.y == null)) return null;
  const segs = [];
  let rect = null, labels = [], fill = null, text = null;
  const [a, b, c] = px;
  if (tool === "trendline" && b) segs.push([a, b]);
  else if (tool === "ray" && b) segs.push([a, extend(a, b, w)]);
  else if (tool === "hline") { segs.push([{ x: 0, y: a.y }, { x: w, y: a.y }]); labels.push({ x: w - 6, y: a.y - 4, t: a.price.toFixed(api.decimals()), right: true }); }
  else if (tool === "vline") segs.push([{ x: a.x, y: -2000 }, { x: a.x, y: 4000 }]);
  else if (tool === "rect" && b) rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  else if (tool === "fib" && b) {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x) + 120;
    FIB.forEach((lvl) => {
      const price = b.price + (a.price - b.price) * lvl, y = api.toY(price);
      if (y == null) return;
      segs.push([{ x: x1, y }, { x: x2, y }]);
      labels.push({ x: x1 + 4, y: y - 3, t: `${(lvl * 100).toFixed(1)}%  ${price.toFixed(api.decimals())}` });
    });
    segs.push([a, b]);
  } else if (tool === "channel" && b) {
    segs.push([a, b]);
    if (c) {
      const lineY = b.x === a.x ? a.y : a.y + ((b.y - a.y) * (c.x - a.x)) / (b.x - a.x);
      const off = c.y - lineY;
      const a2 = { x: a.x, y: a.y + off }, b2 = { x: b.x, y: b.y + off };
      segs.push([a2, b2]);
      fill = [a, b, b2, a2];
    }
  } else if (tool === "text") text = { x: a.x, y: a.y };
  return { px, segs, rect, labels, fill, text };
}

function paint(ctx, g, color, selected, w, d) {
  ctx.strokeStyle = selected ? "#ff9800" : color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = selected ? 2.5 : 1.6;
  ctx.font = "11px system-ui, sans-serif";
  g.segs.forEach(([p, q]) => { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); });
  if (g.rect) { ctx.globalAlpha = 0.12; ctx.fillRect(g.rect.x, g.rect.y, g.rect.w, g.rect.h); ctx.globalAlpha = 1; ctx.strokeRect(g.rect.x, g.rect.y, g.rect.w, g.rect.h); }
  if (g.fill) { ctx.globalAlpha = 0.1; ctx.beginPath(); g.fill.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
  g.labels.forEach((l) => { ctx.textAlign = l.right ? "right" : "left"; ctx.fillText(l.t, l.x, l.y); });
  if (g.text) { ctx.font = "600 13px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText(d.style?.text || "", g.text.x, g.text.y); }
  if (selected) g.px.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); });
}

function hit(g, tool, pt) {
  if (g.segs.some(([a, b]) => distSeg(pt, a, b) < 7)) return true;
  if (g.rect) {
    const { x, y, w, h } = g.rect;
    return pt.x >= x - 6 && pt.x <= x + w + 6 && pt.y >= y - 6 && pt.y <= y + h + 6;
  }
  if (g.text) return Math.abs(pt.x - g.text.x - 30) < 40 && Math.abs(pt.y - g.text.y + 5) < 12;
  return false;
}

export default function DrawingLayer({ api, version, symbol, tool, color, clearToken, onDone }) {
  const canvas = useRef();
  const [list, setList] = useState([]);
  const [selId, setSelId] = useState(null);
  const listRef = useRef([]);
  const selRef = useRef(null);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const draft = useRef({ pts: [], hover: null });
  listRef.current = list; selRef.current = selId; toolRef.current = tool; colorRef.current = color;

  useEffect(() => {
    draft.current = { pts: [], hover: null };
    setSelId(null);
    drawings.list(symbol).then((d) => setList(Array.isArray(d) ? d : d.results || [])).catch(() => setList([]));
  }, [symbol]);

  useEffect(() => {
    if (!clearToken) return;
    listRef.current.forEach((d) => typeof d.id === "number" && drawings.remove(d.id).catch(() => {}));
    setList([]); setSelId(null);
  }, [clearToken]);

  useEffect(() => { if (tool === "cursor") draft.current = { pts: [], hover: null }; }, [tool]);

  // render loop (cheap: handful of shapes) keeps drawings glued to the chart as it scrolls / autoscales
  useEffect(() => {
    const cv = canvas.current, ctx = cv.getContext("2d");
    let raf;
    const loop = () => {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const d of listRef.current) {
        const g = geometry(d.tool, d.points, api, w);
        if (g) paint(ctx, g, d.style?.color || "#2196f3", d.id === selRef.current, w, d);
      }
      const dr = draft.current;
      if (dr.pts.length) {
        const pts = dr.hover ? [...dr.pts, dr.hover] : dr.pts;
        const g = geometry(toolRef.current, pts, api, w);
        if (g) paint(ctx, g, colorRef.current, false, w, { style: { text: "…" } });
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [api, version]);

  const toData = (e) => {
    const r = canvas.current.getBoundingClientRect();
    const time = api.toTime(e.clientX - r.left), price = api.toPrice(e.clientY - r.top);
    return time == null || price == null ? null : { time, price };
  };

  const finish = async () => {
    const { pts } = draft.current, t = toolRef.current;
    draft.current = { pts: [], hover: null };
    const style = { color: colorRef.current };
    if (t === "text") {
      const txt = window.prompt("Text label");
      if (!txt) { onDone(); return; }
      style.text = txt;
    }
    onDone();
    try {
      const d = await drawings.create({ symbol, tool: t, points: pts, style });
      setList((l) => [...l, d]);
    } catch {
      setList((l) => [...l, { id: `local-${Date.now()}`, symbol, tool: t, points: pts, style }]);
    }
  };

  const onClick = (e) => {
    const p = toData(e);
    if (!p) return;
    draft.current.pts.push(p);
    if (draft.current.pts.length >= NEED[toolRef.current]) finish();
  };
  const onMove = (e) => { if (draft.current.pts.length) draft.current.hover = toData(e); };

  // select drawings with the cursor tool (clicks, not drags, so chart panning keeps working)
  useEffect(() => {
    const host = canvas.current.parentElement;
    let down = null;
    const pd = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const pu = (e) => {
      if (!down || toolRef.current !== "cursor") return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = canvas.current.getBoundingClientRect();
      const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
      const found = [...listRef.current].reverse().find((d) => {
        const g = geometry(d.tool, d.points, api, r.width);
        return g && hit(g, d.tool, pt);
      });
      setSelId(found ? found.id : null);
    };
    host.addEventListener("pointerdown", pd);
    host.addEventListener("pointerup", pu);
    return () => { host.removeEventListener("pointerdown", pd); host.removeEventListener("pointerup", pu); };
  }, [api]);

  const removeSelected = () => {
    const d = listRef.current.find((x) => x.id === selRef.current);
    if (!d) return;
    setList((l) => l.filter((x) => x.id !== d.id));
    setSelId(null);
    if (typeof d.id === "number") drawings.remove(d.id).catch(() => {});
  };

  useEffect(() => {
    const k = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "Escape") { draft.current = { pts: [], hover: null }; onDone(); setSelId(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selRef.current) removeSelected();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <canvas ref={canvas} className="draw-canvas" style={{ pointerEvents: tool === "cursor" ? "none" : "auto", cursor: "crosshair" }}
        onClick={onClick} onMouseMove={onMove} />
      {selId && (
        <button className="btn btn-sm btn-light shadow-sm draw-delete" onClick={removeSelected}>
          <i className="bi bi-trash" /> Delete drawing
        </button>
      )}
    </>
  );
}
