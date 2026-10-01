export const CATEGORIES = [
  { id: "rise_fall", name: "Rise/Fall", icon: "bi-graph-up-arrow", kind: "fixed",
    sides: [["RISE", "Rise"], ["FALL", "Fall"]], blurb: "Predict whether the market ends higher or lower than the entry spot." },
  { id: "higher_lower", name: "Higher/Lower", icon: "bi-arrows-expand", kind: "fixed", barrier: true,
    sides: [["HIGHER", "Higher"], ["LOWER", "Lower"]], blurb: "Win if the exit spot is above or below a barrier you set." },
  { id: "touch", name: "Touch/No Touch", icon: "bi-bullseye", kind: "fixed", barrier: true,
    sides: [["TOUCH", "Touch"], ["NOTOUCH", "No Touch"]], blurb: "Will the market touch your barrier before the contract ends?" },
  { id: "accumulators", name: "Accumulators", icon: "bi-layers", kind: "accu",
    sides: [["ACCU", "Buy"]], blurb: "Your stake grows every tick the market stays inside the barriers." },
  { id: "multipliers", name: "Multipliers", icon: "bi-x-diamond", kind: "mult",
    sides: [["MULTUP", "Up"], ["MULTDOWN", "Down"]], blurb: "Amplify market moves. You can never lose more than your stake." },
  { id: "matches_differs", name: "Matches/Differs", icon: "bi-123", kind: "fixed", digits: true, pick: true,
    sides: [["DIGITMATCH", "Matches"], ["DIGITDIFF", "Differs"]], blurb: "Predict whether the last digit of the exit spot matches yours." },
  { id: "even_odd", name: "Even/Odd", icon: "bi-toggles", kind: "fixed", digits: true,
    sides: [["DIGITEVEN", "Even"], ["DIGITODD", "Odd"]], blurb: "Is the last digit of the exit spot even or odd?" },
  { id: "over_under", name: "Over/Under", icon: "bi-distribute-vertical", kind: "fixed", digits: true, pick: true,
    sides: [["DIGITOVER", "Over"], ["DIGITUNDER", "Under"]], blurb: "Is the last digit over or under your prediction?" },
];

export const INTERVALS = [
  { v: 0, l: "Ticks", s: "1t" }, { v: 5, l: "5 seconds", s: "5s" }, { v: 15, l: "15 seconds", s: "15s" },
  { v: 30, l: "30 seconds", s: "30s" }, { v: 60, l: "1 minute", s: "1m" }, { v: 120, l: "2 minutes", s: "2m" },
  { v: 180, l: "3 minutes", s: "3m" }, { v: 300, l: "5 minutes", s: "5m" }, { v: 600, l: "10 minutes", s: "10m" },
  { v: 900, l: "15 minutes", s: "15m" }, { v: 1800, l: "30 minutes", s: "30m" }, { v: 3600, l: "1 hour", s: "1h" },
  { v: 7200, l: "2 hours", s: "2h" }, { v: 14400, l: "4 hours", s: "4h" }, { v: 28800, l: "8 hours", s: "8h" },
  { v: 86400, l: "1 day", s: "1d" },
];

export const CHART_TYPES = [
  { id: "area", l: "Area", icon: "bi-graph-up" },
  { id: "line", l: "Line", icon: "bi-activity" },
  { id: "candle", l: "Candles", icon: "bi-bar-chart-line" },
  { id: "ohlc", l: "OHLC bars", icon: "bi-bar-chart-steps" },
];

export const DRAW_TOOLS = [
  { id: "trendline", l: "Trend line", icon: "bi-slash-lg", need: 2 },
  { id: "ray", l: "Ray", icon: "bi-arrow-up-right", need: 2 },
  { id: "hline", l: "Horizontal line", icon: "bi-dash-lg", need: 1 },
  { id: "vline", l: "Vertical line", icon: "bi-grip-vertical", need: 1 },
  { id: "rect", l: "Rectangle", icon: "bi-square", need: 2 },
  { id: "fib", l: "Fib retracement", icon: "bi-list-nested", need: 2 },
  { id: "channel", l: "Channel", icon: "bi-distribute-vertical", need: 3 },
  { id: "text", l: "Text", icon: "bi-fonts", need: 1 },
];
export const DRAW_COLORS = ["#2196f3", "#ff444f", "#00c390", "#ff9800", "#9c27b0", "#607d8b"];

export const UNITS = [["t", "Ticks"], ["s", "Seconds"], ["m", "Minutes"], ["h", "Hours"], ["d", "Days"]];
export const MULTIPLIERS = [20, 50, 100, 200, 400];
export const GROWTH_RATES = [0.01, 0.02, 0.03, 0.04, 0.05];
export const MARKETS = [["synthetic", "Derived"], ["forex", "Forex"], ["commodity", "Commodities"], ["stock", "Stocks"]];

export const CONTRACT_NAMES = {
  RISE: "Rise", FALL: "Fall", HIGHER: "Higher", LOWER: "Lower", TOUCH: "Touch", NOTOUCH: "No Touch",
  ACCU: "Accumulator", MULTUP: "Multiplier Up", MULTDOWN: "Multiplier Down", DIGITMATCH: "Matches",
  DIGITDIFF: "Differs", DIGITOVER: "Over", DIGITUNDER: "Under", DIGITEVEN: "Even", DIGITODD: "Odd",
};
