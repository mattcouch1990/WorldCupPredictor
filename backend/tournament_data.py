"""Static tournament data for the 2026 FIFA World Cup.

Includes groups, fixtures, flags, FIFA rankings, and lock-time helpers.
Dates and venues here are placeholders consistent with the published WC 2026
window (11 June – 19 July 2026); they exist for frontend display only.
The backend's only date-driven logic is the lock-status computation.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env")


# --------------------------------------------------------------------------- #
# Groups
# --------------------------------------------------------------------------- #

GROUPS: dict[str, list[str]] = {
    "A": ["Mexico", "South Africa", "South Korea", "Czechia"],
    "B": ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
    "C": ["Brazil", "Morocco", "Haiti", "Scotland"],
    "D": ["United States", "Paraguay", "Australia", "Turkey"],
    "E": ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
    "F": ["Netherlands", "Japan", "Sweden", "Tunisia"],
    "G": ["Belgium", "Egypt", "Iran", "New Zealand"],
    "H": ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
    "I": ["France", "Senegal", "Iraq", "Norway"],
    "J": ["Argentina", "Algeria", "Austria", "Jordan"],
    "K": ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
    "L": ["England", "Croatia", "Ghana", "Panama"],
}

GROUP_LETTERS: list[str] = list(GROUPS.keys())


# --------------------------------------------------------------------------- #
# Group fixtures
# --------------------------------------------------------------------------- #
# Standard 4-team round-robin in FIFA matchday order:
#   MD1: 1v2, 3v4
#   MD2: 1v3, 4v2
#   MD3: 4v1, 2v3   (final matchday — both games are simultaneous)
#
# 6 fixtures per group × 12 groups = 72 fixtures total. Dates and venues here
# are placeholders within the WC 2026 window; only kickoff order is meaningful.

_GROUP_DATE_WINDOWS: dict[str, list[str]] = {
    # (md1_a, md1_b, md2_a, md2_b, md3_a, md3_b) — ISO datetimes (UTC).
    "A": ["2026-06-11T20:00:00Z", "2026-06-11T23:00:00Z",
          "2026-06-17T18:00:00Z", "2026-06-17T21:00:00Z",
          "2026-06-24T20:00:00Z", "2026-06-24T20:00:00Z"],
    "B": ["2026-06-12T19:00:00Z", "2026-06-12T22:00:00Z",
          "2026-06-18T18:00:00Z", "2026-06-18T21:00:00Z",
          "2026-06-24T16:00:00Z", "2026-06-24T16:00:00Z"],
    "C": ["2026-06-13T17:00:00Z", "2026-06-13T20:00:00Z",
          "2026-06-19T18:00:00Z", "2026-06-19T21:00:00Z",
          "2026-06-25T20:00:00Z", "2026-06-25T20:00:00Z"],
    "D": ["2026-06-12T16:00:00Z", "2026-06-13T22:00:00Z",
          "2026-06-18T16:00:00Z", "2026-06-19T22:00:00Z",
          "2026-06-25T16:00:00Z", "2026-06-25T16:00:00Z"],
    "E": ["2026-06-14T17:00:00Z", "2026-06-14T20:00:00Z",
          "2026-06-20T18:00:00Z", "2026-06-20T21:00:00Z",
          "2026-06-26T20:00:00Z", "2026-06-26T20:00:00Z"],
    "F": ["2026-06-14T22:00:00Z", "2026-06-15T17:00:00Z",
          "2026-06-20T22:00:00Z", "2026-06-21T17:00:00Z",
          "2026-06-26T16:00:00Z", "2026-06-26T16:00:00Z"],
    "G": ["2026-06-15T20:00:00Z", "2026-06-15T23:00:00Z",
          "2026-06-21T19:00:00Z", "2026-06-21T22:00:00Z",
          "2026-06-27T16:00:00Z", "2026-06-27T16:00:00Z"],
    "H": ["2026-06-16T17:00:00Z", "2026-06-16T20:00:00Z",
          "2026-06-22T18:00:00Z", "2026-06-22T21:00:00Z",
          "2026-06-27T20:00:00Z", "2026-06-27T20:00:00Z"],
    "I": ["2026-06-16T22:00:00Z", "2026-06-17T15:00:00Z",
          "2026-06-22T22:00:00Z", "2026-06-23T17:00:00Z",
          "2026-06-28T16:00:00Z", "2026-06-28T16:00:00Z"],
    "J": ["2026-06-17T21:00:00Z", "2026-06-18T15:00:00Z",
          "2026-06-23T19:00:00Z", "2026-06-23T22:00:00Z",
          "2026-06-28T20:00:00Z", "2026-06-28T20:00:00Z"],
    "K": ["2026-06-18T19:00:00Z", "2026-06-19T15:00:00Z",
          "2026-06-24T18:00:00Z", "2026-06-24T22:00:00Z",
          "2026-06-29T16:00:00Z", "2026-06-29T16:00:00Z"],
    "L": ["2026-06-19T17:00:00Z", "2026-06-20T15:00:00Z",
          "2026-06-25T18:00:00Z", "2026-06-25T22:00:00Z",
          "2026-06-29T20:00:00Z", "2026-06-29T20:00:00Z"],
}


def _build_group_fixtures() -> dict[str, list[dict]]:
    fixtures: dict[str, list[dict]] = {}
    for letter, teams in GROUPS.items():
        t1, t2, t3, t4 = teams
        dates = _GROUP_DATE_WINDOWS[letter]
        ordered = [
            (t1, t2, dates[0]),  # MD1
            (t3, t4, dates[1]),
            (t1, t3, dates[2]),  # MD2
            (t4, t2, dates[3]),
            (t4, t1, dates[4]),  # MD3 (simultaneous)
            (t2, t3, dates[5]),
        ]
        fixtures[letter] = [
            {"team_a": a, "team_b": b, "kickoff_utc": ko, "matchday": (i // 2) + 1}
            for i, (a, b, ko) in enumerate(ordered)
        ]
    return fixtures


GROUP_FIXTURES: dict[str, list[dict]] = _build_group_fixtures()


# --------------------------------------------------------------------------- #
# Flag emoji
# --------------------------------------------------------------------------- #

FLAG_EMOJI: dict[str, str] = {
    "Mexico": "🇲🇽", "South Africa": "🇿🇦", "South Korea": "🇰🇷", "Czechia": "🇨🇿",
    "Canada": "🇨🇦", "Bosnia and Herzegovina": "🇧🇦", "Qatar": "🇶🇦", "Switzerland": "🇨🇭",
    "Brazil": "🇧🇷", "Morocco": "🇲🇦", "Haiti": "🇭🇹", "Scotland": "🏴\U000e0067\U000e0062\U000e0073\U000e0063\U000e0074\U000e007f",
    "United States": "🇺🇸", "Paraguay": "🇵🇾", "Australia": "🇦🇺", "Turkey": "🇹🇷",
    "Germany": "🇩🇪", "Curaçao": "🇨🇼", "Ivory Coast": "🇨🇮", "Ecuador": "🇪🇨",
    "Netherlands": "🇳🇱", "Japan": "🇯🇵", "Sweden": "🇸🇪", "Tunisia": "🇹🇳",
    "Belgium": "🇧🇪", "Egypt": "🇪🇬", "Iran": "🇮🇷", "New Zealand": "🇳🇿",
    "Spain": "🇪🇸", "Cape Verde": "🇨🇻", "Saudi Arabia": "🇸🇦", "Uruguay": "🇺🇾",
    "France": "🇫🇷", "Senegal": "🇸🇳", "Iraq": "🇮🇶", "Norway": "🇳🇴",
    "Argentina": "🇦🇷", "Algeria": "🇩🇿", "Austria": "🇦🇹", "Jordan": "🇯🇴",
    "Portugal": "🇵🇹", "DR Congo": "🇨🇩", "Uzbekistan": "🇺🇿", "Colombia": "🇨🇴",
    "England": "🏴\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f",
    "Croatia": "🇭🇷", "Ghana": "🇬🇭", "Panama": "🇵🇦",
}


# --------------------------------------------------------------------------- #
# FIFA rankings (static — used as the final group tiebreaker)
# --------------------------------------------------------------------------- #

FIFA_RANKINGS: dict[str, int] = {
    "Spain": 1, "Argentina": 2, "France": 3, "England": 4,
    "Brazil": 5, "Portugal": 6, "Netherlands": 7, "Belgium": 8,
    "Germany": 9, "Croatia": 10, "Morocco": 11, "Colombia": 13,
    "United States": 14, "South Korea": 22, "Ecuador": 23,
    "Austria": 24, "Australia": 26, "Canada": 27, "Norway": 29,
    "Panama": 30, "Senegal": 19, "Japan": 18, "Switzerland": 17,
    "Tunisia": 40, "Egypt": 34, "Algeria": 35, "Uruguay": 16,
    "Saudi Arabia": 60, "Cape Verde": 68, "Iran": 20,
    "Ghana": 72, "Ivory Coast": 42, "South Africa": 61,
    "Czechia": 37, "Sweden": 33, "Turkey": 38,
    "Bosnia and Herzegovina": 65, "Paraguay": 39, "Iraq": 63,
    "Jordan": 66, "Uzbekistan": 50, "DR Congo": 58,
    "Haiti": 84, "Scotland": 36, "New Zealand": 86,
    "Curaçao": 82, "Qatar": 51,
}


# --------------------------------------------------------------------------- #
# Lock configuration
# --------------------------------------------------------------------------- #

PREDICTION_LOCK_UTC: str = os.getenv("PREDICTION_LOCK_UTC", "2026-06-11T20:00:00Z")

KNOCKOUT_LOCK_DATES: dict[str, str] = {
    "R16": "2026-07-04T17:00:00Z",
    "QF": "2026-07-09T20:00:00Z",
    "SF": "2026-07-14T20:00:00Z",
    "FINAL": "2026-07-19T19:00:00Z",
}

LOCK_ROUNDS: tuple[str, ...] = ("groups", "R32", "R16", "QF", "SF", "FINAL")


def _parse_iso_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def get_lock_status(
    now: datetime | None = None,
    overrides: dict[str, bool] | None = None,
) -> dict[str, dict]:
    """Return lock status for every round.

    `overrides` maps round name -> forced lock state (True = locked, False = unlocked).
    Each round entry is `{"locked": bool, "locks_at": iso-string, "overridden": bool}`.
    Groups and R32 share `PREDICTION_LOCK_UTC`; later rounds use `KNOCKOUT_LOCK_DATES`.
    """
    now = now or datetime.now(tz=timezone.utc)
    overrides = overrides or {}

    schedule: dict[str, str] = {
        "groups": PREDICTION_LOCK_UTC,
        "R32": PREDICTION_LOCK_UTC,
        "R16": KNOCKOUT_LOCK_DATES["R16"],
        "QF": KNOCKOUT_LOCK_DATES["QF"],
        "SF": KNOCKOUT_LOCK_DATES["SF"],
        "FINAL": KNOCKOUT_LOCK_DATES["FINAL"],
    }

    result: dict[str, dict] = {}
    for round_name, iso in schedule.items():
        locks_at = _parse_iso_utc(iso)
        time_based_lock = now >= locks_at
        if round_name in overrides:
            locked = overrides[round_name]
            overridden = locked != time_based_lock
        else:
            locked = time_based_lock
            overridden = False
        result[round_name] = {
            "locked": locked,
            "locks_at": iso,
            "overridden": overridden,
        }
    return result


# --------------------------------------------------------------------------- #
# Bracket structure
# --------------------------------------------------------------------------- #
# R32 slot count is 32 (16 matches, paired as (0,1), (2,3), ... (30,31)).
# R16 is 16, QF is 8, SF is 4, FINAL is 2. We also track the 3rd-place play-off
# slot count as 2. slot_index is zero-based throughout.

ROUND_SLOT_COUNTS: dict[str, int] = {
    "R32": 32,
    "R16": 16,
    "QF": 8,
    "SF": 4,
    "FINAL": 2,
    "THIRD": 2,
}


def all_teams() -> list[str]:
    return [team for teams in GROUPS.values() for team in teams]
