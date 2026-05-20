from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    passcode_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    team_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    real_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    group_predictions: Mapped[list["GroupPrediction"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    knockout_predictions: Mapped[list["KnockoutPrediction"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    special_prediction: Mapped["SpecialPrediction | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    score: Mapped["UserScore | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )


class GroupPrediction(Base):
    __tablename__ = "group_predictions"
    __table_args__ = (
        UniqueConstraint("user_id", "group", "team_a", "team_b", name="uq_user_group_fixture"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group: Mapped[str] = mapped_column(String(1), nullable=False, index=True)
    team_a: Mapped[str] = mapped_column(String(60), nullable=False)
    team_b: Mapped[str] = mapped_column(String(60), nullable=False)
    pred_goals_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pred_goals_b: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped[User] = relationship(back_populates="group_predictions")


class GroupResult(Base):
    __tablename__ = "group_results"
    __table_args__ = (
        UniqueConstraint("group", "team_a", "team_b", name="uq_group_result_fixture"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group: Mapped[str] = mapped_column(String(1), nullable=False, index=True)
    team_a: Mapped[str] = mapped_column(String(60), nullable=False)
    team_b: Mapped[str] = mapped_column(String(60), nullable=False)
    actual_goals_a: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_goals_b: Mapped[int] = mapped_column(Integer, nullable=False)
    played_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class KnockoutPrediction(Base):
    __tablename__ = "knockout_predictions"
    __table_args__ = (
        UniqueConstraint("user_id", "round", "slot_index", name="uq_user_knockout_slot"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_team: Mapped[str | None] = mapped_column(String(60), nullable=True)

    user: Mapped[User] = relationship(back_populates="knockout_predictions")


class KnockoutResult(Base):
    __tablename__ = "knockout_results"
    __table_args__ = (
        UniqueConstraint("round", "slot_index", name="uq_knockout_result_slot"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    round: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_team: Mapped[str] = mapped_column(String(60), nullable=False)
    match_played: Mapped[bool] = mapped_column(default=False, nullable=False)


class SpecialPrediction(Base):
    __tablename__ = "special_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    predicted_winner: Mapped[str | None] = mapped_column(String(60), nullable=True)
    predicted_third: Mapped[str | None] = mapped_column(String(60), nullable=True)
    predicted_top_scorer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tiebreaker_goals: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user: Mapped[User] = relationship(back_populates="special_prediction")


class UserScore(Base):
    __tablename__ = "user_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    group_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    knockout_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    special_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_computed: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="score")


class AdminLockOverride(Base):
    """Persists admin-driven lock overrides. round is one of 'groups','R16','QF','SF','FINAL'."""

    __tablename__ = "admin_lock_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    round: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    locked: Mapped[bool] = mapped_column(nullable=False)


class TopGoalscorer(Base):
    """Single-row config: the confirmed top goalscorer for the tournament."""

    __tablename__ = "top_goalscorer"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)


class TournamentTotalGoals(Base):
    """Single-row config: the confirmed total goals across the whole tournament."""

    __tablename__ = "tournament_total_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    total: Mapped[int] = mapped_column(Integer, nullable=False)
