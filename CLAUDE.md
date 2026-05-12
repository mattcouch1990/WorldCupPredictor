# CLAUDE.md — FIFA World Cup 2026 Prediction Game

This file is the source of truth for how to work on this project.
Read it fully before writing any code.

---

## Project Summary

A multi-user football prediction game for the 2026 FIFA World Cup (June 11 – July 19, 2026).
Users are given a passcode by the admin, log in with their email and passcode, predict group
stage scores and knockout stage progression, and accumulate points as the real tournament unfolds.

Full specification is in `worldcup2026_prediction_game_brief.md` in the repo root.

---

## Git

- **Active branch:** `feature/backend-core` ← update this at the start of every session
- Never commit directly to `main` or `develop`
- Commit frequently — every logical unit of work gets its own commit
- Use conventional commit messages:
  - `feat:` new functionality
  - `fix:` bug fix
  - `chore:` config, tooling, deps
  - `refactor:` restructuring without behaviour change
  - `test:` adding or updating tests
- Do not squash commits; preserve the full history so sessions are reviewable
- Do not push to `main` under any circumstances

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite |
| Backend | FastAPI (Python 3.12) |
| Database | SQLite via SQLAlchemy 2.0 (async) |
| Auth | Email + passcode (bcrypt), JWT via `python-jose` |
| Styling | Tailwind CSS |
| Containerisation | Docker Compose (services: `backend`, `frontend`, `nginx`) |
| Package manager (Python) | `pip` with `requirements.txt` |
| Package manager (JS) | `npm` |

---

## Repository Structure

```
worldcup2026/
├── CLAUDE.md                          ← this file
├── worldcup2026_prediction_game_brief.md
├── docker-compose.yml
├── nginx.conf
├── backend/
│   ├── main.py                        ← FastAPI app entry point
│   ├── database.py                    ← SQLAlchemy engine + session
│   ├── models.py                      ← ORM models
│   ├── schemas.py                     ← Pydantic request/response schemas
│   ├── crud.py                        ← DB read/write helpers
│   ├── auth.py                        ← JWT creation/validation, password hashing
│   ├── scoring.py                     ← all points calculation logic
│   ├── tournament_data.py             ← static WC data (groups, fixtures, flags, rankings)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                    ← routing, auth context
│   │   ├── api.js                     ← all fetch calls centralised here
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── GroupTab.jsx           ← reused for tabs 1–12 via props
│   │   │   ├── KnockoutTab.jsx        ← tab 13
│   │   │   ├── LeaderboardTab.jsx     ← tab 14
│   │   │   └── AdminPanel.jsx         ← route /admin
│   │   └── components/
│   │       ├── FixtureRow.jsx
│   │       ├── GroupTable.jsx
│   │       ├── BracketTree.jsx
│   │       ├── TeamAutocomplete.jsx
│   │       ├── LockBanner.jsx
│   │       └── ProfileModal.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
```

---

## Environment Variables

Never hardcode secrets. All config goes in `backend/.env` (gitignored).
Provide `backend/.env.example` with placeholder values.

```env
SECRET_KEY=changeme_long_random_string
ADMIN_PASSWORD=changeme_admin_password
DATABASE_URL=sqlite+aiosqlite:///./worldcup.db
CORS_ORIGINS=http://localhost:5173
PREDICTION_LOCK_UTC=2026-06-11T20:00:00Z
```

Load with `python-dotenv` in `database.py` and `auth.py`.

---

## Backend Conventions

### FastAPI
- Use `async def` for all route handlers and DB calls
- Use `APIRouter` to group routes — one router per domain:
  - `auth_router` — `/auth/*`
  - `predictions_router` — `/predictions/*`
  - `tournament_router` — `/tournament/*`
  - `leaderboard_router` — `/leaderboard`
  - `admin_router` — `/admin/*`
- Always return typed Pydantic response models — never return raw dicts
- Use `HTTPException` with appropriate status codes; never swallow exceptions silently
- Validate all inputs with Pydantic; reject unexpected fields with `model_config = ConfigDict(extra='forbid')`

### SQLAlchemy
- Use SQLAlchemy 2.0 style (`AsyncSession`, `select()`, `await session.execute()`)
- Define all models in `models.py` with explicit `__tablename__`
- Use `Mapped` and `mapped_column` type annotations throughout
- Foreign keys must have explicit `ondelete` behaviour defined
- Never use `session.execute(text(...))` for application queries — use ORM constructs

### Auth
- User passcodes are hashed with `bcrypt` before storage — never log or return them
- JWTs contain: `sub` (user_id), `is_admin` (bool), `exp`
- User tokens expire after 7 days; admin tokens after 12 hours
- Protect routes with a `get_current_user` dependency; admin routes additionally check `is_admin`
- Admin login is a separate endpoint (`POST /admin/login`) using `ADMIN_PASSWORD` from env

### Scoring
- All scoring logic lives in `scoring.py` — no scoring logic in route handlers
- `compute_group_table(fixtures, predictions, results)` → sorted list of teams with stats
- `compute_user_score(user_id, db)` → `UserScore` breakdown (group_pts, knockout_pts, special_pts, total)
- Scores are recomputed on demand (triggered by `GET /leaderboard` and `POST /admin/recompute-scores`)
- Incomplete predictions (null goals) count as 0–0 for group table display only; they do not award points

### Locking
- `PREDICTION_LOCK_UTC` from env is the single global lock for all group predictions and the R32 bracket
- Subsequent knockout rounds lock at dates stored in `KNOCKOUT_LOCK_DATES` in `tournament_data.py`
- `GET /tournament/lock-status` returns the current lock state for every round — frontend uses this to enable/disable inputs
- Admin can override any lock via `POST /admin/lock/{round}` and `POST /admin/unlock/{round}`

