import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { getLeaderboard } from "../api";
import { useLockStatus } from "../components/MainLayout";

const AUTO_REFRESH_MS = 60_000;

function formatRelative(targetIso) {
  if (!targetIso) return "";
  const now = Date.now();
  const target = new Date(targetIso).getTime();
  const ms = target - now;
  if (ms <= 0) return "0 minutes";

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || (!days && !hours)) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatTime(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

// Assigns dense rank order where tied totals share the same rank and the
// next entry skips ahead (1, 2, 2, 4, …).
function assignRanks(entries) {
  let lastTotal = null;
  let lastRank = 0;
  return entries.map((e, i) => {
    if (e.total !== lastTotal) {
      lastRank = i + 1;
      lastTotal = e.total;
    }
    return { ...e, rank: lastRank };
  });
}

function tiedTotals(entries) {
  const counts = new Map();
  for (const e of entries) counts.set(e.total, (counts.get(e.total) || 0) + 1);
  const tied = new Set();
  for (const [total, count] of counts) if (count > 1) tied.add(total);
  return tied;
}

export default function LeaderboardTab() {
  const { user } = useAuth();
  const lockStatus = useLockStatus();
  const groupsLocked = Boolean(lockStatus?.groups?.locked);
  const groupsLockIso = lockStatus?.groups?.locks_at;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [, forceTick] = useState(0);

  const intervalRef = useRef(null);

  const fetchOnce = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await getLeaderboard();
      setData(result);
      setLastFetched(new Date());
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load leaderboard");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchOnce, AUTO_REFRESH_MS);
  }, [fetchOnce]);

  useEffect(() => {
    fetchOnce();
    startAutoRefresh();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [fetchOnce, startAutoRefresh]);

  // Re-render the countdown every minute when groups not locked yet.
  useEffect(() => {
    if (groupsLocked) return undefined;
    const t = setInterval(() => forceTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, [groupsLocked]);

  const onManualRefresh = () => {
    fetchOnce();
    startAutoRefresh();
  };

  const rankedEntries = useMemo(() => {
    if (!data?.entries) return [];
    return assignRanks(data.entries);
  }, [data]);

  const tied = useMemo(() => tiedTotals(rankedEntries), [rankedEntries]);

  if (loading) {
    return (
      <div className="text-sm text-slate-400 py-8 text-center">
        Loading leaderboard…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Leaderboard</h2>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-xs text-slate-400">
              Updated {formatTime(lastFetched)}
            </span>
          )}
          <button
            type="button"
            onClick={onManualRefresh}
            disabled={refreshing}
            className="text-sm px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? "↻" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {!groupsLocked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Predictions close in{" "}
          <span className="font-semibold">
            {formatRelative(groupsLockIso)}
          </span>
          . Scores appear here after the first match kicks off.
        </div>
      )}

      {data?.total_tournament_goals !== null &&
        data?.total_tournament_goals !== undefined && (
          <div className="text-xs text-slate-500">
            Total tournament goals so far:{" "}
            <span className="font-semibold text-slate-700">
              {data.total_tournament_goals}
            </span>
          </div>
        )}

      <LeaderboardTable
        entries={rankedEntries}
        currentUserId={user?.id}
        tiedTotals={tied}
        groupsLocked={groupsLocked}
        totalGoals={data?.total_tournament_goals ?? null}
      />
    </div>
  );
}

export function LeaderboardTable({
  entries,
  currentUserId,
  tiedTotals: tied = new Set(),
  groupsLocked = true,
  totalGoals = null,
  showTiebreakerColumn = false,
}) {
  if (!entries.length) {
    return (
      <div className="text-center text-slate-500 py-8 text-sm">
        No users yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="min-w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="text-left font-semibold py-2 px-2 w-10">#</th>
            <th className="text-left font-semibold py-2 px-2">Team</th>
            <th className="text-left font-semibold py-2 px-2 hidden sm:table-cell">
              Real Name
            </th>
            <th className="text-right font-semibold py-2 px-2 hidden md:table-cell">
              Group
            </th>
            <th className="text-right font-semibold py-2 px-2 hidden md:table-cell">
              Knockout
            </th>
            <th className="text-right font-semibold py-2 px-2 hidden md:table-cell">
              Special
            </th>
            <th className="text-right font-semibold py-2 px-2">Total</th>
            {showTiebreakerColumn && (
              <th className="text-right font-semibold py-2 px-2">
                Tiebreaker
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isCurrent = entry.user_id === currentUserId;
            const showTie =
              !showTiebreakerColumn &&
              groupsLocked &&
              tied.has(entry.total) &&
              entry.tiebreaker_goals !== null &&
              entry.tiebreaker_goals !== undefined;
            const blank = !groupsLocked;
            return (
              <tr
                key={entry.user_id}
                className={`border-b border-slate-100 ${
                  isCurrent ? "bg-blue-50" : ""
                }`}
              >
                <td className="py-2 px-2 text-slate-500">{entry.rank}</td>
                <td className="py-2 px-2 font-medium truncate max-w-[150px]">
                  {entry.team_name || (
                    <span className="text-slate-400 italic">—</span>
                  )}
                </td>
                <td className="py-2 px-2 hidden sm:table-cell text-slate-600 truncate max-w-[150px]">
                  {entry.real_name || (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2 px-2 text-right hidden md:table-cell">
                  {blank ? "—" : entry.group_points}
                </td>
                <td className="py-2 px-2 text-right hidden md:table-cell">
                  {blank ? "—" : entry.knockout_points}
                </td>
                <td className="py-2 px-2 text-right hidden md:table-cell">
                  {blank ? "—" : entry.special_points}
                </td>
                <td className="py-2 px-2 text-right font-semibold">
                  {blank ? "—" : entry.total}
                  {showTie && (
                    <div className="text-[10px] font-normal text-slate-400">
                      pred: {entry.tiebreaker_goals} goals
                    </div>
                  )}
                </td>
                {showTiebreakerColumn && (
                  <td className="py-2 px-2 text-right text-slate-600">
                    {entry.tiebreaker_goals === null ||
                    entry.tiebreaker_goals === undefined
                      ? "—"
                      : `${entry.tiebreaker_goals} goals`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalGoals !== null && showTiebreakerColumn && (
        <div className="text-xs text-slate-500 mt-2 px-2">
          Actual total tournament goals:{" "}
          <span className="font-semibold text-slate-700">{totalGoals}</span>
        </div>
      )}
    </div>
  );
}
