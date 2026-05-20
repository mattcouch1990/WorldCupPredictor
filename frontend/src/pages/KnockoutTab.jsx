import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllGroupPredictions,
  getKnockoutPredictions,
  getKnockoutResults,
  getSpecialPredictions,
  patchKnockoutPrediction,
  patchSpecialPredictions,
} from "../api";
import BracketTree from "../components/BracketTree";
import { useLockStatus } from "../components/MainLayout";
import TeamAutocomplete from "../components/TeamAutocomplete";
import { autoFillBracket } from "../bracketAutoFill";
import { FLAG_EMOJI } from "../tournamentData";

const SAVED_FLASH_MS = 1800;

function buildSlotArrays(predictions) {
  const out = {
    R32: new Array(32).fill(null),
    R16: new Array(16).fill(null),
    QF: new Array(8).fill(null),
    SF: new Array(4).fill(null),
    FINAL: new Array(2).fill(null),
    THIRD: new Array(2).fill(null),
  };
  for (const p of predictions || []) {
    if (out[p.round]) out[p.round][p.slot_index] = p.predicted_team;
  }
  return out;
}

function buildResultArrays(results) {
  const out = {
    R32: new Array(32).fill(null),
    R16: new Array(16).fill(null),
    QF: new Array(8).fill(null),
    SF: new Array(4).fill(null),
    FINAL: new Array(2).fill(null),
    THIRD: new Array(2).fill(null),
  };
  for (const r of results || []) {
    if (out[r.round]) out[r.round][r.slot_index] = r.actual_team;
  }
  return out;
}

