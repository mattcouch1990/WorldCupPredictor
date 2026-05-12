import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getGroupPredictions,
  getGroupResults,
  patchGroupPrediction,
} from "../api";
import FixtureRow from "../components/FixtureRow";
import GroupTable from "../components/GroupTable";
import { useLockStatus } from "../components/MainLayout";
import { computeGroupTable } from "../groupTableLogic";

const SAVE_DEBOUNCE_MS = 500;
const SAVED_INDICATOR_MS = 2000;

function fixtureKey(a, b) {
  return [a, b].sort().join("|");
}

export default function GroupTab() {
  const { letter: rawLetter } = useParams();
  const letter = rawLetter?.toUpperCase();
  const lockStatus = useLockStatus();
  const groupsLocked = Boolean(lockStatus?.groups?.locked);

  const [fixtures, setFixtures] = useState([]);
  const [entries, setEntries] = useState({}); // key -> { goals_a, goals_b, raw_a, raw_b, status }
  const [actualResults, setActualResults] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // One timer per fixture key. Holds the pending debounced save call.
  const saveTimers = useRef({});
  const savedClearTimers = useRef({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getGroupPredictions(letter),
      getGroupResults(letter).catch(() => []),
    ])
      .then(([groupData, results]) => {
        if (cancelled) return;
        setFixtures(groupData.fixtures);
        setEntries(buildEntriesMap(groupData.fixtures, groupData.predictions));
        setActualResults(Array.isArray(results) ? results : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load group");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      Object.values(saveTimers.current).forEach(clearTimeout);
      Object.values(savedClearTimers.current).forEach(clearTimeout);
      saveTimers.current = {};
      savedClearTimers.current = {};
    };
  }, [letter]);

  const flashSaved = useCallback((key) => {
    clearTimeout(savedClearTimers.current[key]);
    savedClearTimers.current[key] = setTimeout(() => {
      setEntries((prev) => {
        const cur = prev[key];
        if (!cur || cur.status !== "saved") return prev;
        return { ...prev, [key]: { ...cur, status: null } };
      });
    }, SAVED_INDICATOR_MS);
  }, []);

  const scheduleSave = useCallback(
    (fixture, parsedA, parsedB) => {
      const key = fixtureKey(fixture.team_a, fixture.team_b);
      clearTimeout(saveTimers.current[key]);
      saveTimers.current[key] = setTimeout(async () => {
        setEntries((prev) => ({
          ...prev,
          [key]: { ...prev[key], status: "saving" },
        }));
        try {
          await patchGroupPrediction(
            letter,
            fixture.team_a,
            fixture.team_b,
            parsedA,
            parsedB,
          );
          setEntries((prev) => ({
            ...prev,
            [key]: { ...prev[key], status: "saved" },
          }));
          flashSaved(key);
        } catch (err) {
          setEntries((prev) => ({
            ...prev,
            [key]: { ...prev[key], status: "error" },
          }));
          // eslint-disable-next-line no-console
          console.error("Save failed", err);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [letter, flashSaved],
  );

  const onScoreChange = useCallback(
    (fixture, parsedA, parsedB, rawA, rawB) => {
      const key = fixtureKey(fixture.team_a, fixture.team_b);
      setEntries((prev) => ({
        ...prev,
        [key]: {
          goals_a: parsedA,
          goals_b: parsedB,
          raw_a: rawA,
          raw_b: rawB,
          status: prev[key]?.status ?? null,
        },
      }));
      scheduleSave(fixture, parsedA, parsedB);
    },
    [scheduleSave],
  );

  // Predictions used for the live table — fixture orientation preserved.
  const predictionsForTable = useMemo(
    () =>
      fixtures.map((fx) => {
        const key = fixtureKey(fx.team_a, fx.team_b);
        const e = entries[key] || {};
        return {
          team_a: fx.team_a,
          team_b: fx.team_b,
          pred_goals_a: e.goals_a ?? null,
          pred_goals_b: e.goals_b ?? null,
        };
      }),
    [fixtures, entries],
  );

  const table = useMemo(
    () => computeGroupTable(fixtures, predictionsForTable),
    [fixtures, predictionsForTable],
  );

  const actualTable = useMemo(() => {
    if (!actualResults.length) return null;
    const predictionsLike = actualResults.map((r) => ({
      team_a: r.team_a,
      team_b: r.team_b,
      pred_goals_a: r.actual_goals_a,
      pred_goals_b: r.actual_goals_b,
    }));
    const playedFixtures = fixtures.filter((fx) =>
      actualResults.some(
        (r) =>
          (r.team_a === fx.team_a && r.team_b === fx.team_b) ||
          (r.team_a === fx.team_b && r.team_b === fx.team_a),
      ),
    );
    return computeGroupTable(playedFixtures, predictionsLike);
  }, [fixtures, actualResults]);

  const fixturesByMatchday = useMemo(() => {
    const buckets = {};
    for (const fx of fixtures) {
      (buckets[fx.matchday] ??= []).push(fx);
    }
    return Object.entries(buckets).sort(
      ([a], [b]) => Number(a) - Number(b),
    );
  }, [fixtures]);

  if (loading) {
    return <div className="text-sm text-slate-400 py-8 text-center">Loading group {letter}…</div>;
  }

  if (error) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-3 tracking-tight">Group {letter}</h2>
        <div className="space-y-5">
          {fixturesByMatchday.map(([md, items]) => (
            <div key={md} className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                Matchday {md}
              </div>
              {items.map((fx) => {
                const key = fixtureKey(fx.team_a, fx.team_b);
                const e = entries[key] || {};
                return (
                  <FixtureRow
                    key={key}
                    fixture={fx}
                    goalsA={e.raw_a ?? (e.goals_a ?? null)}
                    goalsB={e.raw_b ?? (e.goals_b ?? null)}
                    locked={groupsLocked}
                    saveStatus={e.status}
                    onChange={(parsedA, parsedB, rawA, rawB) =>
                      onScoreChange(fx, parsedA, parsedB, rawA, rawB)
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Your Predicted Standings
        </h3>
        <GroupTable rows={table} title={`Group ${letter} — predicted`} variant="predicted" />
      </section>

      {actualResults.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Actual Results
          </h3>
          <div className="space-y-2">
            {actualResults.map((r) => (
              <div
                key={r.id}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm flex items-center justify-between"
              >
                <span>{r.team_a}</span>
                <span className="font-semibold">
                  {r.actual_goals_a} – {r.actual_goals_b}
                </span>
                <span>{r.team_b}</span>
              </div>
            ))}
          </div>
          {actualTable && (
            <GroupTable rows={actualTable} title="Official Standings" variant="actual" />
          )}
        </section>
      )}
    </div>
  );
}

function buildEntriesMap(fixtures, predictions) {
  const map = {};
  for (const fx of fixtures) map[fixtureKey(fx.team_a, fx.team_b)] = {
    goals_a: null,
    goals_b: null,
    raw_a: null,
    raw_b: null,
    status: null,
  };
  for (const p of predictions || []) {
    const key = fixtureKey(p.team_a, p.team_b);
    // Re-orient to fixture order.
    const fx = fixtures.find(
      (f) =>
        (f.team_a === p.team_a && f.team_b === p.team_b) ||
        (f.team_a === p.team_b && f.team_b === p.team_a),
    );
    if (!fx) continue;
    let ga, gb;
    if (fx.team_a === p.team_a) {
      ga = p.pred_goals_a;
      gb = p.pred_goals_b;
    } else {
      ga = p.pred_goals_b;
      gb = p.pred_goals_a;
    }
    map[key] = {
      goals_a: ga,
      goals_b: gb,
      raw_a: ga === null || ga === undefined ? null : String(ga),
      raw_b: gb === null || gb === undefined ? null : String(gb),
      status: null,
    };
  }
  return map;
}
