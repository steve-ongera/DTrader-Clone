import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/market/";

export const tokens = {
  get access() { return localStorage.getItem("dt_access"); },
  get refresh() { return localStorage.getItem("dt_refresh"); },
  set({ access, refresh }) {
    if (access) localStorage.setItem("dt_access", access);
    if (refresh) localStorage.setItem("dt_refresh", refresh);
  },
  clear() { localStorage.removeItem("dt_access"); localStorage.removeItem("dt_refresh"); },
};

const http = axios.create({ baseURL: API, timeout: 15000 });

http.interceptors.request.use((cfg) => {
  if (tokens.access) cfg.headers.Authorization = `Bearer ${tokens.access}`;
  return cfg;
});

let refreshing = null;
http.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && tokens.refresh && !original._retry) {
      original._retry = true;
      refreshing ??= axios
        .post(`${API}/auth/refresh/`, { refresh: tokens.refresh })
        .then((r) => { tokens.set(r.data); return r.data.access; })
        .catch((e) => { tokens.clear(); window.location.href = "/login"; throw e; })
        .finally(() => { refreshing = null; });
      await refreshing;
      return http(original);
    }
    return Promise.reject(error);
  }
);

export const errorMessage = (e) =>
  e.response?.data?.detail ||
  Object.values(e.response?.data || {}).flat().join(" ") ||
  e.message;

export const auth = {
  register: (d) => http.post("/auth/register/", d).then((r) => r.data),
  login: async (email, password) => {
    const { data } = await http.post("/auth/login/", { username: email, password });
    tokens.set(data);
  },
  me: () => http.get("/auth/me/").then((r) => r.data),
  logout: () => tokens.clear(),
};

export const accounts = {
  list: () => http.get("/accounts/").then((r) => r.data),
  resetDemo: (id) => http.post(`/accounts/${id}/reset-demo/`).then((r) => r.data),
};

export const market = {
  symbols: () => http.get("/symbols/").then((r) => r.data),
  history: (code, granularity = 0, count = 500) =>
    http.get(`/symbols/${code}/history/`, { params: { granularity, count } }).then((r) => r.data),
};

export const trade = {
  proposal: (body) => http.post("/trade/proposal/", body).then((r) => r.data),
  buy: (body) => http.post("/trade/buy/", body).then((r) => r.data),
  sell: (id) => http.post(`/trade/sell/${id}/`).then((r) => r.data),
  contracts: (params) => http.get("/contracts/", { params }).then((r) => r.data),
  statement: (params) => http.get("/statement/", { params }).then((r) => r.data),
};

export const drawings = {
  list: (symbol) => http.get("/drawings/", { params: { symbol } }).then((r) => r.data),
  create: (d) => http.post("/drawings/", d).then((r) => r.data),
  update: (id, d) => http.patch(`/drawings/${id}/`, d).then((r) => r.data),
  remove: (id) => http.delete(`/drawings/${id}/`),
};

export const cashier = {
  deposit: (body) => http.post("/payments/deposit/", body).then((r) => r.data),
  withdraw: (body) => http.post("/payments/withdraw/", body).then((r) => r.data),
  paypalCapture: (order_id) => http.post("/payments/paypal/capture/", { order_id }).then((r) => r.data),
};

export default http;
