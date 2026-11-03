"""Konfigurasi dan ambang deteksi jatuh SIGAP (mudah disetel saat uji lapangan)."""

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Koneksi ke Backend
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
WORKER_API_KEY: str = os.getenv("WORKER_API_KEY", "sigap-worker-key-2026")
CAMERA_ID: int = int(os.getenv("CAMERA_ID", "1"))

# Server Stream MJPEG Lokal
MJPEG_HOST: str = "0.0.0.0"
MJPEG_PORT: int = int(os.getenv("MJPEG_PORT", "8001"))
JPEG_QUALITY: int = 80

# Model & Performa (Target >= 15 FPS di CPU)
MODEL_PATH: str = os.getenv("MODEL_PATH", "yolov8n-pose.pt")
INPUT_IMAGE_SIZE: int = 640
PROCESS_EVERY_N_FRAMES: int = 2
PERSON_CONF_THRESHOLD: float = 0.40
KEYPOINT_CONF_THRESHOLD: float = 0.35

# Ambang Logika Deteksi Jatuh (CLAUDE.md)
HIP_DROP_SPEED_RATIO: float = 0.50       # Laju turun pinggul > 0,5 x tinggi badan / detik
TORSO_ANGLE_DEG_THRESHOLD: float = 60.0  # Sudut garis bahu-pinggul > 60 derajat dari tegak
BBOX_ASPECT_RATIO_THRESHOLD: float = 1.2 # Rasio lebar / tinggi bounding box > 1,2
UPRIGHT_RECOVERY_ANGLE_DEG: float = 42.0 # Sudut kembali tegak untuk batal jatuh
FALL_CONFIRM_SECONDS: float = 5.0        # Tetap di lantai >= 5 detik sebelum konfirmasi
EVENT_COOLDOWN_SECONDS: float = 60.0     # Jeda minimal antar pengiriman event per kamera
FLOOR_GRACE_SECONDS: float = 0.8         # Toleransi kedipan keypoint sesaat saat di lantai

# Poligon Zona Abaikan (Kasur / Sofa) dalam koordinat ternormalisasi (0.0 - 1.0)
# Default sudah disesuaikan dengan area sofa kanan pada video simulasi demo_duduk.mp4.
# Bisa juga digambar ulang langsung di jendela kamera dengan menekan tombol 'z' (atau 'r' untuk hapus).
IGNORE_ZONES_NORMALIZED: list[list[tuple[float, float]]] = [
    [(0.64, 0.50), (0.95, 0.50), (0.95, 0.92), (0.64, 0.92)]
]

# Warna Overlay OpenCV dalam format BGR (Blue, Green, Red) sesuai colour.md
COLOR_NORMAL: tuple[int, int, int] = (129, 185, 16)       # #10B981 - Hijau Aman
COLOR_SUSPECTED: tuple[int, int, int] = (11, 158, 245)    # #F59E0B - Kuning Kemungkinan Jatuh
COLOR_CONFIRMED: tuple[int, int, int] = (38, 38, 220)     # #DC2626 - Merah Jatuh Terkonfirmasi
COLOR_IGNORE_ZONE: tuple[int, int, int] = (246, 130, 59)  # #3B82F6 - Biru Zona Kasur/Sofa

