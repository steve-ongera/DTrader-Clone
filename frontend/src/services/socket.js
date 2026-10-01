import { WS_URL, tokens, ensureFreshToken } from "./api";

/** Auto-reconnecting websocket: re-subscribes symbols, heartbeats, refreshes the JWT before connecting. */
class MarketSocket {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.symbols = new Set();
    this.retry = 0;
    this.closed = true;
    this.on("hello", (m) => {
      if (!m.authenticated && tokens.access && !this._authRetry) {
        this._authRetry = true;
        ensureFreshToken(true).then(() => this.reconnect());
      } else if (m.authenticated) this._authRetry = false;
    });
  }

  async connect() {
    if (this.ws && !this.closed) return;
    this.closed = false;
    await ensureFreshToken();
    if (this.closed) return;
    const ws = new WebSocket(tokens.access ? `${WS_URL}?token=${tokens.access}` : WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      if (this.symbols.size) this._send({ action: "subscribe", symbols: [...this.symbols] });
      this.hb = setInterval(() => this._send({ action: "ping" }), 20000);
      this._emit("open", {});
    };
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      this._emit(data.msg, data);
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;                 // stale socket from a previous reconnect
      clearInterval(this.hb);
      this._emit("close", {});
      if (!this.closed) setTimeout(() => { this.ws = null; this.closed = true; this.connect(); },
        Math.min(1000 * 2 ** this.retry++, 10000));
    };
  }

  reconnect() { this.disconnect(); return this.connect(); }
  disconnect() {
    this.closed = true;
    clearInterval(this.hb);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  subscribe(symbol) { this.symbols.add(symbol); this._send({ action: "subscribe", symbols: [symbol] }); }
  unsubscribe(symbol) { this.symbols.delete(symbol); this._send({ action: "unsubscribe", symbols: [symbol] }); }

  _send(o) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }
  _emit(type, data) { this.handlers.get(type)?.forEach((fn) => fn(data)); }
}

export const socket = new MarketSocket();
