"""
FastAPI Application Entry Point
"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env from the backend directory so API keys are available at runtime
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

from app.api.auth_routes import router as auth_router
from app.api.routes import router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Business Advisory Assistant starting up.")
    yield
    logger.info("Shutting down.")


# ---------------------------------------------------------------------------
# App Instance
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AI Business Advisory Assistant",
    description=(
        "Multilingual AI-powered rural business feasibility platform. "
        "Combines deterministic financial routing with LLM-generated market intelligence "
        "grounded in real OpenStreetMap competitor data."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow the React frontend on localhost during development
# ---------------------------------------------------------------------------
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if origin.strip()
]

# A fixed allowlist is too brittle for local development: Vite moves to 5174
# when 5173 is taken, browsers reach the same server as either localhost or
# 127.0.0.1, and `--host` serves it on a LAN address. Any of those used to be
# refused, which surfaced as an unexplained failure to sign in.
#
# Outside production we therefore accept any loopback origin on any port. Set
# APP_ENV=production on a deployment to restrict it to CORS_ORIGINS alone.
IS_PRODUCTION = os.getenv("APP_ENV", "development").lower() == "production"
LOOPBACK_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"

# Vercel gives every branch and every commit its own preview URL, so a fixed
# allowlist can only ever cover the production domain. CORS_ORIGIN_REGEX takes
# a pattern for those; set it to something like
#   ^https://fingrow(-[a-z0-9-]+)?\.vercel\.app$
# which matches the production domain and its previews but nothing else.
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None

if IS_PRODUCTION:
    origin_regex = CORS_ORIGIN_REGEX
elif CORS_ORIGIN_REGEX:
    # Accept both in development, so a local frontend and a deployed one can
    # talk to the same backend while testing.
    origin_regex = f"({CORS_ORIGIN_REGEX})|({LOOPBACK_ORIGIN_REGEX})"
else:
    origin_regex = LOOPBACK_ORIGIN_REGEX

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info(
    "CORS allowlist: %s | regex: %s | env: %s",
    ", ".join(CORS_ORIGINS) or "(none)",
    origin_regex or "(none)",
    "production" if IS_PRODUCTION else "development",
)

# ---------------------------------------------------------------------------
# Register Routes
# ---------------------------------------------------------------------------
app.include_router(auth_router, prefix="/api")
app.include_router(router, prefix="/api")
