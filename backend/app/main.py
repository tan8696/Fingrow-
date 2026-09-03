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
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Register Routes
# ---------------------------------------------------------------------------
app.include_router(router, prefix="/api")

# Include the voice websocket skill router
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "agent", "skills", "websocket-voice-stream"))
try:
    from voice_server import router as voice_router
    app.include_router(voice_router)
except ImportError as e:
    logger.error(f"Failed to import voice_server skill: {e}")
