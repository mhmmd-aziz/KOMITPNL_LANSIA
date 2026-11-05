"""Koneksi database SQLAlchemy untuk MySQL (dengan auto-start Laragon MySQL & fallback SQLite otomatis saat presentasi)."""

import glob
import logging
from pathlib import Path
import socket
import subprocess
import sys
import time
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from app.config import BASE_DIR, DATABASE_URL

logger = logging.getLogger("sigap.db")


def _is_mysql_port_open(host: str = "127.0.0.1", port: int = 3306) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.4):
            return True
    except OSError:
        return False


def _try_autostart_laragon_mysql() -> bool:
    """Coba nyalakan mysqld.exe bawaan Laragon secara otomatis jika port 3306 belum hidup."""
    if _is_mysql_port_open():
        return True
    candidates = glob.glob(r"C:\laragon\bin\mysql\*\bin\mysqld.exe")
    if not candidates:
        return False
    mysqld_bin = candidates[0]
    flags = 0
    if sys.platform == "win32":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(
            subprocess, "CREATE_NEW_PROCESS_GROUP", 0
        )
    try:
        subprocess.Popen(
            [mysqld_bin],
            cwd=str(Path(mysqld_bin).parent),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
        )
        for _ in range(12):
            time.sleep(0.3)
            if _is_mysql_port_open():
                logger.info("MySQL Laragon berhasil dinyalakan otomatis (%s).", mysqld_bin)
                return True
    except Exception as exc:
        logger.debug("Gagal auto-start mysqld Laragon: %s", exc)
    return _is_mysql_port_open()


def _resolve_active_database_url(configured_url: str) -> str:
    if not configured_url.startswith("mysql"):
        return configured_url
    if _try_autostart_laragon_mysql():
        return configured_url
    fallback_path = (BASE_DIR / "sigap_local.db").as_posix()
    logger.warning(
        "MySQL localhost:3306 tidak aktif. Beralih otomatis ke database lokal SQLite (%s) agar presentasi tetap berjalan lancar!",
        fallback_path,
    )
    return f"sqlite:///{fallback_path}"


ACTIVE_DATABASE_URL = _resolve_active_database_url(DATABASE_URL)
connect_args = (
    {"check_same_thread": False} if ACTIVE_DATABASE_URL.startswith("sqlite") else {}
)

engine_kwargs = {
    "connect_args": connect_args,
    "pool_pre_ping": True,
}
if not ACTIVE_DATABASE_URL.startswith("sqlite"):
    engine_kwargs["pool_recycle"] = 1800

engine = create_engine(ACTIVE_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Kelas dasar seluruh model tabel SIGAP."""
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency FastAPI untuk menyediakan sesi database per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

