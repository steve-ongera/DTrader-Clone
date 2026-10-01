import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTrading } from "../context/TradingContext";

const items = [
  { to: "/", icon: "bi-house", label: "Home" },
  { to: "/positions", icon: "bi-clock-history", label: "Positions" },
  { to: "/reports", icon: "bi-file-earmark-text", label: "Reports" },
  { to: "/cashier", icon: "bi-wallet2", label: "Cashier" },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTrading();
  const nav = useNavigate();
  return (
    <nav className="sidebar">
      <div className="logo">DT</div>
      <div className="side-group">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
            <i className={`bi ${i.icon}`} /><span>{i.label}</span>
          </NavLink>
        ))}
      </div>
      <div className="side-group side-bottom">
        <button className="side-link" onClick={toggleTheme}>
          <i className={`bi ${theme === "light" ? "bi-moon" : "bi-sun"}`} /><span>Theme</span>
        </button>
        <button className="side-link" onClick={() => { logout(); nav("/login"); }}>
          <i className="bi bi-box-arrow-right" /><span>Log out</span>
        </button>
      </div>
    </nav>
  );
}
