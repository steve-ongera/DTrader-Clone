import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../services/api";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await login(email.trim().toLowerCase(), password); nav("/"); }
    catch (ex) { setErr(ex.response?.status === 401 ? "Wrong email or password." : errorMessage(ex)); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo mx-auto mb-3">DT</div>
        <h5 className="text-center mb-4">Log in to DTrader</h5>
        <label className="form-label small">Email</label>
        <input type="email" className="form-control mb-3" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <label className="form-label small">Password</label>
        <input type="password" className="form-control mb-3" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="alert alert-danger py-2">{err}</div>}
        <button className="btn btn-danger w-100" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        <p className="text-center small mt-3 mb-0">New here? <Link to="/register">Create an account</Link></p>
      </form>
    </div>
  );
}
