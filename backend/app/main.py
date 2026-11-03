"""Titik masuk utama aplikasi FastAPI SIGAP."""

from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import UPLOADS_DIR
from app.database import Base, engine
from app import models  # noqa: F401 - pastikan semua model terdaftar di Base.metadata
from app.routers import auth, cameras, events, groups, ws
from app.services.cleanup import purge_expired_media
from app.services.fcm_service import cancel_all_reminder_tasks, init_firebase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sigap.main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Inisialisasi tabel database, Firebase SDK, dan retensi privasi saat startup."""
    Base.metadata.create_all(bind=engine)
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
app.include_router(ws.router)


@app.get("/health", tags=["Sistem"])
def health_check() -> dict:
    """Endpoint pengecekan kesehatan server untuk demo di jaringan lokal."""
    return {"status": "ok", "service": "sigap-backend"}

