import { FlagImg } from "./FlagImg";

function parseGoals(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  return Math.floor(n);
}

const STATUS_LABEL = {
  saving: { text: "saving…", className: "text-slate-400" },
  saved: { text: "✓ saved", className: "text-emerald-600" },
  error: { text: "✗ retry", className: "text-red-600" },
};

export default function FixtureRow({
  fixture,
  goalsA,
  goalsB,
  locked,
  saveStatus,
  onChange,
}) {
  function update(side, raw) {
    const next = { a: goalsA, b: goalsB, [side]: raw === "" ? "" : raw };
    onChange(parseGoals(next.a), parseGoals(next.b), next.a, next.b);
  }

  const status = STATUS_LABEL[saveStatus];
  const inputClass = `w-12 h-10 text-center text-base font-semibold rounded-lg border ${
    locked
      ? "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed"
      : "bg-white border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
  }`;

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <FlagImg team={fixture.team_a} />
        <span className="font-medium truncate">{fixture.team_a}</span>
      </div>

      <div className="flex items-center gap-2 justify-center">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          disabled={locked}
          value={goalsA ?? ""}
          onChange={(e) => update("a", e.target.value)}
          className={inputClass}
        />
        <span className="text-slate-400 text-sm">v</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          disabled={locked}
          value={goalsB ?? ""}
          onChange={(e) => update("b", e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-3 flex-1 min-w-0 sm:justify-end">
        <span className="font-medium truncate sm:text-right">{fixture.team_b}</span>
        <FlagImg team={fixture.team_b} />
      </div>

      <div className="text-xs text-slate-400 sm:w-20 sm:text-right">
        {status ? (
          <span className={status.className}>{status.text}</span>
        ) : (
          <span>{formatKickoff(fixture.kickoff_utc)}</span>
        )}
      </div>
    </div>
  );
}

function formatKickoff(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
