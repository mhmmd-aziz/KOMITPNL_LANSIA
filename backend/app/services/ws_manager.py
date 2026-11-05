"""Manajer koneksi WebSocket untuk grup keluarga dan cv-worker kamera."""

from collections import defaultdict, deque
import logging
import os
import socket
import httpx
from fastapi import WebSocket

from app.config import CV_WORKER_URL

logger = logging.getLogger("sigap.ws")


def _is_local_worker_port_open(host: str = "127.0.0.1", port: int = 8001) -> bool:
    if os.getenv("WORKER_API_KEY") == "test-worker-key":
        return False
    try:
        with httpx.Client(timeout=0.3) as client:
            r = client.get(f"http://{host}:{port}/telemetry")
            if r.status_code == 200:
                data = r.json()
                return isinstance(data, dict) and data.get("source") not in (None, "IDLE")
            return False
    except Exception:
        return False


class ConnectionManager:
    """Mengelola koneksi WebSocket aktif per grup dan per kamera worker."""

    def __init__(self) -> None:
        self.group_connections: dict[int, set[WebSocket]] = defaultdict(set)
        self.worker_connections: dict[int, WebSocket] = {}
        self.latest_telemetry: dict[int, dict] = {}
        self.active_worker_camera_id: int = 1
        # Riwayat ringkas percakapan 2 arah per camera_id (HP <-> POV CCTV Laptop)
        self.recent_camera_voices: dict[int, deque[dict]] = defaultdict(
            lambda: deque(maxlen=20)
        )

    async def connect_group(self, group_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.group_connections[group_id].add(websocket)

    def disconnect_group(self, group_id: int, websocket: WebSocket) -> None:
        self.group_connections[group_id].discard(websocket)
        if not self.group_connections[group_id]:
            self.group_connections.pop(group_id, None)

    async def broadcast_to_group(self, group_id: int, message: dict) -> None:
        """Kirim pembaruan real-time HANYA ke anggota grup pemilik kamera tersebut."""
        dead_sockets: list[WebSocket] = []
        for ws in list(self.group_connections.get(group_id, set())):
            try:
                await ws.send_json(message)
            except Exception:
                dead_sockets.append(ws)
        for ws in dead_sockets:
            self.disconnect_group(group_id, ws)

    async def connect_worker(self, camera_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.worker_connections[camera_id] = websocket

    def disconnect_worker(self, camera_id: int, websocket: WebSocket) -> None:
        if self.worker_connections.get(camera_id) is websocket:
            self.worker_connections.pop(camera_id, None)

    def has_any_worker(self) -> bool:
        return len(self.worker_connections) > 0 or _is_local_worker_port_open()

    def is_worker_online_for(self, camera_id: int) -> bool:
        return camera_id in self.worker_connections or self.has_any_worker()

    def record_camera_voice(self, camera_id: int, entry: dict) -> None:
        self.recent_camera_voices[camera_id].appendleft(entry)

    async def send_to_worker(self, camera_id: int, message: dict) -> bool:
        """Kirim perintah ke cv-worker lewat HTTP langsung (:8001/command) maupun WebSocket."""
        self.active_worker_camera_id = camera_id
        payload = {**message, "target_camera_id": camera_id}
        delivered = False

        # 1. Kirim langsung ke server HTTP proses CV Worker yang memegang port 8001
        if (
            os.getenv("WORKER_API_KEY") != "test-worker-key"
            and message.get("type") != "voice.play"
        ):
            try:
                async with httpx.AsyncClient(timeout=1.5) as client:
                    resp = await client.post(f"{CV_WORKER_URL}/command", json=payload)
                    if resp.status_code == 200:
                        delivered = True
            except Exception:
                pass

        # 2. Jika sudah terkirim via HTTP dan bukan voice.play, tidak perlu duplikasi perintah di WS
        if delivered and message.get("type") != "voice.play":
            return True

        # 3. Cadangan / jalur WebSocket (untuk voice.play dan unit test)
        ws = self.worker_connections.get(camera_id)
        used_key = camera_id
        if ws is None and self.worker_connections:
            used_key, ws = next(iter(self.worker_connections.items()))
        if not ws:
            return delivered

        try:
            await ws.send_json(payload)
            return True
        except Exception as exc:
            logger.warning("Gagal mengirim pesan WS ke worker kamera %s: %s", camera_id, exc)
            self.worker_connections.pop(used_key, None)
            return delivered


ws_manager = ConnectionManager()
