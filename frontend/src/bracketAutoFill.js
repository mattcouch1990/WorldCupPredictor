// Pure auto-fill for the R32 bracket from group-stage predictions.
//
// Mirrors backend/scoring.py:rank_third_place_teams for the best-3rds ranking
// (points → GD → GS → fair-play → FIFA rank). Pure: no fetch, no DOM, no
// React — safe to unit-test in isolation.

import { computeGroupTable } from "./groupTableLogic";
import { fifaRank } from "./tournamentData";

// Match -> (group-winner, runner-up) matchups that don't depend on the
// best-3rds outcome. `slot` here is a *match index* (0..15); each match
// fills two backend slot_index values: `slot*2` and `slot*2 + 1`.
// Matches with no third-place team involved
export const R32_FIXED = [
  { slot: 0,  team1: "runner_up_A", team2: "runner_up_B" },  // M73
  { slot: 1,  team1: "winner_F",    team2: "runner_up_C" },  // M75
  { slot: 2,  team1: "winner_C",    team2: "runner_up_F" },  // M76
  { slot: 3,  team1: "runner_up_E", team2: "runner_up_I" },  // M78
  { slot: 4,  team1: "runner_up_K", team2: "runner_up_L" },  // M83
  { slot: 5,  team1: "winner_H",    team2: "runner_up_J" },  // M84
  { slot: 6,  team1: "winner_J",    team2: "runner_up_H" },  // M86
  { slot: 7,  team1: "runner_up_D", team2: "runner_up_G" },  // M88
];

// Matches where a group winner faces a best-3rd-place team
export const R32_THIRD_PLACE_SLOTS = [
  { slot: 8,  winner: "winner_E", eligibleGroups: ["A","B","C","D","F"] }, // M74
  { slot: 9,  winner: "winner_I", eligibleGroups: ["C","D","F","G","H"] }, // M77
  { slot: 10, winner: "winner_A", eligibleGroups: ["C","E","F","H","I"] }, // M79
  { slot: 11, winner: "winner_L", eligibleGroups: ["E","H","I","J","K"] }, // M80
  { slot: 12, winner: "winner_D", eligibleGroups: ["B","E","F","I","J"] }, // M81
  { slot: 13, winner: "winner_G", eligibleGroups: ["A","E","H","I","J"] }, // M82
  { slot: 14, winner: "winner_B", eligibleGroups: ["E","F","G","I","J"] }, // M85
  { slot: 15, winner: "winner_K", eligibleGroups: ["D","E","I","J","L"] }, // M87
];

export function rankThirdPlaceTeams(thirds) {
  return [...thirds].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goal_difference !== a.goal_difference)
      return b.goal_difference - a.goal_difference;
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
    if ((b.fair_play || 0) !== (a.fair_play || 0))
      return (b.fair_play || 0) - (a.fair_play || 0);
    const ra = a.fifa_rank ?? fifaRank(a.team);
    const rb = b.fifa_rank ?? fifaRank(b.team);
    return ra - rb;
  });
}

function resolveSlotKey(key, tables) {
  let kind;
  let letter;
  if (key.startsWith("runner_up_")) {
    kind = "runner_up";
    letter = key.slice("runner_up_".length);
  } else if (key.startsWith("winner_")) {
    kind = "winner";
    letter = key.slice("winner_".length);
  } else {
    return null;
  }
  const table = tables[letter];
  if (!table || table.length < 2) return null;
  if (kind === "winner") return table[0].team;
  return table[1].team;
}

// allGroupPredictions: { [letter]: { fixtures, predictions } }
// Returns 32 R32 team slots (2 per match) and an optional note describing
// any missing predictions. Slots that cannot be resolved are `null`.
export function autoFillBracket(allGroupPredictions) {
  const tables = {};
  let incompleteGroups = false;

  for (const letter of Object.keys(allGroupPredictions || {})) {
    const entry = allGroupPredictions[letter] || {};
    const fixtures = entry.fixtures || [];
    const predictions = entry.predictions || [];
    const filledPredictions = predictions.filter(
      (p) => p.pred_goals_a !== null && p.pred_goals_b !== null,
    );
    if (filledPredictions.length < (fixtures.length || 6)) {
      incompleteGroups = true;
    }
    tables[letter] = computeGroupTable(fixtures, predictions);
  }

  const slots = new Array(32).fill(null);

  for (const cfg of R32_FIXED) {
    slots[cfg.slot * 2] = resolveSlotKey(cfg.team1, tables);
    slots[cfg.slot * 2 + 1] = resolveSlotKey(cfg.team2, tables);
  }

  const allThirds = Object.keys(tables)
    .map((letter) => {
      const t = tables[letter];
      if (!t || t.length < 3) return null;
      return { ...t[2], group: letter };
    })
    .filter(Boolean);

  const rankedThirds = rankThirdPlaceTeams(allThirds);
  const qualifiers = rankedThirds.slice(0, 8);

  const slotAssignments = {};
  for (const third of qualifiers) {
    for (const cfg of R32_THIRD_PLACE_SLOTS) {
      if (
        cfg.eligibleGroups.includes(third.group) &&
        !(cfg.slot in slotAssignments)
      ) {
        slotAssignments[cfg.slot] = third.team;
        break;
      }
    }
  }

  for (const cfg of R32_THIRD_PLACE_SLOTS) {
    slots[cfg.slot * 2] = resolveSlotKey(cfg.winner, tables);
    slots[cfg.slot * 2 + 1] = slotAssignments[cfg.slot] ?? null;
  }

  let note = null;
  const unfilledThirdSlots =
    R32_THIRD_PLACE_SLOTS.length - Object.keys(slotAssignments).length;
  if (incompleteGroups) {
    note =
      "Some group predictions are missing — those bracket slots will be left as TBD";
  } else if (unfilledThirdSlots > 0) {
    note =
      "Could not assign third-place teams to every slot — some left as TBD";
  }

  return { r32Slots: slots, note };
}
