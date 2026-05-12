from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..crud import get_lock_overrides, list_group_results
from ..database import get_db
from ..models import User
from ..schemas import GroupResultOut, LockState, LockStatusResponse
from ..tournament_data import GROUPS, get_lock_status

router = APIRouter(prefix="/tournament", tags=["tournament"])


@router.get("/lock-status", response_model=LockStatusResponse)
async def lock_status(db: AsyncSession = Depends(get_db)) -> LockStatusResponse:
    overrides = await get_lock_overrides(db)
    status_map = get_lock_status(overrides=overrides)
    return LockStatusResponse(
        rounds=[
            LockState(round=name, **state) for name, state in status_map.items()
        ]
    )


@router.get("/results/group/{group_letter}", response_model=list[GroupResultOut])
async def group_results(
    group_letter: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[GroupResultOut]:
    group_letter = group_letter.upper()
    if group_letter not in GROUPS:
        raise HTTPException(status_code=404, detail=f"Unknown group: {group_letter}")
    rows = await list_group_results(db, group=group_letter)
    return [GroupResultOut.model_validate(r) for r in rows]
