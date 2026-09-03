# Required for pytest to find backend/app modules.
#
# Point the SQLite stores at a throwaway temp directory BEFORE any app module
# is imported, so tests never create databases inside the repository.
import os
import tempfile

_TEST_DATA_DIR = tempfile.mkdtemp(prefix="fingrow-tests-")
os.environ.setdefault("SESSION_DB_PATH", os.path.join(_TEST_DATA_DIR, "sessions.db"))
os.environ.setdefault("LOANS_DB_PATH", os.path.join(_TEST_DATA_DIR, "loans.db"))
os.environ.setdefault("HARVEST_DB_PATH", os.path.join(_TEST_DATA_DIR, "harvest.db"))
os.environ.setdefault("ADVISORY_DB_PATH", os.path.join(_TEST_DATA_DIR, "advisory.db"))
