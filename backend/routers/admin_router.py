from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import (
    create_token,
    get_current_admin,
    verify_admin_password,
)
from ..crud import (
    clear_lock_override,
    create_user,
    delete_user,
    get_lock_overrides,
    get_top_goalscorer,
    get_tournament_total_goals,
    list_group_results,
    list_knockout_results,
    list_users,
    set_lock_override,
    set_top_goalscorer,
    set_tournament_total_goals,
    upsert_group_result,
    upsert_knockout_result,
    upsert_user_score,
)
from ..database import get_db
from ..schemas import (
    AdminLoginRequest,
    AdminUserCreateRequest,
    GroupResultIn,
    GroupResultOut,
    KnockoutResultIn,
    KnockoutResultOut,
    LeaderboardResponse,
    LockState,
    LockStatusResponse,
    MessageResponse,
    TokenResponse,
    TopGoalscorerIn,
    TopGoalscorerOut,
    TournamentGoalsIn,
    TournamentGoalsOut,
    UserCreatedOut,
    UserOut,
)
from ..scoring import compute_user_score
from ..tournament_data import (
    GROUP_FIXTURES,
    LOCK_ROUNDS,
    ROUND_SLOT_COUNTS,
    all_teams,
    get_lock_status,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #

@router.post("/login", response_model=TokenResponse)
async def admin_login(payload: AdminLoginRequest) -> TokenResponse:
    if not verify_admin_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid admin password")
    token = create_token(user_id=None, is_admin=True)
    return TokenResponse(
        access_token=token,
        user_id=None,
        is_admin=True,
        profile_complete=True,
    )


# --------------------------------------------------------------------------- #
# Results
# --------------------------------------------------------------------------- #

@router.get("/results/group", response_model=list[GroupResultOut])
async def admin_list_group_results(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> list[GroupResultOut]:
    rows = await list_group_results(db)
    return [GroupResultOut.model_validate(r) for r in rows]


@router.post("/results/group", response_model=GroupResultOut)
async def admin_upsert_group_result(
    payload: GroupResultIn,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> GroupResultOut:
    group = payload.group.upper()
    fixtures = GROUP_FIXTURES.get(group)
    if fixtures is None:
        raise HTTPException(status_code=400, detail=f"Unknown group: {group}")
    if not any({fx["team_a"], fx["team_b"]} == {payload.team_a, payload.team_b} for fx in fixtures):
        raise HTTPException(status_code=400, detail="Fixture does not belong to group")
    row = await upsert_group_result(
        db,
        group=group,
        team_a=payload.team_a,
        team_b=payload.team_b,
        goals_a=payload.goals_a,
        goals_b=payload.goals_b,
    )
    return GroupResultOut.model_validate(row)


@router.get("/results/knockout", response_model=list[KnockoutResultOut])
async def admin_list_knockout_results(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> list[KnockoutResultOut]:
    rows = await list_knockout_results(db)
    return [KnockoutResultOut.model_validate(r) for r in rows]


@router.post("/results/knockout", response_model=KnockoutResultOut)
async def admin_upsert_knockout_result(
    payload: KnockoutResultIn,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> KnockoutResultOut:
    round_name = payload.round.upper()
    if round_name not in ROUND_SLOT_COUNTS:
        raise HTTPException(status_code=400, detail=f"Unknown round: {payload.round}")
    if payload.slot_index >= ROUND_SLOT_COUNTS[round_name]:
        raise HTTPException(status_code=400, detail="slot_index out of range")
    if payload.winning_team not in all_teams():
        raise HTTPException(status_code=400, detail="Unknown team")
    row = await upsert_knockout_result(
        db, round_name=round_name, slot_index=payload.slot_index, winning_team=payload.winning_team
    )
    return KnockoutResultOut.model_validate(row)


# --------------------------------------------------------------------------- #
# Lock control
# --------------------------------------------------------------------------- #

@router.get("/lock-status", response_model=LockStatusResponse)
async def admin_lock_status(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> LockStatusResponse:
    overrides = await get_lock_overrides(db)
    status_map = get_lock_status(overrides=overrides)
    return LockStatusResponse(
        rounds=[LockState(round=name, **state) for name, state in status_map.items()]
    )


@router.post("/lock/{round_name}", response_model=MessageResponse)
async def admin_lock(
    round_name: str,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> MessageResponse:
    round_name = _normalise_round(round_name)
    await set_lock_override(db, round_name, locked=True)
    return MessageResponse(detail=f"{round_name} locked")


@router.post("/unlock/{round_name}", response_model=MessageResponse)
async def admin_unlock(
    round_name: str,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> MessageResponse:
    round_name = _normalise_round(round_name)
    await set_lock_override(db, round_name, locked=False)
    return MessageResponse(detail=f"{round_name} unlocked")


@router.delete("/lock/{round_name}", response_model=MessageResponse)
async def admin_clear_lock_override(
    round_name: str,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> MessageResponse:
    round_name = _normalise_round(round_name)
    await clear_lock_override(db, round_name)
    return MessageResponse(detail=f"{round_name} override cleared")


def _normalise_round(round_name: str) -> str:
    candidate = round_name if round_name == "groups" else round_name.upper()
    if candidate not in LOCK_ROUNDS:
        raise HTTPException(status_code=400, detail=f"Unknown lock round: {round_name}")
    return candidate


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #

@router.get("/users", response_model=list[UserOut])
async def admin_list_users(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> list[UserOut]:
    users = await list_users(db)
    return [UserOut.model_validate(u) for u in users]


@router.post("/users", response_model=UserCreatedOut)
async def admin_create_user(
    payload: AdminUserCreateRequest,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> UserCreatedOut:
    user, passcode = await create_user(db, payload.email)
    return UserCreatedOut(user=UserOut.model_validate(user), passcode=passcode)


@router.delete("/users/{user_id}", response_model=MessageResponse)
async def admin_delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> MessageResponse:
    if not await delete_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return MessageResponse(detail=f"User {user_id} removed")


# --------------------------------------------------------------------------- #
# Score management
# --------------------------------------------------------------------------- #

@router.post("/recompute-scores", response_model=LeaderboardResponse)
async def admin_recompute_scores(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> LeaderboardResponse:
    from ..routers.leaderboard_router import leaderboard

    return await leaderboard(db=db)


@router.post("/recompute-scores/raw", response_model=MessageResponse)
async def admin_recompute_scores_raw(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> MessageResponse:
    users = await list_users(db)
    for user in users:
        breakdown = await compute_user_score(user.id, db)
        await upsert_user_score(
            db,
            user_id=user.id,
            group_points=breakdown["group_points"],
            knockout_points=breakdown["knockout_points"],
            special_points=breakdown["special_points"],
        )
    return MessageResponse(detail=f"Recomputed scores for {len(users)} users")


# --------------------------------------------------------------------------- #
# Top goalscorer
# --------------------------------------------------------------------------- #

@router.get("/top-goalscorer", response_model=TopGoalscorerOut)
async def admin_get_top_goalscorer(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> TopGoalscorerOut:
    row = await get_top_goalscorer(db)
    return TopGoalscorerOut(name=row.name if row else None)


@router.post("/top-goalscorer", response_model=TopGoalscorerOut)
async def admin_set_top_goalscorer(
    payload: TopGoalscorerIn,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> TopGoalscorerOut:
    row = await set_top_goalscorer(db, payload.name.strip())
    return TopGoalscorerOut(name=row.name)


# --------------------------------------------------------------------------- #
# Tournament total goals (tiebreaker reference value)
# --------------------------------------------------------------------------- #

@router.get("/tournament-goals", response_model=TournamentGoalsOut)
async def admin_get_tournament_goals(
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> TournamentGoalsOut:
    row = await get_tournament_total_goals(db)
    return TournamentGoalsOut(total=row.total if row else None)


@router.post("/tournament-goals", response_model=TournamentGoalsOut)
async def admin_set_tournament_goals(
    payload: TournamentGoalsIn,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
) -> TournamentGoalsOut:
    row = await set_tournament_total_goals(db, payload.total)
    return TournamentGoalsOut(total=row.total)
