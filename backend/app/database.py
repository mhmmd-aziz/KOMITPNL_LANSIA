"""Koneksi database SQLAlchemy untuk MySQL (atau SQLite saat uji cepat)."""

from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from app.config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine_kwargs = {
    "connect_args": connect_args,
    "pool_pre_ping": True,
}
if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs["pool_recycle"] = 1800

engine = create_engine(DATABASE_URL, **engine_kwargs)
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

