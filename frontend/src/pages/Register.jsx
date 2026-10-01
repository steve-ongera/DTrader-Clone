import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../services/api";

export default function Register() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await register({ ...f, email: f.email.trim().toLowerCase() }); nav("/"); }
    catch (ex) { setErr(errorMessage(ex)); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo mx-auto mb-3">DT</div>
        <h5 className="text-center mb-1">Create your account</h5>
        <p className="text-center text-body-secondary small mb-4">You start with a demo account of 10,000 USD.</p>
        <label className="form-label small">Email</label>
        <input type="email" className="form-control mb-3" value={f.email} onChange={set("email")} required autoFocus />
        <label className="form-label small">M-Pesa phone (optional)</label>
        <input className="form-control mb-3" value={f.phone} onChange={set("phone")} placeholder="0712345678" />
        <label className="form-label small">Password (min. 8 characters)</label>
        <input type="password" minLength={8} className="form-control mb-3" value={f.password} onChange={set("password")} required />
        {err && <div className="alert alert-danger py-2">{err}</div>}
        <button className="btn btn-danger w-100" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <p className="text-center small mt-3 mb-0">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
