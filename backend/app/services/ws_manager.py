"""Manajer koneksi WebSocket untuk grup keluarga dan cv-worker kamera."""

from collections import deque
from collections import defaultdict
import logging
from fastapi import WebSocket

logger = logging.getLogger("sigap.ws")


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
        return len(self.worker_connections) > 0

    def is_worker_online_for(self, camera_id: int) -> bool:
        return camera_id in self.worker_connections or self.has_any_worker()

    def record_camera_voice(self, camera_id: int, entry: dict) -> None:
        self.recent_camera_voices[camera_id].appendleft(entry)

    async def send_to_worker(self, camera_id: int, message: dict) -> bool:
        """Kirim perintah ke cv-worker dengan mengunci target_camera_id agar tidak bocor ke grup lain."""
        ws = self.worker_connections.get(camera_id)
        used_key = camera_id
        if ws is None and self.worker_connections:
            used_key, ws = next(iter(self.worker_connections.items()))
        if not ws:
            return False

        self.active_worker_camera_id = camera_id
        payload = {**message, "target_camera_id": camera_id}
        try:
            await ws.send_json(payload)
            return True
        except Exception as exc:
            logger.warning("Gagal mengirim pesan ke worker kamera %s: %s", camera_id, exc)
            self.worker_connections.pop(used_key, None)
            return False


ws_manager = ConnectionManager()
