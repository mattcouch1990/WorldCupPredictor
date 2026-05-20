import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminLogin,
  deleteAdminLockOverride,
  deleteAdminUser,
  getAdminGroupResults,
  getAdminKnockoutResults,
  getAdminLockStatus,
  getAdminTopGoalscorer,
  getAdminTournamentGoals,
  getAdminUsers,
  getAdminToken,
  getLeaderboard,
  postAdminGroupResult,
  postAdminKnockoutResult,
  postAdminLock,
  postAdminRecomputeScores,
  postAdminTopGoalscorer,
  postAdminTournamentGoals,
  postAdminUnlock,
  postAdminUser,
  setAdminToken,
} from "../api";
import TeamAutocomplete from "../components/TeamAutocomplete";
import { GROUP_LETTERS, buildGroupFixtures } from "../tournamentData";
import { LeaderboardTable } from "./LeaderboardTab";

const SAVED_FLASH_MS = 1500;
const KNOCKOUT_ROUND_LABELS = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  FINAL: "Final",
  THIRD: "Third-place play-off",
};
const KNOCKOUT_ROUNDS = ["R32", "R16", "QF", "SF", "FINAL", "THIRD"];
const KNOCKOUT_SLOT_COUNTS = {
  R32: 32,
  R16: 16,
  QF: 8,
  SF: 4,
  FINAL: 2,
  THIRD: 2,
};
const KNOCKOUT_SLOT_LABEL = {
  FINAL: ["Winner", "Runner-up"],
  THIRD: ["3rd place", "4th place"],
};

const LOCK_ROUNDS = ["groups", "R32", "R16", "QF", "SF", "FINAL"];

export default function AdminPanel() {
  const [token, setTok] = useState(() => getAdminToken());

  const onLoginSuccess = (newToken) => {
    setAdminToken(newToken);
    setTok(newToken);
  };

  const onLogout = () => {
    setAdminToken(null);
    setTok(null);
  };

  if (!token) {
    return <AdminLogin onSuccess={onLoginSuccess} />;
  }
  return <AdminDashboard onLogout={onLogout} />;
}

