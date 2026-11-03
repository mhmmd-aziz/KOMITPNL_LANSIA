"""Router WebSocket untuk pembaruan grup real-time dan kanal cv-worker."""

from datetime import datetime, timezone
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.config import WORKER_API_KEY
from app.database import SessionLocal
from app.deps import decode_token, is_group_member_or_admin
from app.models import Camera, VoiceMessage
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/groups/{group_id}")
async def group_websocket(
    websocket: WebSocket,
    group_id: int,
    token: str = Query(default=""),
) -> None:
    """Kanal real-time anggota/admin grup untuk event.created, event.updated, camera.status."""
    db = SessionLocal()
    try:
        user = decode_token(token, db)
        if not is_group_member_or_admin(db, group_id, user):
            await websocket.close(code=4403)
            return
    except Exception:
        await websocket.close(code=4401)
        return
    finally:
        db.close()

    await ws_manager.connect_group(group_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect_group(group_id, websocket)


@router.websocket("/ws/worker/{camera_id}")
async def worker_websocket(
    websocket: WebSocket,
    camera_id: int,
    key: str = Query(default=""),
) -> None:
    """Kanal cv-worker untuk status online otomatis dan penerimaan pesan suara voice.play."""
    if not key or key != WORKER_API_KEY:
        await websocket.close(code=4401)
        return

    group_id: int | None = None
    db = SessionLocal()
    try:
        cam = db.get(Camera, camera_id)
        if cam:
            cam.status = "online"
            group_id = cam.group_id
            db.commit()
    finally:
        db.close()

    await ws_manager.connect_worker(camera_id, websocket)
    if group_id is not None:
        await ws_manager.broadcast_to_group(
            group_id,
            {"type": "camera.status", "camera_id": camera_id, "status": "online"},
        )

    try:
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "voice.played" and msg.get("voice_id"):
                db_ack = SessionLocal()
                try:
                    vm = db_ack.get(VoiceMessage, int(msg["voice_id"]))
                    if vm:
                        vm.played_at = datetime.now(timezone.utc)
                        db_ack.commit()
                finally:
                    db_ack.close()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        ws_manager.disconnect_worker(camera_id, websocket)
        db_off = SessionLocal()
        try:
            cam = db_off.get(Camera, camera_id)
            if cam:
                cam.status = "offline"
                group_id = cam.group_id
                db_off.commit()
        finally:
            db_off.close()

        if group_id is not None:
            await ws_manager.broadcast_to_group(
                group_id,
                {"type": "camera.status", "camera_id": camera_id, "status": "offline"},
            )

