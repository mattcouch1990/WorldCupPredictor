from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..crud import get_lock_overrides
from ..database import get_db
from ..schemas import LockState, LockStatusResponse
from ..tournament_data import get_lock_status

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
