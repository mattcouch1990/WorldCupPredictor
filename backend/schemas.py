from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #

class LoginRequest(_Strict):
    email: EmailStr
    passcode: str = Field(min_length=1, max_length=64)


class TokenResponse(_Strict):
    access_token: str
    token_type: str = "bearer"
    user_id: int | None = None
    is_admin: bool = False
    profile_complete: bool = False


class AdminLoginRequest(_Strict):
    password: str = Field(min_length=1)


class ProfileRequest(_Strict):
    real_name: str = Field(min_length=1, max_length=120)
    team_name: str = Field(min_length=1, max_length=30)


class UserOut(_ORM):
    id: int
    email: EmailStr
    real_name: str | None = None
    team_name: str | None = None
    created_at: datetime


class UserCreatedOut(_Strict):
    user: UserOut
    passcode: str


# --------------------------------------------------------------------------- #
# Predictions
# --------------------------------------------------------------------------- #

class GroupPredictionOut(_ORM):
    id: int
    group: str
    team_a: str
    team_b: str
    pred_goals_a: int | None
    pred_goals_b: int | None
    updated_at: datetime


class GroupPredictionPatch(_Strict):
    team_a: str = Field(min_length=1, max_length=60)
    team_b: str = Field(min_length=1, max_length=60)
    pred_goals_a: int | None = Field(default=None, ge=0, le=99)
    pred_goals_b: int | None = Field(default=None, ge=0, le=99)


class GroupFixtureOut(_Strict):
    team_a: str
    team_b: str
    kickoff_utc: str
    matchday: int


class GroupPredictionsResponse(_Strict):
    group: str
    fixtures: list[GroupFixtureOut]
    predictions: list[GroupPredictionOut]


class KnockoutPredictionOut(_ORM):
    round: str
    slot_index: int
    predicted_team: str | None


class KnockoutPredictionPatch(_Strict):
    round: str = Field(min_length=1, max_length=10)
    slot_index: int = Field(ge=0)
    predicted_team: str | None = Field(default=None, max_length=60)


class KnockoutPredictionsResponse(_Strict):
    predictions: list[KnockoutPredictionOut]


class SpecialPredictionOut(_ORM):
    predicted_winner: str | None
    predicted_third: str | None
    predicted_top_scorer: str | None
    tiebreaker_goals: int | None


class SpecialPredictionPatch(_Strict):
    predicted_winner: str | None = Field(default=None, max_length=60)
    predicted_third: str | None = Field(default=None, max_length=60)
    predicted_top_scorer: str | None = Field(default=None, max_length=120)
    tiebreaker_goals: int | None = Field(default=None, ge=0, le=500)


# --------------------------------------------------------------------------- #
# Tournament
# --------------------------------------------------------------------------- #

class LockState(_Strict):
    round: str
    locked: bool
    locks_at: str
    overridden: bool


class LockStatusResponse(_Strict):
    rounds: list[LockState]


# --------------------------------------------------------------------------- #
# Leaderboard
# --------------------------------------------------------------------------- #

class LeaderboardEntry(_Strict):
    user_id: int
    real_name: str | None
    team_name: str | None
    group_points: int
    knockout_points: int
    special_points: int
    total: int
    tiebreaker_goals: int | None


class LeaderboardResponse(_Strict):
    entries: list[LeaderboardEntry]


# --------------------------------------------------------------------------- #
# Admin
# --------------------------------------------------------------------------- #

class GroupResultIn(_Strict):
    group: str = Field(min_length=1, max_length=1)
    team_a: str
    team_b: str
    goals_a: int = Field(ge=0, le=99)
    goals_b: int = Field(ge=0, le=99)


class GroupResultOut(_ORM):
    id: int
    group: str
    team_a: str
    team_b: str
    actual_goals_a: int
    actual_goals_b: int
    played_at: datetime


class KnockoutResultIn(_Strict):
    round: str = Field(min_length=1, max_length=10)
    slot_index: int = Field(ge=0)
    winning_team: str = Field(min_length=1, max_length=60)


class KnockoutResultOut(_ORM):
    id: int
    round: str
    slot_index: int
    actual_team: str
    match_played: bool


class AdminUserCreateRequest(_Strict):
    email: EmailStr


class AdminLockRequest(_Strict):
    round: str = Field(min_length=1, max_length=10)


class TopGoalscorerIn(_Strict):
    name: str = Field(min_length=1, max_length=120)


class TopGoalscorerOut(_Strict):
    name: str | None = None


class MessageResponse(_Strict):
    detail: str
