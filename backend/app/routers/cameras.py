"""Router kamera: pendaftaran, proxy live stream MJPEG, dan push-to-talk suara."""

import time
import uuid
from pathlib import Path
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import CV_WORKER_URL, VOICES_DIR
from app.database import get_db
from app.deps import (
    build_base_url,
    ensure_group_access,
    get_current_user,
    get_current_user_or_query_token,
    require_admin,
)
from app.models import Camera, FamilyGroup, User, VoiceMessage
from app.schemas import CameraCreateRequest, CameraResponse, CameraSourceSwitchRequest
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["Kamera & Interaksi"])


def _create_camera_record(
    db: Session,
    group_id: int,
    nama_ruangan: str,
    sumber: str,
    admin_user: User,
) -> CameraResponse:
    group = db.get(FamilyGroup, group_id)
    if not group or group.admin_id != admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grup tidak ditemukan atau Anda bukan admin grup ini.",
        )

    cam = Camera(
        group_id=group_id,
        nama_ruangan=nama_ruangan.strip(),
        sumber=sumber.strip() or "0",
        status="online" if group_id and False else "offline",
    )
    db.add(cam)
    db.commit()
    db.refresh(cam)

    # Jika worker untuk id ini sudah tersambung di WS, tandai online
    if cam.id in ws_manager.worker_connections:
        cam.status = "online"
        db.commit()

    return CameraResponse(
        id=cam.id,
        group_id=cam.group_id,
        nama_ruangan=cam.nama_ruangan,
        sumber=cam.sumber,
        status=cam.status,
    )


@router.post("/groups/{group_id}/cameras", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
def add_camera_to_group(
    group_id: int,
    payload: CameraCreateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CameraResponse:
    """Admin mendaftarkan kamera baru ke dalam grup keluarga (FR-04)."""
    return _create_camera_record(db, group_id, payload.nama_ruangan, payload.sumber, current_user)


@router.post("/cameras", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
def add_camera_direct(
    payload: CameraCreateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CameraResponse:
    """Endpoint alternatif pendaftaran kamera dengan group_id di body."""
    if not payload.group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field group_id wajib diisi.",
        )
    return _create_camera_record(
        db, payload.group_id, payload.nama_ruangan, payload.sumber, current_user
    )


@router.delete("/cameras/{camera_id}")
def delete_camera(
    camera_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Hapus kamera dari grup."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan.")
    group = db.get(FamilyGroup, cam.group_id)
    if not group or group.admin_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda bukan admin grup kamera ini.",
        )
    db.delete(cam)
    db.commit()
    return {"message": "Kamera berhasil dihapus."}


@router.post("/cameras/{camera_id}/source", response_model=CameraResponse)
async def switch_camera_source(
    camera_id: int,
    payload: CameraSourceSwitchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CameraResponse:
    """Ganti sumber video CCTV dummy secara live (mis. demo_duduk.mp4 <-> demo_jatuh.mp4)."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan.")

    ensure_group_access(db, cam.group_id, current_user)
    new_source = payload.sumber.strip()
    cam.sumber = new_source
    db.commit()
    db.refresh(cam)

    await ws_manager.send_to_worker(
        cam.id,
        {
            "type": "source.switch",
            "source": new_source,
        },
    )
    await ws_manager.broadcast_to_group(
        cam.group_id,
        {
            "type": "camera.source",
            "camera_id": cam.id,
            "sumber": new_source,
        },
    )

    return CameraResponse(
        id=cam.id,
        group_id=cam.group_id,
        nama_ruangan=cam.nama_ruangan,
        sumber=cam.sumber,
        status=cam.status,
    )


@router.get("/cameras/{camera_id}/stream")
async def stream_camera(
    camera_id: int,
    current_user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Proxy MJPEG dari cv-worker agar mobile & web tidak memanggil worker langsung."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan.")

    ensure_group_access(db, cam.group_id, current_user)

    if cam.sumber.startswith("http://") or cam.sumber.startswith("https://"):
        upstream_url = cam.sumber
    else:
        upstream_url = f"{CV_WORKER_URL}/stream"

    async def mjpeg_generator():
        timeout = httpx.Timeout(connect=5.0, read=None, write=5.0, pool=5.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("GET", upstream_url) as response:
                    if response.status_code != 200:
                        return
                    async for chunk in response.aiter_bytes(chunk_size=4096):
                        if chunk:
                            yield chunk
        except Exception:
            return

    return StreamingResponse(
        mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.post("/cameras/{camera_id}/voice", status_code=status.HTTP_201_CREATED)
async def send_voice_message(
    camera_id: int,
    request: Request,
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Terima rekaman suara (AAC/M4A/WAV) dari keluarga dan teruskan ke speaker CCTV."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan.")

    ensure_group_access(db, cam.group_id, current_user)

    suffix = Path(audio.filename or "pesan.m4a").suffix.lower()
    if suffix not in {".m4a", ".aac", ".wav", ".mp3", ".ogg", ".webm"}:
        suffix = ".m4a"

    filename = f"voice_{camera_id}_{int(time.time())}_{uuid.uuid4().hex[:6]}{suffix}"
    dest_path = VOICES_DIR / filename
    content = await audio.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File rekaman suara kosong.",
        )
    dest_path.write_bytes(content)

    rel_path = f"uploads/voices/{filename}"
    vm = VoiceMessage(
        camera_id=cam.id,
        user_id=current_user.id,
        file_path=rel_path,
    )
    db.add(vm)
    db.commit()
    db.refresh(vm)

    base_url = build_base_url(request)
    audio_url = f"{base_url}/{rel_path}"
    delivered = await ws_manager.send_to_worker(
        cam.id,
        {
            "type": "voice.play",
            "voice_id": vm.id,
            "sender_name": current_user.nama,
            "url": audio_url,
        },
    )

    return {
        "id": vm.id,
        "delivered_to_speaker": delivered,
        "url": audio_url,
        "message": (
            "Pesan suara dikirim ke speaker CCTV."
            if delivered
            else "Pesan suara tersimpan, namun speaker CCTV sedang offline."
        ),
    }