function AdminLogin({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await adminLogin(password);
      onSuccess(res.access_token);
    } catch (err) {
      setError(err.message || "Invalid password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full max-w-sm p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <span>⚙️</span> Admin Panel
        </h1>
        <div className="space-y-1">
          <label className="text-xs text-slate-500 uppercase tracking-wider">
            Password
          </label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-slate-400 outline-none text-sm"
          />
        </div>
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full text-sm px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {busy ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  );
}

function AdminDashboard({ onLogout }) {
  const [tab, setTab] = useState("results");
  const tabs = [
    ["results", "Results"],
    ["locks", "Lock Control"],
    ["users", "Users"],
    ["scores", "Scores"],
    ["tournament", "Tournament"],
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <span className="font-semibold tracking-tight">WC2026 Admin</span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Logout
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                tab === id
                  ? "border-slate-900 text-slate-900 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {tab === "results" && <ResultsTab />}
        {tab === "locks" && <LockControlTab />}
        {tab === "users" && <UsersTab />}
        {tab === "scores" && <ScoresTab />}
        {tab === "tournament" && <TournamentTab />}
      </main>
    </div>
  );
}

function useFlash() {
  const [status, setStatus] = useState({});
  const flash = useCallback((key, value, ms = SAVED_FLASH_MS) => {
    setStatus((prev) => ({ ...prev, [key]: value }));
    if (value === "saved") {
      setTimeout(() => {
        setStatus((prev) => {
          if (prev[key] !== "saved") return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, ms);
    }
  }, []);
  return [status, flash];
}

// --------------------------------------------------------------------------- //
// Results tab
// --------------------------------------------------------------------------- //

function ResultsTab() {
  const [groupResults, setGroupResults] = useState({});
  const [koResults, setKoResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, flash] = useFlash();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [groups, ko] = await Promise.all([
        getAdminGroupResults(),
        getAdminKnockoutResults(),
      ]);
      const gMap = {};
      for (const r of groups || []) {
        const key = `${r.group}|${[r.team_a, r.team_b].sort().join("|")}`;
        gMap[key] = r;
      }
      const kMap = {};
      for (const r of ko || []) kMap[`${r.round}:${r.slot_index}`] = r;
      setGroupResults(gMap);
      setKoResults(kMap);
    } catch (err) {
      setError(err.message || "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) return <p className="text-sm text-slate-400">Loading results…</p>;
  if (error)
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {error}
      </p>
    );

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-3">
          Group Results
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {GROUP_LETTERS.map((letter) => (
            <GroupResultsCard
              key={letter}
              letter={letter}
              groupResults={groupResults}
              status={status}
              flash={flash}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-3">
          Knockout Results
        </h2>
        <div className="space-y-5">
          {KNOCKOUT_ROUNDS.map((round) => (
            <KnockoutResultsCard
              key={round}
              round={round}
              koResults={koResults}
              status={status}
              flash={flash}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function GroupResultsCard({ letter, groupResults, status, flash }) {
  const fixtures = useMemo(() => buildGroupFixtures(letter), [letter]);
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(
      fixtures.map((fx) => {
        const key = `${letter}|${[fx.team_a, fx.team_b].sort().join("|")}`;
        const r = groupResults[key];
        return [
          fixtureKey(fx),
          {
            goals_a:
              r && r.team_a === fx.team_a
                ? r.actual_goals_a
                : r
                ? r.actual_goals_b
                : "",
            goals_b:
              r && r.team_a === fx.team_a
                ? r.actual_goals_b
                : r
                ? r.actual_goals_a
                : "",
          },
        ];
      }),
    ),
  );

  const onSave = async (fx) => {
    const k = fixtureKey(fx);
    const e = entries[k];
    const ga = Number.parseInt(e.goals_a, 10);
    const gb = Number.parseInt(e.goals_b, 10);
    if (Number.isNaN(ga) || Number.isNaN(gb)) {
      flash(`group:${k}`, "error");
      return;
    }
    flash(`group:${k}`, "saving");
    try {
      await postAdminGroupResult(letter, fx.team_a, fx.team_b, ga, gb);
      await postAdminRecomputeScores().catch(() => null);
      flash(`group:${k}`, "saved");
    } catch (err) {
      console.error(err);
      flash(`group:${k}`, "error");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold tracking-tight">Group {letter}</h3>
      <div className="space-y-1.5">
        {fixtures.map((fx) => {
          const k = fixtureKey(fx);
          const e = entries[k];
          const s = status[`group:${k}`];
          return (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-right">{fx.team_a}</span>
              <input
                type="number"
                min={0}
                max={99}
                value={e.goals_a}
                onChange={(ev) =>
                  setEntries((prev) => ({
                    ...prev,
                    [k]: { ...prev[k], goals_a: ev.target.value },
                  }))
                }
                className="w-12 px-1.5 py-1 text-center rounded border border-slate-200 focus:border-slate-400 outline-none"
              />
              <span className="text-slate-400">–</span>
              <input
                type="number"
                min={0}
                max={99}
                value={e.goals_b}
                onChange={(ev) =>
                  setEntries((prev) => ({
                    ...prev,
                    [k]: { ...prev[k], goals_b: ev.target.value },
                  }))
                }
                className="w-12 px-1.5 py-1 text-center rounded border border-slate-200 focus:border-slate-400 outline-none"
              />
              <span className="flex-1 truncate">{fx.team_b}</span>
              <button
                type="button"
                onClick={() => onSave(fx)}
                className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
              >
                Save
              </button>
              <SaveBadge status={s} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KnockoutResultsCard({ round, koResults, status, flash }) {
  const count = KNOCKOUT_SLOT_COUNTS[round];
  const [values, setValues] = useState(() => {
    const arr = new Array(count).fill(null);
    for (let i = 0; i < count; i += 1) {
      const r = koResults[`${round}:${i}`];
      if (r) arr[i] = r.actual_team;
    }
    return arr;
  });

  const onSave = async (slot) => {
    const team = values[slot];
    if (!team) {
      flash(`ko:${round}:${slot}`, "error");
      return;
    }
    flash(`ko:${round}:${slot}`, "saving");
    try {
      await postAdminKnockoutResult(round, slot, team);
      await postAdminRecomputeScores().catch(() => null);
      flash(`ko:${round}:${slot}`, "saved");
    } catch (err) {
      console.error(err);
      flash(`ko:${round}:${slot}`, "error");
    }
  };

  const labelFor = (slot) => {
    if (KNOCKOUT_SLOT_LABEL[round]) return KNOCKOUT_SLOT_LABEL[round][slot];
    return `${round} #${slot + 1}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold tracking-tight">
        {KNOCKOUT_ROUND_LABELS[round]}
      </h3>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {Array.from({ length: count }, (_, slot) => (
          <div key={slot} className="flex items-center gap-2 text-sm">
            <span className="text-xs text-slate-500 w-20 shrink-0">
              {labelFor(slot)}
            </span>
            <div className="flex-1 min-w-0">
              <TeamAutocomplete
                value={values[slot]}
                onChange={(team) =>
                  setValues((prev) => {
                    const next = [...prev];
                    next[slot] = team;
                    return next;
                  })
                }
              />
            </div>
            <button
              type="button"
              onClick={() => onSave(slot)}
              className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
            >
              Save
            </button>
            <SaveBadge status={status[`ko:${round}:${slot}`]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function fixtureKey(fx) {
  return [fx.team_a, fx.team_b].sort().join("|");
}

function SaveBadge({ status }) {
  if (!status) return <span className="w-10 shrink-0" />;
  if (status === "saving")
    return (
      <span className="w-10 shrink-0 text-[10px] text-slate-400">saving…</span>
    );
  if (status === "saved")
    return (
      <span className="w-10 shrink-0 text-[10px] text-emerald-600">✓</span>
    );
  return <span className="w-10 shrink-0 text-[10px] text-red-600">✗</span>;
}

// --------------------------------------------------------------------------- //
// Lock control tab
// --------------------------------------------------------------------------- //

function LockControlTab() {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminLockStatus();
      setRounds(data?.rounds || []);
    } catch (err) {
      setError(err.message || "Failed to load lock status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const doToggle = async (round, locked) => {
    setBusy(round);
    try {
      if (locked) await postAdminUnlock(round);
      else await postAdminLock(round);
      await reload();
    } catch (err) {
      setError(err.message || "Lock action failed");
    } finally {
      setBusy(null);
    }
  };

  const doClearOverride = async (round) => {
    setBusy(round);
    try {
      await deleteAdminLockOverride(round);
      await reload();
    } catch (err) {
      setError(err.message || "Failed to clear override");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">Lock Control</h2>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-semibold">Round</th>
              <th className="text-left py-2 px-3 font-semibold">
                Locks At (UTC)
              </th>
              <th className="text-left py-2 px-3 font-semibold">Status</th>
              <th className="text-right py-2 px-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {LOCK_ROUNDS.map((roundName) => {
              const r = rounds.find((x) => x.round === roundName);
              if (!r) return null;
              return (
                <tr
                  key={r.round}
                  className={`border-b border-slate-100 ${
                    r.overridden ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="py-2 px-3 font-medium">{r.round}</td>
                  <td className="py-2 px-3 text-slate-600">
                    {formatLockDate(r.locks_at)}
                  </td>
                  <td className="py-2 px-3">
                    {r.locked ? "🔒 Locked" : "🔓 Open"}
                    {r.overridden && (
                      <span className="ml-2 text-xs text-amber-700">
                        ⚠ overridden
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right space-x-2">
                    <button
                      type="button"
                      disabled={busy === r.round}
                      onClick={() => doToggle(r.round, r.locked)}
                      className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {r.locked ? "Unlock" : "Lock"}
                    </button>
                    {r.overridden && (
                      <button
                        type="button"
                        disabled={busy === r.round}
                        onClick={() => doClearOverride(r.round)}
                        className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Clear override
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatLockDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
}

// --------------------------------------------------------------------------- //
// Users tab
// --------------------------------------------------------------------------- //

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [email, setEmail] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createdInfo, setCreatedInfo] = useState(null);
  const [copyOk, setCopyOk] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getAdminUsers();
      setUsers(list || []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const onCreate = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setCreateBusy(true);
    try {
      const res = await postAdminUser(email.trim());
      setCreatedInfo(res);
      setEmail("");
      await reload();
    } catch (err) {
      setError(err.message || "Failed to create user");
    } finally {
      setCreateBusy(false);
    }
  };

  const onDelete = async (userId, label) => {
    if (!window.confirm(`Delete user ${label}? This removes all their data.`))
      return;
    try {
      await deleteAdminUser(userId);
      await reload();
    } catch (err) {
      setError(err.message || "Failed to delete user");
    }
  };

  const copyPasscode = async () => {
    if (!createdInfo) return;
    try {
      await navigator.clipboard.writeText(createdInfo.passcode);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      setCopyOk(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold tracking-tight">Users</h2>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <form
        onSubmit={onCreate}
        className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
      >
        <h3 className="text-sm font-semibold tracking-tight">Create user</h3>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm rounded border border-slate-200 focus:border-slate-400 outline-none"
          />
          <button
            type="submit"
            disabled={createBusy || !email.trim()}
            className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {createBusy ? "Creating…" : "Create User"}
          </button>
        </div>
        {createdInfo && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-1">
            <div className="text-sm text-emerald-900 font-semibold">
              ✓ User created
            </div>
            <div className="text-xs text-emerald-900">
              Email: <span className="font-mono">{createdInfo.user.email}</span>
            </div>
            <div className="text-xs text-emerald-900 flex items-center gap-2">
              Passcode:{" "}
              <span className="font-mono text-lg font-bold tracking-widest">
                {createdInfo.passcode}
              </span>
              <button
                type="button"
                onClick={copyPasscode}
                className="text-xs px-2 py-1 rounded border border-emerald-300 hover:bg-emerald-100"
              >
                {copyOk ? "Copied ✓" : "Copy passcode"}
              </button>
              <button
                type="button"
                onClick={() => setCreatedInfo(null)}
                className="text-xs text-emerald-700 hover:underline ml-auto"
              >
                Dismiss
              </button>
            </div>
            <div className="text-[11px] text-emerald-800">
              This passcode is shown only once — copy it now.
            </div>
          </div>
        )}
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 font-semibold">ID</th>
              <th className="text-left py-2 px-3 font-semibold">Email</th>
              <th className="text-left py-2 px-3 font-semibold">Team</th>
              <th className="text-left py-2 px-3 font-semibold">Real Name</th>
              <th className="text-left py-2 px-3 font-semibold">Created</th>
              <th className="text-right py-2 px-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="py-3 px-3 text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td className="py-3 px-3 text-slate-400" colSpan={6}>
                  No users yet.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2 px-3 text-slate-500">{u.id}</td>
                <td className="py-2 px-3">{u.email}</td>
                <td className="py-2 px-3">
                  {u.team_name || (
                    <span className="text-slate-400 italic">—</span>
                  )}
                </td>
                <td className="py-2 px-3">
                  {u.real_name || (
                    <span className="text-slate-400 italic">—</span>
                  )}
                </td>
                <td className="py-2 px-3 text-slate-500">
                  {(u.created_at || "").slice(0, 10)}
                </td>
                <td className="py-2 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(u.id, u.email)}
                    className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Scores tab
// --------------------------------------------------------------------------- //

function ScoresTab() {
  const [busy, setBusy] = useState(false);
  const [lastAt, setLastAt] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [error, setError] = useState(null);

  const loadBoard = useCallback(async () => {
    try {
      const data = await getLeaderboard();
      setLeaderboard(data);
    } catch (err) {
      setError(err.message || "Failed to load leaderboard");
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const onRecompute = async () => {
    setBusy(true);
    setError(null);
    try {
      await postAdminRecomputeScores();
      setLastAt(new Date());
      await loadBoard();
    } catch (err) {
      setError(err.message || "Recompute failed");
    } finally {
      setBusy(false);
    }
  };

  const rankedEntries = useMemo(() => {
    const entries = leaderboard?.entries || [];
    let lastTotal = null;
    let lastRank = 0;
    return entries.map((e, i) => {
      if (e.total !== lastTotal) {
        lastRank = i + 1;
        lastTotal = e.total;
      }
      return { ...e, rank: lastRank };
    });
  }, [leaderboard]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold tracking-tight">Scores</h2>
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onRecompute}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {busy ? "Recomputing…" : "↻ Recompute all scores"}
        </button>
        {lastAt && (
          <span className="text-xs text-emerald-700">
            ✓ Scores recomputed — {lastAt.toLocaleTimeString()}
          </span>
        )}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold tracking-tight mb-3">
          Full leaderboard
        </h3>
        <LeaderboardTable
          entries={rankedEntries}
          tiedTotals={new Set()}
          groupsLocked
          totalGoals={leaderboard?.total_tournament_goals ?? null}
          showTiebreakerColumn
        />
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Tournament tab
// --------------------------------------------------------------------------- //

function TournamentTab() {
  const [topScorer, setTopScorer] = useState("");
  const [totalGoals, setTotalGoals] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, flash] = useFlash();

  useEffect(() => {
    Promise.all([getAdminTopGoalscorer(), getAdminTournamentGoals()])
      .then(([t, g]) => {
        setTopScorer(t?.name || "");
        setTotalGoals(
          g?.total === null || g?.total === undefined ? "" : String(g.total),
        );
      })
      .catch((err) => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const saveTopScorer = async () => {
    if (!topScorer.trim()) {
      flash("top", "error");
      return;
    }
    flash("top", "saving");
    try {
      await postAdminTopGoalscorer(topScorer.trim());
      await postAdminRecomputeScores().catch(() => null);
      flash("top", "saved");
    } catch (err) {
      console.error(err);
      flash("top", "error");
    }
  };

  const saveTotalGoals = async () => {
    const n = Number.parseInt(totalGoals, 10);
    if (Number.isNaN(n) || n < 0) {
      flash("goals", "error");
      return;
    }
    flash("goals", "saving");
    try {
      await postAdminTournamentGoals(n);
      flash("goals", "saved");
    } catch (err) {
      console.error(err);
      flash("goals", "error");
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="text-lg font-semibold tracking-tight">
        Tournament metadata
      </h2>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <label className="text-xs uppercase tracking-wider text-slate-500">
          Top goalscorer
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={topScorer}
            onChange={(e) => setTopScorer(e.target.value)}
            placeholder="e.g. Erling Haaland"
            className="flex-1 px-3 py-1.5 text-sm rounded border border-slate-200 focus:border-slate-400 outline-none"
          />
          <button
            type="button"
            onClick={saveTopScorer}
            className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700"
          >
            Save
          </button>
          <SaveBadge status={status.top} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <label className="text-xs uppercase tracking-wider text-slate-500">
          Total tournament goals (tiebreaker reference)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={10000}
            value={totalGoals}
            onChange={(e) => setTotalGoals(e.target.value)}
            placeholder="e.g. 162"
            className="flex-1 px-3 py-1.5 text-sm rounded border border-slate-200 focus:border-slate-400 outline-none"
          />
          <button
            type="button"
            onClick={saveTotalGoals}
            className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700"
          >
            Save
          </button>
          <SaveBadge status={status.goals} />
        </div>
      </div>
    </div>
  );
}
