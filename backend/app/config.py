"""Konfigurasi backend SIGAP dari environment variables."""

import os
from datetime import timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:@localhost:3306/sigap",
)
JWT_SECRET: str = os.getenv("JWT_SECRET", "sigap-dev-secret-change-me")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

_raw_firebase_cred = os.getenv("FIREBASE_CREDENTIALS", "firebase-service-account.json")
_cred_path = Path(_raw_firebase_cred)
if not _cred_path.is_absolute():
    _cred_path = (BASE_DIR / _cred_path).resolve()
FIREBASE_CREDENTIALS: str = str(_cred_path)
WORKER_API_KEY: str = os.getenv("WORKER_API_KEY", "sigap-worker-key-2026")
CV_WORKER_URL: str = os.getenv("CV_WORKER_URL", "http://127.0.0.1:8001").rstrip("/")

UPLOADS_DIR: Path = BASE_DIR / "uploads"
SNAPSHOTS_DIR: Path = UPLOADS_DIR / "snapshots"
VOICES_DIR: Path = UPLOADS_DIR / "voices"

SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
VOICES_DIR.mkdir(parents=True, exist_ok=True)

# Zona waktu WIB (UTC+7) bebas error tzdata di Windows
WIB_TZ = timezone(timedelta(hours=7), name="WIB")

# Konfigurasi notifikasi ulang (FR-08) & retensi privasi (NFR-06)
REMINDER_INTERVAL_SECONDS: int = int(os.getenv("REMINDER_INTERVAL_SECONDS", "120"))
MAX_REMINDER_COUNT: int = int(os.getenv("MAX_REMINDER_COUNT", "3"))
RETENTION_DAYS: int = 30


def to_wib_iso(dt) -> str | None:
    """Ubah datetime UTC dari database menjadi string ISO-8601 WIB (+07:00)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(WIB_TZ).isoformat()

