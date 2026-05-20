import { Fragment } from "react";
import { FLAG_EMOJI } from "../tournamentData";
import TeamAutocomplete from "./TeamAutocomplete";

// Bracket tree for R32 → R16 → QF → SF → FINAL.
//
// Layout: five flex columns of equal height with `justify-around`. Each
// match's vertical centre lands at (i + 0.5) / M * H within its column, so
// the next round's match (which has half the count) sits exactly between
// its two predecessors. SVG strips between columns draw the bracket
// connectors at the correct y-positions without measuring the DOM.
//
// Props:
//   slots          - { R32: string[32], R16: string[16], QF: string[8],
//                      SF: string[4], FINAL: string[2] } - teams to display
//   compareAgainst - same shape, optional. When provided, each slot is
//                    "correct" (green) when it matches the displayed team.
//                    Used by the actuals tree to highlight correct picks.
//   onSlotChange   - (round, slotIndex, team) callback for editable slots
//   readOnly       - bool, disables all editing
//   saveStatus     - { `${round}:${slot}`: "saving"|"saved"|"error" }
//   lockedRounds   - { [round]: bool } - disables editing on locked rounds

const ROUND_ORDER = ["R32", "R16", "QF", "SF", "FINAL"];
const ROUND_LABELS = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  FINAL: "Final",
};
const MATCH_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, FINAL: 1 };

const MATCH_HEIGHT = 92;
const COLUMN_WIDTH = 168;
const CONNECTOR_WIDTH = 28;

function Slot({ team, onChange, disabled, status, highlight }) {
  const flag = team ? FLAG_EMOJI[team] || "" : "";

  const highlightClasses =
    highlight === "correct"
      ? "bg-green-100 border-green-300 text-green-900"
      : highlight === "eliminated"
      ? "bg-slate-100 border-slate-200 text-slate-400"
      : null;

  if (disabled) {
    return (
      <div
        className={`relative flex items-center gap-1.5 px-2 h-[40px] text-xs rounded border ${
          highlightClasses ||
          (team
            ? "bg-white border-slate-200"
            : "bg-slate-50 border-dashed border-slate-200 text-slate-400 italic")
        }`}
      >
        {team ? (
          <>
            <span className="text-sm leading-none shrink-0">{flag}</span>
            <span className="truncate">{team}</span>
          </>
        ) : (
          <span className="truncate">— TBD —</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: 40 }}>
      <TeamAutocomplete value={team} onChange={onChange} />
      {status === "saving" && (
        <span className="absolute -top-1.5 right-1 text-[10px] text-slate-400">
          saving…
        </span>
      )}
      {status === "saved" && (
        <span className="absolute -top-1.5 right-1 text-[10px] text-emerald-600">
          ✓ saved
        </span>
      )}
      {status === "error" && (
        <span className="absolute -top-1.5 right-1 text-[10px] text-red-600">
          ✗ error
        </span>
      )}
    </div>
  );
}

function Match({ height, slot1, slot2 }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ height, width: COLUMN_WIDTH }}
    >
      <div className="w-full space-y-1.5">
        {slot1}
        {slot2}
      </div>
    </div>
  );
}

function ConnectorStrip({ matchesInNextRound, totalHeight }) {
  if (matchesInNextRound < 1) return null;
  const m2 = matchesInNextRound;
  const m1 = m2 * 2;
  const lines = [];
  for (let k = 0; k < m2; k += 1) {
    const yTop = 2 * k + 0.5;
    const yBot = 2 * k + 1.5;
    const yMid = (yTop + yBot) / 2;
    lines.push(
      <Fragment key={k}>
        <line x1="0" y1={yTop} x2="0.5" y2={yTop} />
        <line x1="0" y1={yBot} x2="0.5" y2={yBot} />
        <line x1="0.5" y1={yTop} x2="0.5" y2={yBot} />
        <line x1="0.5" y1={yMid} x2="1" y2={yMid} />
      </Fragment>,
    );
  }
  return (
    <svg
      width={CONNECTOR_WIDTH}
      height={totalHeight}
      viewBox={`0 0 1 ${m1}`}
      preserveAspectRatio="none"
      className="shrink-0"
    >
      <g
        stroke="#cbd5e1"
        strokeWidth="0.04"
        vectorEffect="non-scaling-stroke"
        fill="none"
      >
        {lines}
      </g>
    </svg>
  );
}

function RoundColumn({ height, children }) {
  return (
    <div
      className="flex flex-col items-stretch justify-around shrink-0"
      style={{ height, width: COLUMN_WIDTH }}
    >
      {children}
    </div>
  );
}

export default function BracketTree({
  slots,
  compareAgainst = null,
  onSlotChange,
  readOnly = false,
  saveStatus = {},
  lockedRounds = {},
}) {
  const totalHeight = MATCH_COUNTS.R32 * MATCH_HEIGHT;

  const highlightFor = (round, slotIndex, displayTeam) => {
    if (!compareAgainst) return null;
    if (!displayTeam) return null;
    const other = compareAgainst[round]?.[slotIndex] ?? null;
    if (other && other === displayTeam) return "correct";
    return null;
  };

  const renderRound = (round) => {
    const count = MATCH_COUNTS[round];
    const teams = slots?.[round] || new Array(count * 2).fill(null);
    const locked = readOnly || Boolean(lockedRounds[round]);

    const matches = [];
    for (let m = 0; m < count; m += 1) {
      const i1 = m * 2;
      const i2 = m * 2 + 1;
      const t1 = teams[i1] ?? null;
      const t2 = teams[i2] ?? null;
      matches.push(
        <Match
          key={m}
          height={totalHeight / count}
          slot1={
            <Slot
              team={t1}
              disabled={locked}
              onChange={(team) => onSlotChange?.(round, i1, team)}
              status={saveStatus[`${round}:${i1}`]}
              highlight={highlightFor(round, i1, t1)}
            />
          }
          slot2={
            <Slot
              team={t2}
              disabled={locked}
              onChange={(team) => onSlotChange?.(round, i2, team)}
              status={saveStatus[`${round}:${i2}`]}
              highlight={highlightFor(round, i2, t2)}
            />
          }
        />,
      );
    }

    return (
      <RoundColumn key={round} height={totalHeight}>
        {matches}
      </RoundColumn>
    );
  };

  return (
    <div className="overflow-x-auto pb-3">
      <div className="inline-flex flex-col">
        <div className="flex">
          {ROUND_ORDER.map((round, i) => (
            <Fragment key={round}>
              <div
                className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold text-center pb-2"
                style={{ width: COLUMN_WIDTH }}
              >
                {ROUND_LABELS[round]}
              </div>
              {i < ROUND_ORDER.length - 1 && (
                <div style={{ width: CONNECTOR_WIDTH }} />
              )}
            </Fragment>
          ))}
        </div>
        <div className="flex items-stretch">
          {ROUND_ORDER.map((round, i) => (
            <Fragment key={round}>
              {renderRound(round)}
              {i < ROUND_ORDER.length - 1 && (
                <ConnectorStrip
                  matchesInNextRound={MATCH_COUNTS[ROUND_ORDER[i + 1]]}
                  totalHeight={totalHeight}
                />
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
