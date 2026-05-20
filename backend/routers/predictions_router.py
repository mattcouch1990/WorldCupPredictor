from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..crud import (
    get_lock_overrides,
    get_special_prediction,
    list_group_predictions,
    list_knockout_predictions,
    upsert_group_prediction,
    upsert_knockout_prediction,
    upsert_special_prediction,
)
from ..database import get_db
from ..models import User
from ..schemas import (
    AllGroupPredictionsResponse,
    GroupFixtureOut,
    GroupPredictionOut,
    GroupPredictionPatch,
    GroupPredictionsResponse,
    KnockoutPredictionOut,
    KnockoutPredictionPatch,
    KnockoutPredictionsResponse,
    SpecialPredictionOut,
    SpecialPredictionPatch,
)
from ..tournament_data import (
    GROUP_FIXTURES,
    GROUPS,
    ROUND_SLOT_COUNTS,
    all_teams,
    get_lock_status,
)

router = APIRouter(prefix="/predictions", tags=["predictions"])


def _validate_fixture(group: str, team_a: str, team_b: str) -> None:
    fixtures = GROUP_FIXTURES.get(group)
    if fixtures is None:
        raise HTTPException(status_code=404, detail=f"Unknown group: {group}")
    if not any({fx["team_a"], fx["team_b"]} == {team_a, team_b} for fx in fixtures):
        raise HTTPException(status_code=400, detail="Fixture does not belong to group")


async def _check_lock(db: AsyncSession, round_name: str) -> None:
    overrides = await get_lock_overrides(db)
    status_map = get_lock_status(overrides=overrides)
    if status_map.get(round_name, {}).get("locked"):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Predictions for {round_name} are locked",
        )


@router.get("/group/all", response_model=AllGroupPredictionsResponse)
async def get_all_group_predictions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AllGroupPredictionsResponse:
    rows = await list_group_predictions(db, user.id)
    by_group: dict[str, list[GroupPredictionOut]] = {letter: [] for letter in GROUPS}
    for r in rows:
        if r.group in by_group:
            by_group[r.group].append(GroupPredictionOut.model_validate(r))
    groups = {
        letter: GroupPredictionsResponse(
            group=letter,
            fixtures=[GroupFixtureOut(**fx) for fx in GROUP_FIXTURES[letter]],
            predictions=by_group[letter],
        )
        for letter in GROUPS
    }
    return AllGroupPredictionsResponse(groups=groups)


@router.get("/group/{group_letter}", response_model=GroupPredictionsResponse)
async def get_group_predictions(
    group_letter: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupPredictionsResponse:
    group_letter = group_letter.upper()
    if group_letter not in GROUPS:
        raise HTTPException(status_code=404, detail=f"Unknown group: {group_letter}")
    fixtures = [GroupFixtureOut(**fx) for fx in GROUP_FIXTURES[group_letter]]
    rows = await list_group_predictions(db, user.id, group=group_letter)
    return GroupPredictionsResponse(
        group=group_letter,
        fixtures=fixtures,
        predictions=[GroupPredictionOut.model_validate(r) for r in rows],
    )


@router.patch("/group/{group_letter}", response_model=GroupPredictionOut)
async def patch_group_prediction(
    group_letter: str,
    payload: GroupPredictionPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupPredictionOut:
    group_letter = group_letter.upper()
    _validate_fixture(group_letter, payload.team_a, payload.team_b)
    await _check_lock(db, "groups")
    row = await upsert_group_prediction(
        db,
        user_id=user.id,
        group=group_letter,
        team_a=payload.team_a,
        team_b=payload.team_b,
        pred_goals_a=payload.pred_goals_a,
        pred_goals_b=payload.pred_goals_b,
    )
    return GroupPredictionOut.model_validate(row)


@router.get("/knockout", response_model=KnockoutPredictionsResponse)
async def get_knockout_predictions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnockoutPredictionsResponse:
    rows = await list_knockout_predictions(db, user.id)
    return KnockoutPredictionsResponse(
        predictions=[KnockoutPredictionOut.model_validate(r) for r in rows]
    )


@router.patch("/knockout", response_model=KnockoutPredictionOut)
async def patch_knockout_prediction(
    payload: KnockoutPredictionPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnockoutPredictionOut:
    round_name = payload.round.upper()
    if round_name not in ROUND_SLOT_COUNTS:
        raise HTTPException(status_code=400, detail=f"Unknown round: {payload.round}")
    if payload.slot_index >= ROUND_SLOT_COUNTS[round_name]:
        raise HTTPException(status_code=400, detail="slot_index out of range")
    if payload.predicted_team is not None and payload.predicted_team not in all_teams():
        raise HTTPException(status_code=400, detail="Unknown team")

    lock_round = "R32" if round_name in ("R32", "THIRD") else round_name
    if lock_round == "THIRD":
        lock_round = "SF"
    await _check_lock(db, lock_round)

    row = await upsert_knockout_prediction(
        db,
        user_id=user.id,
        round_name=round_name,
        slot_index=payload.slot_index,
        predicted_team=payload.predicted_team,
    )
    return KnockoutPredictionOut.model_validate(row)


@router.get("/special", response_model=SpecialPredictionOut)
async def get_special(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpecialPredictionOut:
    row = await get_special_prediction(db, user.id)
    if row is None:
        return SpecialPredictionOut(
            predicted_winner=None,
            predicted_third=None,
            predicted_top_scorer=None,
            tiebreaker_goals=None,
        )
    return SpecialPredictionOut.model_validate(row)


@router.patch("/special", response_model=SpecialPredictionOut)
async def patch_special(
    payload: SpecialPredictionPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpecialPredictionOut:
    teams = set(all_teams())
    if payload.predicted_winner is not None and payload.predicted_winner not in teams:
        raise HTTPException(status_code=400, detail="Unknown winner team")
    if payload.predicted_third is not None and payload.predicted_third not in teams:
        raise HTTPException(status_code=400, detail="Unknown third place team")

    await _check_lock(db, "groups")

    row = await upsert_special_prediction(
        db,
        user_id=user.id,
        predicted_winner=payload.predicted_winner,
        predicted_third=payload.predicted_third,
        predicted_top_scorer=payload.predicted_top_scorer,
        tiebreaker_goals=payload.tiebreaker_goals,
    )
    return SpecialPredictionOut.model_validate(row)
