"""All scoring logic for the prediction game.

Three public entry points:

- ``compute_group_table(group, predictions=None, results=None)`` — build the
  sorted standings for one group using the full 8-step tiebreaker. If both
  ``predictions`` and ``results`` are supplied, ``results`` take precedence
  fixture by fixture (used when displaying actuals over predictions).

- ``rank_third_place_teams(all_group_tables)`` — sort the 12 third-placed
  teams by the 5-step third-place criteria.

- ``compute_user_score(user_id, db)`` — return a points breakdown
  ``{group_points, knockout_points, special_points, total}`` for one user.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    GroupPrediction,
    GroupResult,
    KnockoutPrediction,
    KnockoutResult,
    SpecialPrediction,
    TopGoalscorer,
)
from .tournament_data import FIFA_RANKINGS, GROUP_FIXTURES, GROUPS


# --------------------------------------------------------------------------- #
# Group table
# --------------------------------------------------------------------------- #

KNOCKOUT_POINTS: dict[str, int] = {
    "R32": 4,
    "R16": 8,
    "QF": 16,
    "SF": 32,
    "FINAL": 64,
}

WINNER_POINTS = 150
THIRD_PLACE_POINTS = 50
TOP_SCORER_POINTS = 100

EXACT_SCORE_POINTS = 3
CORRECT_RESULT_POINTS = 1


def _empty_stats(team: str) -> dict[str, Any]:
    return {
        "team": team,
        "played": 0,
        "wins": 0,
        "draws": 0,
        "losses": 0,
        "goals_for": 0,
        "goals_against": 0,
        "goal_difference": 0,
        "points": 0,
        "fair_play": 0,
        "fifa_rank": FIFA_RANKINGS.get(team, 999),
    }


def _apply_match(stats: dict[str, dict], a: str, b: str, ga: int, gb: int) -> None:
    sa, sb = stats[a], stats[b]
    sa["played"] += 1
    sb["played"] += 1
    sa["goals_for"] += ga
    sa["goals_against"] += gb
    sb["goals_for"] += gb
    sb["goals_against"] += ga
    if ga > gb:
        sa["wins"] += 1
        sa["points"] += 3
        sb["losses"] += 1
    elif gb > ga:
        sb["wins"] += 1
        sb["points"] += 3
        sa["losses"] += 1
    else:
        sa["draws"] += 1
        sb["draws"] += 1
        sa["points"] += 1
        sb["points"] += 1
    sa["goal_difference"] = sa["goals_for"] - sa["goals_against"]
    sb["goal_difference"] = sb["goals_for"] - sb["goals_against"]


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _build_score_map(
    group: str,
    predictions: Iterable[Any] | None,
    results: Iterable[Any] | None,
) -> dict[tuple[str, str], tuple[int, int]]:
    """Return ``{(team_a, team_b): (goals_a, goals_b)}`` for the group.

    Predictions provide a 0-0 default for missing matches; results override
    predictions match-by-match when supplied. Keys preserve fixture orientation
    (team_a, team_b) from ``GROUP_FIXTURES``.
    """
    fixtures = GROUP_FIXTURES[group]
    score_map: dict[tuple[str, str], tuple[int, int]] = {}

    if predictions is not None:
        pred_lookup: dict[frozenset[str], tuple[int | None, int | None, str]] = {}
        for p in predictions:
            ta = _attr(p, "team_a")
            tb = _attr(p, "team_b")
            ga = _coerce_int(_attr(p, "pred_goals_a", "goals_a"))
            gb = _coerce_int(_attr(p, "pred_goals_b", "goals_b"))
            pred_lookup[frozenset({ta, tb})] = (ga, gb, ta)
        for fx in fixtures:
            ta, tb = fx["team_a"], fx["team_b"]
            key = frozenset({ta, tb})
            if key in pred_lookup:
                ga, gb, stored_a = pred_lookup[key]
                if stored_a != ta:
                    ga, gb = gb, ga
                score_map[(ta, tb)] = (ga if ga is not None else 0, gb if gb is not None else 0)
            else:
                score_map[(ta, tb)] = (0, 0)

    if results is not None:
        for r in results:
            ta = _attr(r, "team_a")
            tb = _attr(r, "team_b")
            ga = _coerce_int(_attr(r, "actual_goals_a", "goals_a"))
            gb = _coerce_int(_attr(r, "actual_goals_b", "goals_b"))
            if ga is None or gb is None:
                continue
            for fx in fixtures:
                fxa, fxb = fx["team_a"], fx["team_b"]
                if {fxa, fxb} == {ta, tb}:
                    if ta == fxa:
                        score_map[(fxa, fxb)] = (ga, gb)
                    else:
                        score_map[(fxa, fxb)] = (gb, ga)
                    break

    return score_map


def _attr(obj: Any, *names: str) -> Any:
    for n in names:
        if isinstance(obj, dict):
            if n in obj:
                return obj[n]
        else:
            if hasattr(obj, n):
                return getattr(obj, n)
    return None


def compute_group_table(
    group: str,
    predictions: Iterable[Any] | None = None,
    results: Iterable[Any] | None = None,
) -> list[dict[str, Any]]:
    """Return the group's sorted standings using the 8-step tiebreaker.

    Sort order:
      1. Points
      2. Head-to-head points (between tied teams only)
      3. Head-to-head goal difference
      4. Head-to-head goals scored
      5. Overall goal difference
      6. Overall goals scored
      7. Fair play score (0 across the board until real fair-play data lands)
      8. FIFA ranking (lower number is better)
    """
    if group not in GROUPS:
        raise ValueError(f"Unknown group: {group}")

    teams = list(GROUPS[group])
    stats = {t: _empty_stats(t) for t in teams}
    scores = _build_score_map(group, predictions, results)

    for (a, b), (ga, gb) in scores.items():
        if a in stats and b in stats:
            _apply_match(stats, a, b, ga, gb)

    return _rank_group(teams, stats, scores)


def _rank_group(
    teams: list[str],
    stats: dict[str, dict[str, Any]],
    scores: dict[tuple[str, str], tuple[int, int]],
) -> list[dict[str, Any]]:
    """Sort teams by points, then break ties within each point bucket."""
    by_points = sorted(teams, key=lambda t: -stats[t]["points"])
    ranked: list[str] = []
    i = 0
    while i < len(by_points):
        j = i + 1
        while (
            j < len(by_points)
            and stats[by_points[j]]["points"] == stats[by_points[i]]["points"]
        ):
            j += 1
        bucket = by_points[i:j]
        ranked.extend(_break_ties(bucket, stats, scores) if len(bucket) > 1 else bucket)
        i = j
    return [stats[t] for t in ranked]


def _break_ties(
    tied: list[str],
    stats: dict[str, dict[str, Any]],
    scores: dict[tuple[str, str], tuple[int, int]],
) -> list[str]:
    h2h = {t: {"points": 0, "gd": 0, "gs": 0} for t in tied}
    tied_set = set(tied)
    for (a, b), (ga, gb) in scores.items():
        if a in tied_set and b in tied_set:
            if ga > gb:
                h2h[a]["points"] += 3
            elif gb > ga:
                h2h[b]["points"] += 3
            else:
                h2h[a]["points"] += 1
                h2h[b]["points"] += 1
            h2h[a]["gd"] += ga - gb
            h2h[b]["gd"] += gb - ga
            h2h[a]["gs"] += ga
            h2h[b]["gs"] += gb

    def sort_key(team: str) -> tuple:
        s = stats[team]
        return (
            -h2h[team]["points"],
            -h2h[team]["gd"],
            -h2h[team]["gs"],
            -s["goal_difference"],
            -s["goals_for"],
            -s["fair_play"],  # less negative (closer to 0) is better
            s["fifa_rank"],
        )

    return sorted(tied, key=sort_key)


# --------------------------------------------------------------------------- #
# Third-place ranking
# --------------------------------------------------------------------------- #

def rank_third_place_teams(
    all_group_tables: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Return the 12 third-placed teams sorted by the 5-step criteria.

    Each returned entry is the team's stats dict with an added ``group`` key.
    Sort order: points, GD, GS, fair play, FIFA ranking.
    """
    thirds: list[dict[str, Any]] = []
    for letter, table in all_group_tables.items():
        if len(table) < 3:
            continue
        entry = dict(table[2])
        entry["group"] = letter
        thirds.append(entry)

    thirds.sort(
        key=lambda s: (
            -s["points"],
            -s["goal_difference"],
            -s["goals_for"],
            -s.get("fair_play", 0),
            s.get("fifa_rank", FIFA_RANKINGS.get(s["team"], 999)),
        )
    )
    return thirds


