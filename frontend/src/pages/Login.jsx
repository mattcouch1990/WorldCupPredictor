import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), passcode.trim());
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.status === 401 ? "Invalid email or passcode" : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-12">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-5 border border-slate-200"
      >
        <div className="text-center space-y-1">
          <div className="text-3xl">⚽</div>
          <h1 className="text-xl font-semibold tracking-tight">WC2026 Predictions</h1>
          <p className="text-sm text-slate-500">Log in with the email and passcode from the admin</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Passcode</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-medium py-2.5 text-sm transition"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>

        <p className="text-xs text-slate-400 text-center">
          No self-registration — passcodes are issued by the admin.
        </p>
      </form>
    </div>
  );
}
