"""
Vercel serverless entrypoint for the FinGrow API.

Vercel turns files under /api into serverless functions. vercel.json rewrites
every /api/* request here, and this module hands them to the same FastAPI app
that runs locally under uvicorn — the original request path is preserved, so
the app's own /api/... routes match exactly as they do in development.

Running the API on the same deployment as the frontend means requests are
same-origin: no CORS, no second service to host, and no VITE_API_URL to set.
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# The deployment filesystem is read-only apart from /tmp, and each store reads
# its path from the environment at import time — so these must be set before
# the app is imported. setdefault lets the Vercel dashboard override any of
# them, for instance to point at a mounted volume.
#
# /tmp lives only as long as the function instance, so data does not survive a
# cold start or a redeploy. See DEPLOYMENT.md.
DATA_DIR = "/tmp/fingrow"
for variable, filename in (
    ("USERS_DB_PATH", "users.db"),
    ("SESSION_DB_PATH", "sessions.db"),
    ("LOANS_DB_PATH", "loans.db"),
    ("HARVEST_DB_PATH", "harvest.db"),
    ("ADVISORY_DB_PATH", "advisory.db"),
):
    os.environ.setdefault(variable, f"{DATA_DIR}/{filename}")

os.environ.setdefault("APP_ENV", "production")
# Requests from the site itself are same-origin and need no CORS. This covers
# the project's preview URLs, should one ever be pointed at another deployment.
os.environ.setdefault("CORS_ORIGIN_REGEX", r"^https://sih-project-[a-z0-9-]+\.vercel\.app$")

from app.main import app  # noqa: E402  (must follow the environment setup above)

__all__ = ["app"]
