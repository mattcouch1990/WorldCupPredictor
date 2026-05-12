"""Database read/write helpers used by the routers."""

from __future__ import annotations

import secrets
import string

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import hash_passcode
from .models import (
    AdminLockOverride,
    GroupPrediction,
    GroupResult,
    KnockoutPrediction,
    KnockoutResult,
    SpecialPrediction,
    TopGoalscorer,
    User,
    UserScore,
)

PASSCODE_ALPHABET = string.ascii_uppercase + string.digits
PASSCODE_LENGTH = 6


def generate_passcode() -> str:
    return "".join(secrets.choice(PASSCODE_ALPHABET) for _ in range(PASSCODE_LENGTH))


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #

async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return (
        await db.execute(select(User).where(User.email == email.lower()))
    ).scalar_one_or_none()


async def get_user(db: AsyncSession, user_id: int) -> User | None:
    return (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def list_users(db: AsyncSession) -> list[User]:
    return list((await db.execute(select(User).order_by(User.id))).scalars().all())


async def create_user(db: AsyncSession, email: str) -> tuple[User, str]:
    passcode = generate_passcode()
    user = User(email=email.lower(), passcode_hash=hash_passcode(passcode))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user, passcode


async def delete_user(db: AsyncSession, user_id: int) -> bool:
    user = await get_user(db, user_id)
    if user is None:
        return False
    await db.delete(user)
    await db.commit()
    return True


async def set_profile(db: AsyncSession, user: User, real_name: str, team_name: str) -> User:
    user.real_name = real_name
    user.team_name = team_name
    await db.commit()
    await db.refresh(user)
    return user


# --------------------------------------------------------------------------- #
# Group predictions
# --------------------------------------------------------------------------- #

async def list_group_predictions(
    db: AsyncSession, user_id: int, group: str | None = None
) -> list[GroupPrediction]:
    stmt = select(GroupPrediction).where(GroupPrediction.user_id == user_id)
    if group is not None:
        stmt = stmt.where(GroupPrediction.group == group)
    stmt = stmt.order_by(GroupPrediction.id)
    return list((await db.execute(stmt)).scalars().all())


async def upsert_group_prediction(
    db: AsyncSession,
    user_id: int,
    group: str,
    team_a: str,
    team_b: str,
    pred_goals_a: int | None,
    pred_goals_b: int | None,
) -> GroupPrediction:
    existing = (
        await db.execute(
            select(GroupPrediction).where(
                GroupPrediction.user_id == user_id,
                GroupPrediction.group == group,
                GroupPrediction.team_a == team_a,
                GroupPrediction.team_b == team_b,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = GroupPrediction(
            user_id=user_id,
            group=group,
            team_a=team_a,
            team_b=team_b,
            pred_goals_a=pred_goals_a,
            pred_goals_b=pred_goals_b,
        )
        db.add(existing)
    else:
        existing.pred_goals_a = pred_goals_a
        existing.pred_goals_b = pred_goals_b
    await db.commit()
    await db.refresh(existing)
    return existing


# --------------------------------------------------------------------------- #
# Group results
# --------------------------------------------------------------------------- #

async def list_group_results(db: AsyncSession, group: str | None = None) -> list[GroupResult]:
    stmt = select(GroupResult)
    if group is not None:
        stmt = stmt.where(GroupResult.group == group)
    return list((await db.execute(stmt.order_by(GroupResult.id))).scalars().all())


async def upsert_group_result(
    db: AsyncSession,
    group: str,
    team_a: str,
    team_b: str,
    goals_a: int,
    goals_b: int,
) -> GroupResult:
    existing = (
        await db.execute(
            select(GroupResult).where(
                GroupResult.group == group,
                GroupResult.team_a == team_a,
                GroupResult.team_b == team_b,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = GroupResult(
            group=group,
            team_a=team_a,
            team_b=team_b,
            actual_goals_a=goals_a,
            actual_goals_b=goals_b,
        )
        db.add(existing)
    else:
        existing.actual_goals_a = goals_a
        existing.actual_goals_b = goals_b
    await db.commit()
    await db.refresh(existing)
    return existing


# --------------------------------------------------------------------------- #
# Knockout predictions / results
# --------------------------------------------------------------------------- #

async def list_knockout_predictions(
    db: AsyncSession, user_id: int
) -> list[KnockoutPrediction]:
    stmt = (
        select(KnockoutPrediction)
        .where(KnockoutPrediction.user_id == user_id)
        .order_by(KnockoutPrediction.round, KnockoutPrediction.slot_index)
    )
    return list((await db.execute(stmt)).scalars().all())


async def upsert_knockout_prediction(
    db: AsyncSession,
    user_id: int,
    round_name: str,
    slot_index: int,
    predicted_team: str | None,
) -> KnockoutPrediction:
    existing = (
        await db.execute(
            select(KnockoutPrediction).where(
                KnockoutPrediction.user_id == user_id,
                KnockoutPrediction.round == round_name,
                KnockoutPrediction.slot_index == slot_index,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = KnockoutPrediction(
            user_id=user_id,
            round=round_name,
            slot_index=slot_index,
            predicted_team=predicted_team,
        )
        db.add(existing)
    else:
        existing.predicted_team = predicted_team
    await db.commit()
    await db.refresh(existing)
    return existing


async def list_knockout_results(db: AsyncSession) -> list[KnockoutResult]:
    stmt = select(KnockoutResult).order_by(KnockoutResult.round, KnockoutResult.slot_index)
    return list((await db.execute(stmt)).scalars().all())


async def upsert_knockout_result(
    db: AsyncSession, round_name: str, slot_index: int, winning_team: str
) -> KnockoutResult:
    existing = (
        await db.execute(
            select(KnockoutResult).where(
                KnockoutResult.round == round_name,
                KnockoutResult.slot_index == slot_index,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = KnockoutResult(
            round=round_name,
            slot_index=slot_index,
            actual_team=winning_team,
            match_played=True,
        )
        db.add(existing)
    else:
        existing.actual_team = winning_team
        existing.match_played = True
    await db.commit()
    await db.refresh(existing)
    return existing


# --------------------------------------------------------------------------- #
# Special predictions
# --------------------------------------------------------------------------- #

async def get_special_prediction(
    db: AsyncSession, user_id: int
) -> SpecialPrediction | None:
    return (
        await db.execute(
            select(SpecialPrediction).where(SpecialPrediction.user_id == user_id)
        )
    ).scalar_one_or_none()


async def upsert_special_prediction(
    db: AsyncSession,
    user_id: int,
    predicted_winner: str | None,
    predicted_third: str | None,
    predicted_top_scorer: str | None,
    tiebreaker_goals: int | None,
) -> SpecialPrediction:
    existing = await get_special_prediction(db, user_id)
    if existing is None:
        existing = SpecialPrediction(
            user_id=user_id,
            predicted_winner=predicted_winner,
            predicted_third=predicted_third,
            predicted_top_scorer=predicted_top_scorer,
            tiebreaker_goals=tiebreaker_goals,
        )
        db.add(existing)
    else:
        if predicted_winner is not None:
            existing.predicted_winner = predicted_winner
        if predicted_third is not None:
            existing.predicted_third = predicted_third
        if predicted_top_scorer is not None:
            existing.predicted_top_scorer = predicted_top_scorer
        if tiebreaker_goals is not None:
            existing.tiebreaker_goals = tiebreaker_goals
    await db.commit()
    await db.refresh(existing)
    return existing


# --------------------------------------------------------------------------- #
# Lock overrides
# --------------------------------------------------------------------------- #

async def get_lock_overrides(db: AsyncSession) -> dict[str, bool]:
    rows = (await db.execute(select(AdminLockOverride))).scalars().all()
    return {row.round: row.locked for row in rows}


async def set_lock_override(db: AsyncSession, round_name: str, locked: bool) -> None:
    existing = (
        await db.execute(
            select(AdminLockOverride).where(AdminLockOverride.round == round_name)
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(AdminLockOverride(round=round_name, locked=locked))
    else:
        existing.locked = locked
    await db.commit()


async def clear_lock_override(db: AsyncSession, round_name: str) -> None:
    await db.execute(
        delete(AdminLockOverride).where(AdminLockOverride.round == round_name)
    )
    await db.commit()


# --------------------------------------------------------------------------- #
# User scores / top goalscorer
# --------------------------------------------------------------------------- #

async def upsert_user_score(
    db: AsyncSession,
    user_id: int,
    group_points: int,
    knockout_points: int,
    special_points: int,
) -> UserScore:
    existing = (
        await db.execute(select(UserScore).where(UserScore.user_id == user_id))
    ).scalar_one_or_none()
    total = group_points + knockout_points + special_points
    if existing is None:
        existing = UserScore(
            user_id=user_id,
            group_points=group_points,
            knockout_points=knockout_points,
            special_points=special_points,
            total=total,
        )
        db.add(existing)
    else:
        existing.group_points = group_points
        existing.knockout_points = knockout_points
        existing.special_points = special_points
        existing.total = total
    await db.commit()
    await db.refresh(existing)
    return existing


async def get_top_goalscorer(db: AsyncSession) -> TopGoalscorer | None:
    return (
        await db.execute(select(TopGoalscorer).order_by(TopGoalscorer.id.desc()))
    ).scalars().first()


async def set_top_goalscorer(db: AsyncSession, name: str) -> TopGoalscorer:
    existing = await get_top_goalscorer(db)
    if existing is None:
        existing = TopGoalscorer(name=name)
        db.add(existing)
    else:
        existing.name = name
    await db.commit()
    await db.refresh(existing)
    return existing
