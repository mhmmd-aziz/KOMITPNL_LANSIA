"""Titik masuk utama aplikasi FastAPI SIGAP."""

from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import UPLOADS_DIR
from app.database import Base, engine
from app import models  # noqa: F401 - pastikan semua model terdaftar di Base.metadata
from app.routers import auth, cameras, events, groups, saas, simulations, ws
from app.services.cleanup import purge_expired_media
from app.services.fcm_service import cancel_all_reminder_tasks, init_firebase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sigap.main")


def _ensure_column_migrations() -> None:
    """Pastikan kolom kode_undangan dan lokasi_cctv tersedia di database."""
    if engine.dialect.name == "mysql":
        try:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE family_groups MODIFY COLUMN kode_undangan VARCHAR(16) NOT NULL")
                )
        except Exception as exc:
            logger.debug("Migrasi kolom kode_undangan dilewati: %s", exc)

    try:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE cameras ADD COLUMN lokasi_cctv VARCHAR(255) NOT NULL DEFAULT ''")
            )
    except Exception as exc:
        logger.debug("Kolom lokasi_cctv sudah ada: %s", exc)

    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE cameras SET lokasi_cctv = 'Jl. Melati No. 10 (Titik CCTV Ruangan) https://maps.google.com/?q=-6.2088,106.8456' "
                    "WHERE lokasi_cctv IS NULL OR lokasi_cctv = ''"
                )
            )
    except Exception as exc:
        logger.debug("Inisialisasi default lokasi_cctv dilewati: %s", exc)

    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE family_groups SET kontak_darurat = '+62 895-6006-86367' "
                    "WHERE kontak_darurat IS NULL OR kontak_darurat = '' OR kontak_darurat = '081234567890'"
                )
            )
    except Exception as exc:
        logger.debug("Inisialisasi default kontak_darurat dilewati: %s", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Inisialisasi tabel database, Firebase SDK, dan retensi privasi saat startup."""
    Base.metadata.create_all(bind=engine)
    _ensure_column_migrations()
    init_firebase()
    purge_expired_media()
    logger.info("Backend SIGAP siap melayani request.")
    try:
        yield
    finally:
        await cancel_all_reminder_tasks()


app = FastAPI(
    title="SIGAP Backend API",
    description=(
        "Sistem Deteksi Jatuh pada Lansia Berbasis Computer Vision Menggunakan CCTV "
        "dengan Notifikasi Real-Time kepada Keluarga."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(cameras.router)
app.include_router(events.router)
app.include_router(saas.router)
app.include_router(simulations.router)
app.include_router(ws.router)


@app.get("/health", tags=["Sistem"])
def health_check() -> dict:
    """Endpoint pengecekan kesehatan server untuk demo di jaringan lokal."""
    return {"status": "ok", "service": "sigap-backend"}
