"""Manajer koneksi WebSocket untuk grup keluarga dan cv-worker kamera."""

import logging
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger("sigap.ws")


class ConnectionManager:
    """Mengelola koneksi WebSocket aktif per grup dan per kamera worker."""

    def __init__(self) -> None:
        self.group_connections: dict[int, set[WebSocket]] = defaultdict(set)
        self.worker_connections: dict[int, WebSocket] = {}

    async def connect_group(self, group_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.group_connections[group_id].add(websocket)

    def disconnect_group(self, group_id: int, websocket: WebSocket) -> None:
        self.group_connections[group_id].discard(websocket)
        if not self.group_connections[group_id]:
            self.group_connections.pop(group_id, None)

    async def broadcast_to_group(self, group_id: int, message: dict) -> None:
        """Kirim pembaruan real-time ke seluruh anggota/admin di satu grup."""
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

    async def send_to_worker(self, camera_id: int, message: dict) -> bool:
        """Kirim perintah (misalnya voice.play) ke cv-worker untuk kamera tertentu."""
        ws = self.worker_connections.get(camera_id)
        if not ws:
            return False
        try:
            await ws.send_json(message)
            return True
        except Exception as exc:
            logger.warning("Gagal mengirim pesan ke worker kamera %s: %s", camera_id, exc)
            self.worker_connections.pop(camera_id, None)
            return False


ws_manager = ConnectionManager()

