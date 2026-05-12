"""Tests for the scoring engine.

Covers:
- compute_group_table: clear winner, GD tiebreak, head-to-head tiebreak
- rank_third_place_teams: full 5-step ordering on a synthetic set
- compute_user_score: end-to-end DB-backed scoring with mixed predictions
"""

from __future__ import annotations

import pathlib
import sys
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from backend.database import Base  # noqa: E402
from backend.models import (  # noqa: E402
    GroupPrediction,
    GroupResult,
    KnockoutPrediction,
    KnockoutResult,
    SpecialPrediction,
    TopGoalscorer,
    User,
)
from backend.scoring import (  # noqa: E402
    compute_group_table,
    compute_user_score,
    rank_third_place_teams,
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _make_pred(group: str, a: str, b: str, ga: int | None, gb: int | None) -> dict:
    return {"group": group, "team_a": a, "team_b": b, "pred_goals_a": ga, "pred_goals_b": gb}


def _make_result(group: str, a: str, b: str, ga: int, gb: int) -> dict:
    return {"group": group, "team_a": a, "team_b": b, "actual_goals_a": ga, "actual_goals_b": gb}


# Group A teams in fixture-orientation order: Mexico, South Africa, South Korea, Czechia
# Fixtures (per _build_group_fixtures):
#   MD1: Mexico v South Africa, South Korea v Czechia
#   MD2: Mexico v South Korea, Czechia v South Africa
#   MD3: Czechia v Mexico, South Africa v South Korea


# --------------------------------------------------------------------------- #
# compute_group_table
# --------------------------------------------------------------------------- #

def test_group_table_clear_winner() -> None:
    """Mexico sweeps the group; expected to sit clear in first."""
    preds = [
        _make_pred("A", "Mexico", "South Africa", 3, 0),
        _make_pred("A", "South Korea", "Czechia", 1, 2),
        _make_pred("A", "Mexico", "South Korea", 2, 0),
        _make_pred("A", "Czechia", "South Africa", 1, 1),
        _make_pred("A", "Czechia", "Mexico", 0, 1),
        _make_pred("A", "South Africa", "South Korea", 0, 0),
    ]
    table = compute_group_table("A", predictions=preds)
    names = [row["team"] for row in table]
    assert names[0] == "Mexico"
    assert table[0]["points"] == 9
    assert table[0]["wins"] == 3
    assert table[0]["goal_difference"] == 6


def test_group_table_overall_gd_tiebreak() -> None:
    """Mexico and Czechia share 7 pts and draw head-to-head; overall GD breaks the tie."""
    preds = [
        _make_pred("A", "Mexico", "South Africa", 1, 0),
        _make_pred("A", "South Korea", "Czechia", 0, 1),
        _make_pred("A", "Mexico", "South Korea", 1, 0),
        _make_pred("A", "Czechia", "South Africa", 5, 0),
        _make_pred("A", "Czechia", "Mexico", 1, 1),
        _make_pred("A", "South Africa", "South Korea", 0, 0),
    ]
    table = compute_group_table("A", predictions=preds)
    by_team = {row["team"]: row for row in table}
    assert by_team["Mexico"]["points"] == 7
    assert by_team["Czechia"]["points"] == 7
    # h2h is identical (1-1 draw); overall GD: Czechia +5 vs Mexico +2.
    assert [row["team"] for row in table[:2]] == ["Czechia", "Mexico"]


def test_group_table_head_to_head_tiebreak() -> None:
    """Mexico and Czechia share 6 pts; Mexico won the head-to-head 2-1 so ranks above
    Czechia despite worse overall GD."""
    preds = [
        _make_pred("A", "Mexico", "South Africa", 2, 0),
        _make_pred("A", "South Korea", "Czechia", 0, 1),
        _make_pred("A", "Mexico", "South Korea", 0, 1),
        _make_pred("A", "Czechia", "South Africa", 3, 0),
        _make_pred("A", "Czechia", "Mexico", 1, 2),
        _make_pred("A", "South Africa", "South Korea", 1, 0),
    ]
    table = compute_group_table("A", predictions=preds)
    by_team = {row["team"]: row for row in table}
    assert by_team["Mexico"]["points"] == 6
    assert by_team["Czechia"]["points"] == 6
    # Czechia's overall GD (+3) beats Mexico's (+2) — h2h must override.
    assert by_team["Czechia"]["goal_difference"] > by_team["Mexico"]["goal_difference"]
    assert [row["team"] for row in table[:2]] == ["Mexico", "Czechia"]


def test_group_table_missing_predictions_default_to_zero_zero() -> None:
    """A user who predicts nothing should produce an all-zero, all-drawn group."""
    table = compute_group_table("A", predictions=[])
    assert all(row["points"] == 3 for row in table)  # three 0-0 draws each
    assert all(row["played"] == 3 for row in table)
    assert all(row["goal_difference"] == 0 for row in table)


# --------------------------------------------------------------------------- #
# rank_third_place_teams
# --------------------------------------------------------------------------- #

def test_rank_third_place_teams_orders_by_points_then_gd_then_gs() -> None:
    """Three teams: clearer points lead first, then GD, then goals scored."""
    third_place_in_each_group = {
        "A": [
            {"team": "Mexico", "points": 9, "goal_difference": 5, "goals_for": 8, "fair_play": 0, "fifa_rank": 11},
            {"team": "South Korea", "points": 6, "goal_difference": 1, "goals_for": 3, "fair_play": 0, "fifa_rank": 22},
            # Third place — 3 pts, GD 0, GF 2.
            {"team": "Czechia", "points": 3, "goal_difference": 0, "goals_for": 2, "fair_play": 0, "fifa_rank": 37},
            {"team": "South Africa", "points": 1, "goal_difference": -6, "goals_for": 1, "fair_play": 0, "fifa_rank": 61},
        ],
        "B": [
            {"team": "Canada", "points": 7, "goal_difference": 4, "goals_for": 6, "fair_play": 0, "fifa_rank": 27},
            {"team": "Switzerland", "points": 5, "goal_difference": 2, "goals_for": 4, "fair_play": 0, "fifa_rank": 17},
            # Third place — 4 pts, beats the rest on points.
            {"team": "Qatar", "points": 4, "goal_difference": 1, "goals_for": 3, "fair_play": 0, "fifa_rank": 51},
            {"team": "Bosnia and Herzegovina", "points": 0, "goal_difference": -7, "goals_for": 0, "fair_play": 0, "fifa_rank": 65},
        ],
        "C": [
            {"team": "Brazil", "points": 9, "goal_difference": 6, "goals_for": 9, "fair_play": 0, "fifa_rank": 5},
            {"team": "Morocco", "points": 6, "goal_difference": 2, "goals_for": 4, "fair_play": 0, "fifa_rank": 11},
            # Third place — 3 pts, GD +1, GF 4 (better GD/GS than Czechia's 3pt).
            {"team": "Haiti", "points": 3, "goal_difference": 1, "goals_for": 4, "fair_play": 0, "fifa_rank": 84},
            {"team": "Scotland", "points": 0, "goal_difference": -9, "goals_for": 0, "fair_play": 0, "fifa_rank": 36},
        ],
    }
    ranked = rank_third_place_teams(third_place_in_each_group)
    names = [row["team"] for row in ranked]
    # Qatar (4 pts) above the 3-pt pair; Haiti above Czechia by GD then GS.
    assert names == ["Qatar", "Haiti", "Czechia"]
    assert ranked[0]["group"] == "B"
    assert ranked[1]["group"] == "C"
    assert ranked[2]["group"] == "A"


# --------------------------------------------------------------------------- #
# compute_user_score — async DB integration
# --------------------------------------------------------------------------- #

@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with sessionmaker() as s:
        yield s
    await engine.dispose()


@pytest.mark.asyncio
async def test_compute_user_score_mixed_predictions(session: AsyncSession) -> None:
    """A user with one exact score, one correct-result-only, one wrong result,
    one correct R32 pick, one correct winner pick, and a matching top-scorer."""
    user = User(email="player@example.com", passcode_hash="x", team_name="T", real_name="R")
    session.add(user)
    await session.commit()
    await session.refresh(user)

    # Group predictions
    session.add_all([
        GroupPrediction(  # exact match → 3 pts
            user_id=user.id, group="A", team_a="Mexico", team_b="South Africa",
            pred_goals_a=2, pred_goals_b=1,
        ),
        GroupPrediction(  # correct result (home win), wrong score → 1 pt
            user_id=user.id, group="A", team_a="Mexico", team_b="South Korea",
            pred_goals_a=3, pred_goals_b=0,
        ),
        GroupPrediction(  # wrong result → 0 pts
            user_id=user.id, group="A", team_a="Czechia", team_b="South Africa",
            pred_goals_a=2, pred_goals_b=0,
        ),
        GroupPrediction(  # no actual result yet → 0 pts even if predicted
            user_id=user.id, group="A", team_a="South Africa", team_b="South Korea",
            pred_goals_a=1, pred_goals_b=1,
        ),
        GroupPrediction(  # null prediction → 0 pts
            user_id=user.id, group="A", team_a="South Korea", team_b="Czechia",
            pred_goals_a=None, pred_goals_b=None,
        ),
    ])
    session.add_all([
        GroupResult(group="A", team_a="Mexico", team_b="South Africa",
                    actual_goals_a=2, actual_goals_b=1),
        GroupResult(group="A", team_a="Mexico", team_b="South Korea",
                    actual_goals_a=1, actual_goals_b=0),
        GroupResult(group="A", team_a="Czechia", team_b="South Africa",
                    actual_goals_a=0, actual_goals_b=1),
    ])

    # Knockout predictions
    session.add_all([
        KnockoutPrediction(user_id=user.id, round="R32", slot_index=0, predicted_team="Brazil"),
        KnockoutPrediction(user_id=user.id, round="R32", slot_index=1, predicted_team="Spain"),
        KnockoutPrediction(user_id=user.id, round="R16", slot_index=0, predicted_team="Brazil"),
    ])
    session.add_all([
        KnockoutResult(round="R32", slot_index=0, actual_team="Brazil", match_played=True),  # +4
        KnockoutResult(round="R32", slot_index=1, actual_team="Portugal", match_played=True),  # 0
        KnockoutResult(round="R16", slot_index=0, actual_team="Argentina", match_played=True),  # 0
    ])

    # Special predictions + actuals
    session.add(SpecialPrediction(
        user_id=user.id,
        predicted_winner="Argentina",
        predicted_third="Brazil",
        predicted_top_scorer="Harry Kane",
        tiebreaker_goals=170,
    ))
    session.add_all([
        KnockoutResult(round="FINAL", slot_index=0, actual_team="Argentina", match_played=True),  # +150
        KnockoutResult(round="THIRD", slot_index=0, actual_team="Spain", match_played=True),  # 0
    ])
    session.add(TopGoalscorer(name="harry kane"))  # +100 (case-insensitive)
    await session.commit()

    breakdown = await compute_user_score(user.id, session)

    assert breakdown["group_points"] == 4  # 3 (exact) + 1 (correct result) + 0
    assert breakdown["knockout_points"] == 4  # R32 slot 0 only
    assert breakdown["special_points"] == 250  # winner 150 + top scorer 100
    assert breakdown["total"] == 258


@pytest.mark.asyncio
async def test_compute_user_score_no_predictions(session: AsyncSession) -> None:
    """A user with no predictions and no results scores zero across the board."""
    user = User(email="x@example.com", passcode_hash="x")
    session.add(user)
    await session.commit()
    await session.refresh(user)

    breakdown = await compute_user_score(user.id, session)
    assert breakdown == {
        "group_points": 0,
        "knockout_points": 0,
        "special_points": 0,
        "total": 0,
    }
