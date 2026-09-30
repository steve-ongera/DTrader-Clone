import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TradingProvider } from "./context/TradingContext";
import Trade from "./pages/Trade";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Positions from "./pages/Positions";
import Reports from "./pages/Reports";
import Cashier from "./pages/Cashier";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="vh-100 d-flex align-items-center justify-content-center">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TradingProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<Protected><Trade /></Protected>} />
            <Route path="/positions" element={<Protected><Positions /></Protected>} />
            <Route path="/reports" element={<Protected><Reports /></Protected>} />
            <Route path="/cashier" element={<Protected><Cashier /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </TradingProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
