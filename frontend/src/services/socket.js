import { WS_URL, tokens } from "./api";

/** Auto-reconnecting websocket with re-subscribe + heartbeat. */
class MarketSocket {
  constructor() {
    this.ws = null;
    this.handlers = new Map();   // msg type -> Set<fn>
    this.symbols = new Set();
    this.retry = 0;
    this.closed = true;
  }

  connect() {
    this.closed = false;
    const url = tokens.access ? `${WS_URL}?token=${tokens.access}` : WS_URL;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.retry = 0;
      if (this.symbols.size) this._send({ action: "subscribe", symbols: [...this.symbols] });
      this.hb = setInterval(() => this._send({ action: "ping" }), 20000);
      this._emit("open", {});
    };
    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      this._emit(data.msg, data);
    };
    this.ws.onclose = () => {
      clearInterval(this.hb);
      this._emit("close", {});
      if (!this.closed) setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.retry++, 10000));
    };
  }

  reconnect() { this.disconnect(); this.connect(); }   // call after login/logout or token refresh
  disconnect() { this.closed = true; this.ws?.close(); }

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
