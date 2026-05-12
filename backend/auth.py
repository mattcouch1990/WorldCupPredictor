from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

SECRET_KEY: str = os.getenv("SECRET_KEY", "changeme_long_random_string")
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "changeme_admin_password")
JWT_ALGORITHM: str = "HS256"
USER_TOKEN_EXPIRES = timedelta(days=7)
ADMIN_TOKEN_EXPIRES = timedelta(hours=12)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# --------------------------------------------------------------------------- #
# Passcode hashing
# --------------------------------------------------------------------------- #

def hash_passcode(passcode: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(passcode.encode("utf-8"), salt).decode("utf-8")


def verify_passcode(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# --------------------------------------------------------------------------- #
# JWT
# --------------------------------------------------------------------------- #

def create_token(
    user_id: int | None,
    is_admin: bool = False,
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(tz=timezone.utc)
    exp_delta = expires_delta or (ADMIN_TOKEN_EXPIRES if is_admin else USER_TOKEN_EXPIRES)
    payload: dict = {
        "sub": str(user_id) if user_id is not None else "admin",
        "is_admin": is_admin,
        "exp": now + exp_delta,
        "iat": now,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# --------------------------------------------------------------------------- #
# Admin password check
# --------------------------------------------------------------------------- #

def verify_admin_password(supplied: str) -> bool:
    return bool(ADMIN_PASSWORD) and supplied == ADMIN_PASSWORD


# --------------------------------------------------------------------------- #
# Dependencies
# --------------------------------------------------------------------------- #

async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _decode_token(token)
    sub = payload.get("sub")
    is_admin = payload.get("is_admin", False)
    if is_admin or not sub or sub == "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User token required",
        )
    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject"
        ) from exc
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists"
        )
    return user


async def get_current_admin(token: str | None = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _decode_token(token)
    if not payload.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return payload
