from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..crud import get_special_prediction, list_users, upsert_user_score
from ..database import get_db
from ..schemas import LeaderboardEntry, LeaderboardResponse
from ..scoring import compute_user_score

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(db: AsyncSession = Depends(get_db)) -> LeaderboardResponse:
    users = await list_users(db)
    entries: list[LeaderboardEntry] = []
    for user in users:
        breakdown = await compute_user_score(user.id, db)
        await upsert_user_score(
            db,
            user_id=user.id,
            group_points=breakdown["group_points"],
            knockout_points=breakdown["knockout_points"],
            special_points=breakdown["special_points"],
        )
        special = await get_special_prediction(db, user.id)
        entries.append(
            LeaderboardEntry(
                user_id=user.id,
                real_name=user.real_name,
                team_name=user.team_name,
                group_points=breakdown["group_points"],
                knockout_points=breakdown["knockout_points"],
                special_points=breakdown["special_points"],
                total=breakdown["total"],
                tiebreaker_goals=special.tiebreaker_goals if special else None,
            )
        )
    entries.sort(key=lambda e: (-e.total, e.user_id))
    return LeaderboardResponse(entries=entries)
