"""Server HTTP MJPEG & Kontrol Lokal di port 8001 untuk di-proxy oleh Backend FastAPI."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import sys
import threading
import time
import cv2
import numpy as np

import config
from voice_player import push_worker_command

logger = logging.getLogger("sigap.mjpeg")


class FrameBuffer:
    """Buffer thread-safe penyimpan frame JPEG & telemetri terbaru untuk live view."""

    def __init__(self) -> None:
        self._lock = threading.Condition()
        self._jpeg_bytes: bytes | None = None
        self._frame_id: int = 0
        self.latest_telemetry: dict = {
            "type": "simulation.telemetry",
            "camera_id": 1,
            "mode": "prepare",
            "running": False,
            "source": "demo_duduk.mp4",
            "zones_count": 0,
            "progress": 0,
            "state": "NORMAL",
            "posture": "Siap Analisis",
            "torso_angle": 0.0,
            "aspect_ratio": 0.0,
            "timer_elapsed": 0.0,
        }

    def update(self, frame: np.ndarray) -> None:
        ok, encoded = cv2.imencode(
            ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), config.JPEG_QUALITY]
        )
        if not ok:
            return
        with self._lock:
            self._jpeg_bytes = encoded.tobytes()
            self._frame_id += 1
            self._lock.notify_all()

    def wait_next_frame(self, last_id: int, timeout: float = 1.0) -> tuple[int, bytes | None]:
        with self._lock:
            if self._frame_id == last_id:
                self._lock.wait(timeout=timeout)
            return self._frame_id, self._jpeg_bytes


frame_buffer = FrameBuffer()


class ExclusiveThreadingHTTPServer(ThreadingHTTPServer):
    """Mencegah dua proses cv-worker mengikat port 8001 secara bersamaan di Windows."""

    allow_reuse_address = False


class MjpegHandler(BaseHTTPRequestHandler):
    """Handler HTTP untuk endpoint /stream, /health, /telemetry, dan /command."""

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    def do_GET(self) -> None:
        if self.path.startswith("/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return

        if self.path.startswith("/telemetry"):
            body = json.dumps(frame_buffer.latest_telemetry).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if not self.path.startswith("/stream"):
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Age", "0")
        self.send_header("Cache-Control", "no-cache, private")
        self.send_header("Pragma", "no-cache")
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()

        last_id = -1
        try:
            while True:
                last_id, jpeg = frame_buffer.wait_next_frame(last_id)
                if not jpeg:
                    time.sleep(0.05)
                    continue
                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode("ascii"))
                self.wfile.write(jpeg)
                self.wfile.write(b"\r\n")
        except (BrokenPipeError, ConnectionResetError, OSError):
            return

    def do_POST(self) -> None:
        if not self.path.startswith("/command"):
            self.send_response(404)
            self.end_headers()
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            cmd = json.loads(raw.decode("utf-8"))
            if isinstance(cmd, dict):
                push_worker_command(cmd)
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            err = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)


def _is_existing_worker_alive(port: int) -> bool:
    """Cek apakah sudah ada CV Worker versi terbaru yang merespons /telemetry di port ini."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/telemetry", timeout=0.6) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return isinstance(data, dict) and data.get("source") not in (None, "IDLE")
            return False
    except Exception:
        return False


def _kill_stale_port_holders(port: int) -> None:
    """Bersihkan proses cv-worker versi lama yang masih menahan port 8001 di Windows."""
    import os
    import subprocess

    my_pid = os.getpid()
    try:
        out = subprocess.check_output(
            ["netstat", "-ano"], text=True, stderr=subprocess.DEVNULL
        )
        pids: set[int] = set()
        for line in out.splitlines():
            if f":{port} " in line and "LISTENING" in line.upper():
                parts = line.split()
                if parts and parts[-1].isdigit():
                    pid = int(parts[-1])
                    if pid > 4 and pid != my_pid:
                        pids.add(pid)
        for pid in pids:
            logger.warning("Menghentikan proses CV Worker lama di port %s (PID %s)...", port, pid)
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        if pids:
            time.sleep(0.5)
    except Exception:
        pass


def start_mjpeg_server(
    host: str = config.MJPEG_HOST, port: int = config.MJPEG_PORT
) -> ThreadingHTTPServer:
    """Jalankan server MJPEG pada daemon thread; gantikan worker lama jika perlu."""
    if _is_existing_worker_alive(port):
        logger.warning(
            "CV Worker terbaru sudah aktif melayani port %s. Menutup proses duplikat.",
            port,
        )
        sys.exit(0)

    _kill_stale_port_holders(port)

    try:
        server = ExclusiveThreadingHTTPServer((host, port), MjpegHandler)
    except OSError:
        server = ThreadingHTTPServer((host, port), MjpegHandler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Stream MJPEG & Kontrol HTTP aktif di http://%s:%s/stream", host, port)
    return server