---

## Frontend Conventions

### General
- All API calls go through `src/api.js` — no `fetch` calls inline in components
- Use React Context for auth state (`user`, `token`, `isAdmin`) — do not pass as props
- Use `useState` + `useEffect` for data fetching; no external state library needed at this scale
- All datetimes from the API are UTC ISO strings; convert to local time for display using `Intl.DateTimeFormat`

### Styling
- Tailwind utility classes only — no custom CSS files except a single `index.css` for Tailwind directives
- Mobile-first: all layouts must work at 375px width
- The group tabs bracket tree can scroll horizontally on narrow screens (`overflow-x-auto`)
- Colour conventions:
  - Qualified (top 2): green highlight on group table row
  - Potential best-3rd: amber highlight
  - Eliminated (4th): grey / muted
  - Locked inputs: grey background, cursor not-allowed
  - Current user's leaderboard row: blue highlight

### Prediction inputs
- Score inputs: `type="number"` min=0 max=99, default display blank (null), treated as 0 for table calc
- Debounce saves: 500ms after last keystroke before sending `PATCH /predictions/group`
- Show a subtle save indicator (✓ saved / saving… / ✗ error) next to each fixture row
- Autocomplete team selector (`TeamAutocomplete.jsx`): filters all 48 teams by typed characters, shows flag emoji + name, keyboard navigable

### Group table calculation
- Recompute entirely client-side on every score input change — do not round-trip to server
- Use the same tiebreaker logic as the backend (document it in a comment block at the top of the component)
- The client-side calc is for display only; the backend is the source of truth for scoring

---

## Key Business Logic — Quick Reference

### Group Table Sort Order
1. Points (W×3 + D×1)
2. Head-to-head points (tied teams only)
3. Head-to-head goal difference (tied teams only)
4. Head-to-head goals scored (tied teams only)
5. Overall goal difference
6. Overall goals scored
7. Fair play score (0 for predictions; yellow=−1, direct red=−3 for actuals)
8. FIFA ranking (lower number = better; see `tournament_data.py`)

### Best Third-Place Ranking (across all 12 groups)
1. Points
2. Goal difference
3. Goals scored
4. Fair play score
5. FIFA ranking

### Points Awarded
| Event | Points |
|---|---|
| Correct exact group score | 3 |
| Correct group result (wrong score) | 1 |
| Correct R32 team | 4 |
| Correct R16 team | 8 |
| Correct QF team | 16 |
| Correct SF team | 32 |
| Correct finalist (Final) | 64 |
| Correct tournament winner | 150 |
| Correct 3rd place team | 50 |
| Correct top goalscorer | 100 |
| Tiebreaker | closest total tournament goals |

---

## Tournament Data Summary

All 48 teams across 12 groups — full data in `tournament_data.py`:

| Group | Teams |
|---|---|
| A | Mexico, South Africa, South Korea, Czechia |
| B | Canada, Bosnia and Herzegovina, Qatar, Switzerland |
| C | Brazil, Morocco, Haiti, Scotland |
| D | United States, Paraguay, Australia, Turkey |
| E | Germany, Curaçao, Ivory Coast, Ecuador |
| F | Netherlands, Japan, Sweden, Tunisia |
| G | Belgium, Egypt, Iran, New Zealand |
| H | Spain, Cape Verde, Saudi Arabia, Uruguay |
| I | France, Senegal, Iraq, Norway |
| J | Argentina, Algeria, Austria, Jordan |
| K | Portugal, DR Congo, Uzbekistan, Colombia |
| L | England, Croatia, Ghana, Panama |

Tournament opens: **June 11, 2026** (Mexico vs South Africa, 20:00 UTC)
Final: **July 19, 2026** (MetLife Stadium, New Jersey)
3rd place play-off: **July 18, 2026** (Hard Rock Stadium, Miami)

---

## Admin Panel

- Route: `/admin` within the main React app
- Protected by a secondary password prompt — stores admin JWT separately from user JWT
- Sub-tabs: Results | Lock Control | Users | Scores | Top Goalscorer
- Never expose admin routes to regular users; validate `is_admin` on every admin API call
- Passcodes for new users are generated as 6-character alphanumeric strings, displayed once on creation

---

## Testing

- Write at least one test per scoring function in `backend/tests/test_scoring.py`
- Use `pytest` with `pytest-asyncio`
- Test the group table tiebreaker logic explicitly with known edge cases
- Frontend: no automated tests required for MVP, but manually verify group table sorting
  against at least two known scenarios before considering a session done

---

## What Not To Do

- Do not add a database migration tool (Alembic) for MVP — drop and recreate the DB during development
- Do not use Redux, Zustand, or any state management library — React Context is sufficient
- Do not use an ORM other than SQLAlchemy
- Do not add unnecessary dependencies — check `requirements.txt` before adding a new package
- Do not store any user prediction data client-side only — always persist to the backend
- Do not return passcodes or secrets in any API response after user creation
- Do not use `SELECT *` — always select explicit columns or use ORM models
- Do not build the email notification nice-to-have during MVP sessions

---

## Definition of Done (per session)

A session's work is ready to merge to `develop` when:
- [ ] The backend starts cleanly with `uvicorn main:app --reload`
- [ ] The frontend starts cleanly with `npm run dev`
- [ ] No console errors on page load
- [ ] New endpoints have at least a manual smoke test (curl or browser)
- [ ] All new code is committed with meaningful messages
- [ ] `.env.example` is updated if new env vars were added
- [ ] `CLAUDE.md` active branch line is updated to reflect the next session's branch
