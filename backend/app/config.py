"""
Application Configuration
=========================
Loads environment variables from .env file or system environment.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend directory if it exists
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
else:
    load_dotenv()  # Fallback to default search

# Environment settings
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
BHASHINI_API_KEY: str = os.getenv("BHASHINI_API_KEY", "")
BHASHINI_USER_ID: str = os.getenv("BHASHINI_USER_ID", "")
GOOGLE_TRANSLATE_API_KEY: str = os.getenv("GOOGLE_TRANSLATE_API_KEY", "")

CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if origin.strip()
]

# Database (optional for production persistence)
POSTGRES_URL: str = os.getenv("POSTGRES_URL", "")
