"""Static tournament data for the 2026 FIFA World Cup.

Includes groups, fixtures, flags, FIFA rankings, lock-time helpers,
and the official R32 bracket structure.
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
    "R16":   "2026-07-04T17:00:00Z",   # first R16 match (July 4, Houston)
    "QF":    "2026-07-09T20:00:00Z",   # first QF match
    "SF":    "2026-07-14T20:00:00Z",   # first SF match
    "FINAL": "2026-07-19T19:00:00Z",   # Final kick-off, MetLife Stadium
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
        "R32":    PREDICTION_LOCK_UTC,
        "R16":    KNOCKOUT_LOCK_DATES["R16"],
        "QF":     KNOCKOUT_LOCK_DATES["QF"],
        "SF":     KNOCKOUT_LOCK_DATES["SF"],
        "FINAL":  KNOCKOUT_LOCK_DATES["FINAL"],
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
# R32 bracket structure  (official FIFA schedule, confirmed Dec 2025)
# --------------------------------------------------------------------------- #
#
# Mathematical structure across 16 R32 matches:
#   4 × Winner vs Runner-up      (matches 75, 76, 84, 86)
#   8 × Winner vs 3rd-place      (matches 74, 77, 79, 80, 81, 82, 85, 87)
#   4 × Runner-up vs Runner-up   (matches 73, 78, 83, 88)
#
# `slot` here is the MATCH index (0-based, 0..15). Each match occupies two
# backend slot_index values: slot*2 (team 1) and slot*2+1 (team 2).
#
# Key: "winner_X"    = 1st-place finisher from group X
#      "runner_up_X" = 2nd-place finisher from group X
#
# R32_FIXED: matches where both teams are fully determined by group position
# (winner or runner-up). No dependency on which 3rd-place teams qualify.
#
# R32_THIRD_PLACE_SLOTS: matches where a group winner faces whichever
# qualifying 3rd-place team comes from the listed eligible groups.
# Assignment is done greedily: iterate through ranked 3rd-place qualifiers
# (best first) and assign each to the first unfilled slot whose eligibleGroups
# contains that team's group letter.

R32_FIXED: list[dict] = [
    # match  team1              team2          FIFA match #
    {"slot": 0,  "team1": "runner_up_A", "team2": "runner_up_B"},  # M73
    {"slot": 1,  "team1": "winner_F",    "team2": "runner_up_C"},  # M75
    {"slot": 2,  "team1": "winner_C",    "team2": "runner_up_F"},  # M76
    {"slot": 3,  "team1": "runner_up_E", "team2": "runner_up_I"},  # M78
    {"slot": 4,  "team1": "runner_up_K", "team2": "runner_up_L"},  # M83
    {"slot": 5,  "team1": "winner_H",    "team2": "runner_up_J"},  # M84
    {"slot": 6,  "team1": "winner_J",    "team2": "runner_up_H"},  # M86
    {"slot": 7,  "team1": "runner_up_D", "team2": "runner_up_G"},  # M88
]

R32_THIRD_PLACE_SLOTS: list[dict] = [
    # match  winner        eligible groups for 3rd-place opponent   FIFA match #
    {"slot": 8,  "winner": "winner_E", "eligible_groups": ["A", "B", "C", "D", "F"]},  # M74
    {"slot": 9,  "winner": "winner_I", "eligible_groups": ["C", "D", "F", "G", "H"]},  # M77
    {"slot": 10, "winner": "winner_A", "eligible_groups": ["C", "E", "F", "H", "I"]},  # M79
    {"slot": 11, "winner": "winner_L", "eligible_groups": ["E", "H", "I", "J", "K"]},  # M80
    {"slot": 12, "winner": "winner_D", "eligible_groups": ["B", "E", "F", "I", "J"]},  # M81
    {"slot": 13, "winner": "winner_G", "eligible_groups": ["A", "E", "H", "I", "J"]},  # M82
    {"slot": 14, "winner": "winner_B", "eligible_groups": ["E", "F", "G", "I", "J"]},  # M85
    {"slot": 15, "winner": "winner_K", "eligible_groups": ["D", "E", "I", "J", "L"]},  # M87
]

# R16 bracket: which pairs of R32 match winners play each other.
# Expressed as pairs of R32 slot indices (match numbers, 0-based).
# e.g. (0, 1) means the winner of R32 match 0 plays the winner of R32 match 1.
R16_BRACKET: list[tuple[int, int]] = [
    (0, 1),    # M73 winner vs M75 winner  → R16 M90
    (2, 3),    # M76 winner vs M78 winner  → R16 M91
    (4, 5),    # M83 winner vs M84 winner  → R16 M93
    (6, 7),    # M86 winner vs M88 winner  → R16 M95 (inferred)
    (8, 9),    # M74 winner vs M77 winner  → R16 M89
    (10, 11),  # M79 winner vs M80 winner  → R16 M92
    (12, 13),  # M81 winner vs M82 winner  → R16 M94
    (14, 15),  # M85 winner vs M87 winner  → R16 M96
]


# --------------------------------------------------------------------------- #
# Bracket slot counts (used by models and validation)
# --------------------------------------------------------------------------- #

ROUND_SLOT_COUNTS: dict[str, int] = {
    "R32":   32,   # 16 matches × 2 teams
    "R16":   16,   # 8 matches × 2 teams
    "QF":    8,    # 4 matches × 2 teams
    "SF":    4,    # 2 matches × 2 teams
    "FINAL": 2,    # 1 match × 2 teams
    "THIRD": 2,    # 3rd-place play-off × 2 teams
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def all_teams() -> list[str]:
    """Return all 48 tournament teams in group order."""
    return [team for teams in GROUPS.values() for team in teams]