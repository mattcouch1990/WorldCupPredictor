// Pure client-side group table calculator. Mirrors backend/scoring.py exactly.
//
// 8-step tiebreaker:
//   1. Points
//   2. Head-to-head points (between tied teams only)
//   3. Head-to-head goal difference
//   4. Head-to-head goals scored
//   5. Overall goal difference
//   6. Overall goals scored
//   7. Fair play (always 0 for predictions)
//   8. FIFA ranking (lower number wins)
//
// `fixtures` is the array returned by GET /predictions/group/{letter}.fixtures
// (each item has team_a, team_b, matchday). `predictions` is the array of the
// user's prediction rows for this group. Missing or null scores count as 0-0
// for display only, exactly like the backend does.

import { fifaRank } from "./tournamentData";

function emptyStats(team) {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_for: 0,
    goals_against: 0,
    goal_difference: 0,
    points: 0,
    fair_play: 0,
    fifa_rank: fifaRank(team),
  };
}

function applyMatch(stats, a, b, ga, gb) {
  const sa = stats[a];
  const sb = stats[b];
  sa.played += 1; sb.played += 1;
  sa.goals_for += ga; sa.goals_against += gb;
  sb.goals_for += gb; sb.goals_against += ga;
  if (ga > gb) { sa.wins += 1; sa.points += 3; sb.losses += 1; }
  else if (gb > ga) { sb.wins += 1; sb.points += 3; sa.losses += 1; }
  else { sa.draws += 1; sb.draws += 1; sa.points += 1; sb.points += 1; }
  sa.goal_difference = sa.goals_for - sa.goals_against;
  sb.goal_difference = sb.goals_for - sb.goals_against;
}

function buildScoreMap(fixtures, predictions) {
  // Predictions are keyed by the unordered pair of teams; store the value with
  // its original orientation so we can re-orient against the fixture row.
  const lookup = new Map();
  for (const p of predictions || []) {
    const key = [p.team_a, p.team_b].sort().join("|");
    lookup.set(key, {
      team_a: p.team_a,
      pred_goals_a: p.pred_goals_a,
      pred_goals_b: p.pred_goals_b,
    });
  }
  const scoreMap = [];
  for (const fx of fixtures) {
    const key = [fx.team_a, fx.team_b].sort().join("|");
    const hit = lookup.get(key);
    let ga = 0;
    let gb = 0;
    if (hit) {
      if (hit.team_a === fx.team_a) {
        ga = hit.pred_goals_a ?? 0;
        gb = hit.pred_goals_b ?? 0;
      } else {
        ga = hit.pred_goals_b ?? 0;
        gb = hit.pred_goals_a ?? 0;
      }
    }
    scoreMap.push({ a: fx.team_a, b: fx.team_b, ga, gb });
  }
  return scoreMap;
}

function breakTies(tied, stats, scoreMap) {
  const h2h = {};
  for (const t of tied) h2h[t] = { points: 0, gd: 0, gs: 0 };
  const set = new Set(tied);
  for (const { a, b, ga, gb } of scoreMap) {
    if (!set.has(a) || !set.has(b)) continue;
    if (ga > gb) h2h[a].points += 3;
    else if (gb > ga) h2h[b].points += 3;
    else { h2h[a].points += 1; h2h[b].points += 1; }
    h2h[a].gd += ga - gb; h2h[b].gd += gb - ga;
    h2h[a].gs += ga; h2h[b].gs += gb;
  }
  return [...tied].sort((x, y) => {
    if (h2h[y].points !== h2h[x].points) return h2h[y].points - h2h[x].points;
    if (h2h[y].gd !== h2h[x].gd) return h2h[y].gd - h2h[x].gd;
    if (h2h[y].gs !== h2h[x].gs) return h2h[y].gs - h2h[x].gs;
    if (stats[y].goal_difference !== stats[x].goal_difference)
      return stats[y].goal_difference - stats[x].goal_difference;
    if (stats[y].goals_for !== stats[x].goals_for)
      return stats[y].goals_for - stats[x].goals_for;
    if (stats[y].fair_play !== stats[x].fair_play)
      return stats[y].fair_play - stats[x].fair_play;
    return stats[x].fifa_rank - stats[y].fifa_rank;
  });
}

export function computeGroupTable(fixtures, predictions) {
  if (!fixtures || fixtures.length === 0) return [];
  const teams = Array.from(
    new Set(fixtures.flatMap((fx) => [fx.team_a, fx.team_b])),
  );
  const stats = {};
  for (const t of teams) stats[t] = emptyStats(t);
  const scoreMap = buildScoreMap(fixtures, predictions);
  for (const { a, b, ga, gb } of scoreMap) applyMatch(stats, a, b, ga, gb);

  const sortedByPoints = [...teams].sort(
    (x, y) => stats[y].points - stats[x].points,
  );
  const ranked = [];
  let i = 0;
  while (i < sortedByPoints.length) {
    let j = i + 1;
    while (
      j < sortedByPoints.length &&
      stats[sortedByPoints[j]].points === stats[sortedByPoints[i]].points
    ) j += 1;
    const bucket = sortedByPoints.slice(i, j);
    ranked.push(...(bucket.length > 1 ? breakTies(bucket, stats, scoreMap) : bucket));
    i = j;
  }
  return ranked.map((t) => stats[t]);
}