export default function KnockoutTab() {
  const lockStatus = useLockStatus();

  const [slots, setSlots] = useState(() => buildSlotArrays([]));
  const [actuals, setActuals] = useState(() => buildResultArrays([]));
  const [hasResults, setHasResults] = useState(false);
  const [special, setSpecial] = useState({
    predicted_winner: null,
    predicted_third: null,
    predicted_top_scorer: "",
    tiebreaker_goals: "",
  });
  const [saveStatus, setSaveStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [autoFillPreview, setAutoFillPreview] = useState(null);
  const [autoFillRunning, setAutoFillRunning] = useState(false);

  const lockedRounds = useMemo(
    () => ({
      R32: Boolean(lockStatus?.groups?.locked),
      R16: Boolean(lockStatus?.R16?.locked),
      QF: Boolean(lockStatus?.QF?.locked),
      SF: Boolean(lockStatus?.SF?.locked),
      FINAL: Boolean(lockStatus?.FINAL?.locked),
      THIRD: Boolean(lockStatus?.SF?.locked),
    }),
    [lockStatus],
  );
  const specialLocked = Boolean(lockStatus?.FINAL?.locked);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getKnockoutPredictions(),
      getSpecialPredictions(),
      getKnockoutResults().catch(() => []),
    ])
      .then(([ko, sp, results]) => {
        if (cancelled) return;
        setSlots(buildSlotArrays(ko?.predictions || []));
        setSpecial({
          predicted_winner: sp?.predicted_winner ?? null,
          predicted_third: sp?.predicted_third ?? null,
          predicted_top_scorer: sp?.predicted_top_scorer ?? "",
          tiebreaker_goals:
            sp?.tiebreaker_goals === null || sp?.tiebreaker_goals === undefined
              ? ""
              : String(sp.tiebreaker_goals),
        });
        const resultsArray = Array.isArray(results) ? results : [];
        setActuals(buildResultArrays(resultsArray));
        setHasResults(resultsArray.length > 0);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load knockout data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const flashSaved = useCallback((key) => {
    setTimeout(() => {
      setSaveStatus((prev) => {
        if (prev[key] !== "saved") return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, SAVED_FLASH_MS);
  }, []);

  const saveSlot = useCallback(
    async (round, slotIndex, team) => {
      const key = `${round}:${slotIndex}`;
      setSaveStatus((prev) => ({ ...prev, [key]: "saving" }));
      try {
        await patchKnockoutPrediction(round, slotIndex, team);
        setSaveStatus((prev) => ({ ...prev, [key]: "saved" }));
        flashSaved(key);
      } catch (err) {
        setSaveStatus((prev) => ({ ...prev, [key]: "error" }));
        console.error("Save knockout slot failed", err);
      }
    },
    [flashSaved],
  );

  const onSlotChange = useCallback(
    (round, slotIndex, team) => {
      setSlots((prev) => {
        const next = { ...prev, [round]: [...prev[round]] };
        next[round][slotIndex] = team;
        return next;
      });
      saveSlot(round, slotIndex, team);
    },
    [saveSlot],
  );

  const onAutoFillClick = useCallback(async () => {
    try {
      const data = await getAllGroupPredictions();
      const result = autoFillBracket(data?.groups || {});
      setAutoFillPreview(result);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load all group predictions", err);
      setAutoFillPreview({
        r32Slots: new Array(32).fill(null),
        note: "Failed to load group predictions",
        failed: true,
      });
    }
  }, []);

  const onAutoFillConfirm = useCallback(async () => {
    if (!autoFillPreview) return;
    setAutoFillRunning(true);
    const teams = autoFillPreview.r32Slots;
    setSlots((prev) => ({ ...prev, R32: [...teams] }));

    const tasks = teams.map((team, slot) =>
      patchKnockoutPrediction("R32", slot, team).catch((err) => {
        console.error("Auto-fill save failed", slot, err);
        return null;
      }),
    );
    await Promise.all(tasks);
    setAutoFillRunning(false);
    setAutoFillPreview(null);
  }, [autoFillPreview]);

  const onSpecialBlur = useCallback(
    async (field, rawValue) => {
      let payloadValue = rawValue;
      if (field === "tiebreaker_goals") {
        if (rawValue === "" || rawValue === null) payloadValue = null;
        else {
          const parsed = Number.parseInt(rawValue, 10);
          if (Number.isNaN(parsed) || parsed < 0) return;
          payloadValue = parsed;
        }
      } else if (field === "predicted_top_scorer") {
        payloadValue = rawValue.trim() || null;
      }
      const key = `special:${field}`;
      setSaveStatus((prev) => ({ ...prev, [key]: "saving" }));
      try {
        await patchSpecialPredictions({ [field]: payloadValue });
        setSaveStatus((prev) => ({ ...prev, [key]: "saved" }));
        flashSaved(key);
      } catch (err) {
        setSaveStatus((prev) => ({ ...prev, [key]: "error" }));
        console.error("Save special failed", field, err);
      }
    },
    [flashSaved],
  );

  if (loading) {
    return (
      <div className="text-sm text-slate-400 py-8 text-center">
        Loading knockout bracket…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Your Bracket
          </h2>
          <button
            type="button"
            onClick={onAutoFillClick}
            disabled={lockedRounds.R32}
            className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            Auto-fill from group predictions
          </button>
        </div>

        <BracketTree
          slots={slots}
          onSlotChange={onSlotChange}
          saveStatus={saveStatus}
          lockedRounds={lockedRounds}
        />

        <ThirdPlaceSection
          slots={slots.THIRD}
          locked={lockedRounds.THIRD}
          saveStatus={saveStatus}
          onChange={(slotIndex, team) => onSlotChange("THIRD", slotIndex, team)}
          title="3rd-Place Play-off"
        />

        <SpecialPredictionsSection
          special={special}
          setSpecial={setSpecial}
          locked={specialLocked}
          saveStatus={saveStatus}
          onBlur={onSpecialBlur}
        />
      </section>

      {hasResults && (
        <section className="space-y-4 border-t border-slate-200 pt-8">
          <h2 className="text-lg font-semibold tracking-tight">
            Actual Bracket
          </h2>
          <p className="text-xs text-slate-500">
            Green slots are teams you predicted correctly.
          </p>
          <BracketTree slots={actuals} compareAgainst={slots} readOnly />
          <ThirdPlaceSection
            slots={actuals.THIRD}
            compareAgainst={slots.THIRD}
            locked
            saveStatus={{}}
            onChange={() => {}}
            title="3rd-Place Play-off — Actual"
          />
        </section>
      )}

      {autoFillPreview && (
        <AutoFillModal
          preview={autoFillPreview}
          running={autoFillRunning}
          onCancel={() => !autoFillRunning && setAutoFillPreview(null)}
          onConfirm={onAutoFillConfirm}
        />
      )}
    </div>
  );
}

function AutoFillModal({ preview, running, onCancel, onConfirm }) {
  const filledCount = preview.r32Slots.filter(Boolean).length;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-3">
        <h3 className="text-base font-semibold tracking-tight">
          Auto-fill R32 bracket?
        </h3>
        <p className="text-sm text-slate-600">
          This will overwrite your current R32 picks with the auto-generated
          bracket from your group predictions ({filledCount} of 32 slots
          filled).
        </p>
        {preview.note && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            {preview.note}
          </p>
        )}
        {preview.failed && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            Could not load your group predictions. Try again.
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={running}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={running || preview.failed}
            className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {running ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Third-Place Play-off section
// --------------------------------------------------------------------------- //

function ThirdPlaceSection({
  slots,
  compareAgainst = null,
  locked,
  saveStatus,
  onChange,
  title,
}) {
  const t1 = slots?.[0] ?? null;
  const t2 = slots?.[1] ?? null;

  const highlightFor = (idx, team) => {
    if (!compareAgainst || !team) return null;
    if (compareAgainst[idx] === team) return "correct";
    return null;
  };

  const slotClasses = (highlight, hasTeam) =>
    highlight === "correct"
      ? "bg-green-100 border-green-300 text-green-900"
      : hasTeam
      ? "bg-white border-slate-200"
      : "bg-slate-50 border-dashed border-slate-200 text-slate-400 italic";

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3 max-w-md">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="text-xs text-slate-500">
        SF losers play for 3rd place. Pick which two losing semi-finalists meet
        — the winner of that match takes 3rd.
      </p>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 w-16 shrink-0">
            SF loser 1
          </span>
          {locked ? (
            <div
              className={`flex-1 flex items-center gap-2 px-2 py-1.5 text-sm rounded border ${slotClasses(
                highlightFor(0, t1),
                Boolean(t1),
              )}`}
            >
              {t1 ? (
                <>
                  <span>{FLAG_EMOJI[t1] || ""}</span>
                  <span>{t1}</span>
                </>
              ) : (
                <span>— TBD —</span>
              )}
            </div>
          ) : (
            <div className="flex-1">
              <TeamAutocomplete
                value={t1}
                onChange={(team) => onChange(0, team)}
              />
            </div>
          )}
          <SaveBadge status={saveStatus[`THIRD:0`]} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 w-16 shrink-0">
            3rd place
          </span>
          {locked ? (
            <div
              className={`flex-1 flex items-center gap-2 px-2 py-1.5 text-sm rounded border ${slotClasses(
                highlightFor(1, t2),
                Boolean(t2),
              )}`}
            >
              {t2 ? (
                <>
                  <span>{FLAG_EMOJI[t2] || ""}</span>
                  <span>{t2}</span>
                </>
              ) : (
                <span>— TBD —</span>
              )}
            </div>
          ) : (
            <div className="flex-1">
              <TeamAutocomplete
                value={t2}
                onChange={(team) => onChange(1, team)}
              />
            </div>
          )}
          <SaveBadge status={saveStatus[`THIRD:1`]} />
        </div>
      </div>
    </div>
  );
}

function SaveBadge({ status }) {
  if (!status) return <span className="w-14 shrink-0" />;
  if (status === "saving")
    return (
      <span className="w-14 shrink-0 text-[10px] text-slate-400 text-right">
        saving…
      </span>
    );
  if (status === "saved")
    return (
      <span className="w-14 shrink-0 text-[10px] text-emerald-600 text-right">
        ✓ saved
      </span>
    );
  return (
    <span className="w-14 shrink-0 text-[10px] text-red-600 text-right">
      ✗ error
    </span>
  );
}

// --------------------------------------------------------------------------- //
// Special predictions section
// --------------------------------------------------------------------------- //

function SpecialPredictionsSection({
  special,
  setSpecial,
  locked,
  saveStatus,
  onBlur,
}) {
  const updateField = (field, value) =>
    setSpecial((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3 max-w-md">
      <h3 className="text-sm font-semibold tracking-tight">
        Special Predictions
      </h3>
      <Row
        icon="🏆"
        label="Tournament Winner"
        badge={<SaveBadge status={saveStatus[`special:predicted_winner`]} />}
      >
        {locked ? (
          <ReadOnlyTeam team={special.predicted_winner} />
        ) : (
          <TeamAutocomplete
            value={special.predicted_winner}
            onChange={(team) => {
              updateField("predicted_winner", team);
              onBlur("predicted_winner", team);
            }}
          />
        )}
      </Row>
      <Row
        icon="🥉"
        label="3rd Place"
        badge={<SaveBadge status={saveStatus[`special:predicted_third`]} />}
      >
        {locked ? (
          <ReadOnlyTeam team={special.predicted_third} />
        ) : (
          <TeamAutocomplete
            value={special.predicted_third}
            onChange={(team) => {
              updateField("predicted_third", team);
              onBlur("predicted_third", team);
            }}
          />
        )}
      </Row>
      <Row
        icon="⚽"
        label="Top Goalscorer"
        badge={
          <SaveBadge status={saveStatus[`special:predicted_top_scorer`]} />
        }
      >
        <input
          type="text"
          value={special.predicted_top_scorer}
          disabled={locked}
          onChange={(e) =>
            updateField("predicted_top_scorer", e.target.value)
          }
          onBlur={(e) =>
            onBlur("predicted_top_scorer", e.target.value)
          }
          placeholder="e.g. Lionel Messi"
          className="w-full px-2 py-1.5 text-sm rounded border border-slate-200 focus:border-slate-400 outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
      </Row>
      <Row
        icon="🎯"
        label="Tiebreaker goals"
        badge={
          <SaveBadge status={saveStatus[`special:tiebreaker_goals`]} />
        }
      >
        <input
          type="number"
          min={0}
          max={500}
          value={special.tiebreaker_goals}
          disabled={locked}
          onChange={(e) =>
            updateField("tiebreaker_goals", e.target.value)
          }
          onBlur={(e) => onBlur("tiebreaker_goals", e.target.value)}
          placeholder="Total goals in the tournament"
          className="w-full px-2 py-1.5 text-sm rounded border border-slate-200 focus:border-slate-400 outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
      </Row>
    </div>
  );
}

function Row({ icon, label, badge, children }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-lg leading-none mt-1 shrink-0 w-5 text-center">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
        {children}
      </div>
      <div className="pt-5">{badge}</div>
    </div>
  );
}

function ReadOnlyTeam({ team }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm rounded border border-slate-200 bg-slate-50">
      {team ? (
        <>
          <span>{FLAG_EMOJI[team] || ""}</span>
          <span>{team}</span>
        </>
      ) : (
        <span className="text-slate-400 italic">— not set —</span>
      )}
    </div>
  );
}
