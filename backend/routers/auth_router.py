from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_token, get_current_user, verify_passcode
from ..crud import get_user_by_email, set_profile
from ..database import get_db
from ..models import User
from ..schemas import (
    LoginRequest,
    ProfileRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await get_user_by_email(db, payload.email)
    if user is None or not verify_passcode(payload.passcode, user.passcode_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or passcode",
        )
    token = create_token(user.id, is_admin=False)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        is_admin=False,
        profile_complete=bool(user.real_name and user.team_name),
    )


@router.post("/profile", response_model=UserOut)
async def update_profile(
    payload: ProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    updated = await set_profile(db, user, payload.real_name.strip(), payload.team_name.strip())
    return UserOut.model_validate(updated)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
