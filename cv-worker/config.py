"""Konfigurasi dan ambang deteksi jatuh SIGAP (mudah disetel saat uji lapangan)."""

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Koneksi ke Backend (selalu gunakan loopback 127.0.0.1 agar aman saat ganti Wi-Fi/Hotspot waktu presentasi)
BACKEND_URL: str = os.getenv("FORCE_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
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

# Ambang Logika Deteksi Jatuh & Pembeda Aktivitas Lantai (CLAUDE.md)
HIP_DROP_SPEED_RATIO: float = 0.50       # Laju turun pinggul > 0,5 x tinggi badan / detik
ANGULAR_FALL_SPEED_DEG: float = 40.0     # Kecepatan rebah punggung > 40 derajat / detik
TORSO_ANGLE_DEG_THRESHOLD: float = 60.0  # Sudut garis bahu-pinggul > 60 derajat dari tegak
BBOX_ASPECT_RATIO_THRESHOLD: float = 1.2 # Rasio lebar / tinggi bounding box > 1,2
UPRIGHT_RECOVERY_ANGLE_DEG: float = 45.0 # Sudut punggung tegak (termasuk duduk lesehan di lantai)
CONTROLLED_SIT_SECONDS: float = 1.5      # Durasi duduk tenang sebelum rebahan sengaja di lantai
FALL_CONFIRM_SECONDS: float = 5.0        # Tetap di lantai >= 5 detik sebelum konfirmasi
EVENT_COOLDOWN_SECONDS: float = 60.0     # Jeda minimal antar pengiriman event per kamera
FLOOR_GRACE_SECONDS: float = 0.8         # Toleransi kedipan keypoint sesaat saat di lantai

# Folder penyimpanan video hasil upload dari Halaman Simulasi Web
SIMULATIONS_DIR: Path = BASE_DIR / "simulations"
SIMULATIONS_DIR.mkdir(parents=True, exist_ok=True)

# File penyimpanan permanen Area Aman (4 titik poligon per video) dari Web Preview
SAFE_ZONES_FILE: Path = BASE_DIR / "safe_zones.json"

# Poligon Area Aman default awal saat belum dikalibrasi dari Web (kosong = sesuai titik pilihan user)
IGNORE_ZONES_NORMALIZED: list[list[tuple[float, float]]] = []

# Warna Overlay OpenCV dalam format BGR (Blue, Green, Red) sesuai colour.md
COLOR_NORMAL: tuple[int, int, int] = (129, 185, 16)       # #10B981 - Hijau Aman
COLOR_SUSPECTED: tuple[int, int, int] = (11, 158, 245)    # #F59E0B - Kuning Kemungkinan Jatuh
COLOR_CONFIRMED: tuple[int, int, int] = (38, 38, 220)     # #DC2626 - Merah Jatuh Terkonfirmasi
COLOR_IGNORE_ZONE: tuple[int, int, int] = (129, 185, 16)  # #10B981 - Hijau Area Aman