# --------------------------------------------------------------------------- #
# Per-user score
# --------------------------------------------------------------------------- #

async def compute_user_score(user_id: int, db: AsyncSession) -> dict[str, int]:
    """Return ``{group_points, knockout_points, special_points, total}``.

    Group points: 3 for an exact score, 1 for the correct result (W/D/L) only.
    Only matches with both a non-null prediction AND a stored actual result
    count. Knockout points: per round, every correct team gets that round's
    flat reward. Special points: tournament winner (150), 3rd place (50),
    top scorer (100, case-insensitive match).
    """
    group_points = 0
    knockout_points = 0
    special_points = 0

    pred_rows = (await db.execute(
        select(GroupPrediction).where(GroupPrediction.user_id == user_id)
    )).scalars().all()
    result_rows = (await db.execute(select(GroupResult))).scalars().all()

    result_lookup: dict[tuple[str, frozenset[str]], tuple[int, int, str]] = {}
    for r in result_rows:
        key = (r.group, frozenset({r.team_a, r.team_b}))
        result_lookup[key] = (r.actual_goals_a, r.actual_goals_b, r.team_a)

    for p in pred_rows:
        if p.pred_goals_a is None or p.pred_goals_b is None:
            continue
        key = (p.group, frozenset({p.team_a, p.team_b}))
        actual = result_lookup.get(key)
        if actual is None:
            continue
        ga_actual, gb_actual, stored_a = actual
        if stored_a == p.team_a:
            actual_a, actual_b = ga_actual, gb_actual
        else:
            actual_a, actual_b = gb_actual, ga_actual

        if p.pred_goals_a == actual_a and p.pred_goals_b == actual_b:
            group_points += EXACT_SCORE_POINTS
        elif _result_sign(p.pred_goals_a, p.pred_goals_b) == _result_sign(actual_a, actual_b):
            group_points += CORRECT_RESULT_POINTS

    ko_preds = (await db.execute(
        select(KnockoutPrediction).where(KnockoutPrediction.user_id == user_id)
    )).scalars().all()
    ko_results = (await db.execute(select(KnockoutResult))).scalars().all()

    ko_actual: dict[tuple[str, int], str] = {
        (r.round, r.slot_index): r.actual_team for r in ko_results
    }

    for kp in ko_preds:
        if kp.predicted_team is None:
            continue
        actual_team = ko_actual.get((kp.round, kp.slot_index))
        if actual_team and actual_team == kp.predicted_team:
            knockout_points += KNOCKOUT_POINTS.get(kp.round, 0)

    special = (await db.execute(
        select(SpecialPrediction).where(SpecialPrediction.user_id == user_id)
    )).scalar_one_or_none()

    if special is not None:
        winner_actual = ko_actual.get(("FINAL", 0))
        third_actual = ko_actual.get(("THIRD", 0))
        if winner_actual and special.predicted_winner == winner_actual:
            special_points += WINNER_POINTS
        if third_actual and special.predicted_third == third_actual:
            special_points += THIRD_PLACE_POINTS

        top_row = (await db.execute(select(TopGoalscorer))).scalar_one_or_none()
        if (
            top_row is not None
            and special.predicted_top_scorer
            and special.predicted_top_scorer.strip().lower() == top_row.name.strip().lower()
        ):
            special_points += TOP_SCORER_POINTS

    return {
        "group_points": group_points,
        "knockout_points": knockout_points,
        "special_points": special_points,
        "total": group_points + knockout_points + special_points,
    }


def _result_sign(a: int, b: int) -> int:
    if a > b:
        return 1
    if a < b:
        return -1
    return 0
