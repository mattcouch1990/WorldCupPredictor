import { useState } from "react";
import { useAuth } from "../AuthContext";
import { submitProfile } from "../api";

const TEAM_NAME_MAX = 30;

export default function ProfileModal() {
  const { refreshUser } = useAuth();
  const [realName, setRealName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await submitProfile(realName.trim(), teamName.trim());
      await refreshUser();
    } catch (err) {
      setError(err.message || "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  const teamRemaining = TEAM_NAME_MAX - teamName.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-7 space-y-5 border border-slate-200"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Welcome! Set up your profile</h2>
          <p className="text-sm text-slate-500">
            Pick a team name your friends will see on the leaderboard. You can change neither
            after the tournament starts, so make it good.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Real name</span>
          <input
            type="text"
            required
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            maxLength={120}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Team name</span>
          <input
            type="text"
            required
            value={teamName}
            onChange={(e) => setTeamName(e.target.value.slice(0, TEAM_NAME_MAX))}
            maxLength={TEAM_NAME_MAX}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <div className="mt-1 text-xs text-slate-400 text-right">
            {teamRemaining} chars remaining
          </div>
        </label>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !realName.trim() || !teamName.trim()}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-medium py-2.5 text-sm transition"
        >
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
