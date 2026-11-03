"""Server HTTP MJPEG ringan di port 8001 untuk di-proxy oleh Backend FastAPI."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import logging
import threading
import time
import cv2
import numpy as np

import config

logger = logging.getLogger("sigap.mjpeg")


class FrameBuffer:
    """Buffer thread-safe penyimpan frame JPEG terbaru untuk live view."""

    def __init__(self) -> None:
        self._lock = threading.Condition()
        self._jpeg_bytes: bytes | None = None
        self._frame_id: int = 0

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


class MjpegHandler(BaseHTTPRequestHandler):
    """Handler HTTP untuk endpoint /stream dan /health."""

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    def do_GET(self) -> None:
        if self.path.startswith("/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
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


def start_mjpeg_server(host: str = config.MJPEG_HOST, port: int = config.MJPEG_PORT) -> ThreadingHTTPServer:
    """Jalankan server MJPEG pada daemon thread."""
    server = ThreadingHTTPServer((host, port), MjpegHandler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Stream MJPEG aktif di http://%s:%s/stream", host, port)
    return server

