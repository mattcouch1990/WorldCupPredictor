from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers.admin_router import router as admin_router
from routers.auth_router import router as auth_router
from routers.leaderboard_router import router as leaderboard_router
from routers.predictions_router import router as predictions_router
from routers.tournament_router import router as tournament_router

load_dotenv(dotenv_path=Path(__file__).parent / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="World Cup 2026 Prediction Game",
    version="0.1.0",
    lifespan=lifespan,
)

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(predictions_router)
app.include_router(tournament_router)
app.include_router(leaderboard_router)
app.include_router(admin_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
