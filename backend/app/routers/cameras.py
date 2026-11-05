"""Router kamera: pendaftaran, isolasi live stream per grup, & interkom suara 2 arah (HP <-> POV CCTV)."""

import asyncio
import time
import uuid
from pathlib import Path
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import CV_WORKER_URL, VOICES_DIR, to_wib_iso
from app.database import get_db
from app.deps import (
    build_base_url,
    ensure_group_access,
    get_current_user,
    get_current_user_or_query_token,
)
from app.models import Camera, FamilyGroup, User, VoiceMessage, utc_now
from app.schemas import (
    CameraCreateRequest,
    CameraResponse,
    CameraSourceSwitchRequest,
    CameraUpdateRequest,
)
from app.services.fcm_service import collect_group_fcm_tokens, send_cctv_voice_fcm
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["Kamera & Interaksi 2 Arah"])

ALLOWED_AUDIO_EXTS = {".m4a", ".aac", ".wav", ".mp3", ".ogg", ".webm", ".mp4"}


def _serialize_camera(cam: Camera, group: FamilyGroup | None = None) -> CameraResponse:
    grp_name = group.nama_grup if group else (cam.group.nama_grup if cam.group else "Rumah Keluarga")
    loc = cam.lokasi_cctv.strip() if getattr(cam, "lokasi_cctv", None) and cam.lokasi_cctv.strip() else f"{cam.nama_ruangan}, {grp_name}"
    return CameraResponse(
        id=cam.id,
        group_id=cam.group_id,
        nama_ruangan=cam.nama_ruangan,
        lokasi_cctv=loc,
        sumber=cam.sumber,
        status=cam.status,
    )


def _create_camera_record(
    db: Session,
    group_id: int,
    nama_ruangan: str,
    lokasi_cctv: str,
    sumber: str,
    current_user: User,
) -> CameraResponse:
    group = ensure_group_access(db, group_id, current_user)
    room_clean = nama_ruangan.strip()
    loc_clean = lokasi_cctv.strip() if lokasi_cctv and lokasi_cctv.strip() else f"{room_clean}, {group.nama_grup}"

    cam = Camera(
        group_id=group_id,
        nama_ruangan=room_clean,
        lokasi_cctv=loc_clean,
        sumber=sumber.strip() or "idle",
        status="offline",
    )
    db.add(cam)
    db.commit()
    db.refresh(cam)

    if cam.id in ws_manager.worker_connections:
        cam.status = "online"
        db.commit()

    return _serialize_camera(cam, group)


@router.post(
    "/groups/{group_id}/cameras",
    response_model=CameraResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_camera_to_group(
    group_id: int,
    payload: CameraCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CameraResponse:
    """Keluarga mendaftarkan kamera baru beserta lokasi CCTV ke grup keluarganya sendiri."""
    return _create_camera_record(
        db,
        group_id,
        payload.nama_ruangan,
        payload.lokasi_cctv,
        payload.sumber,
        current_user,
    )


@router.post(
    "/cameras",
    response_model=CameraResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_camera_direct(
    payload: CameraCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CameraResponse:
    """Endpoint alternatif pendaftaran kamera dengan group_id di body."""
    if not payload.group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field group_id wajib diisi.",
        )
    return _create_camera_record(
        db,
        payload.group_id,
        payload.nama_ruangan,
        payload.lokasi_cctv,
        payload.sumber,
        current_user,
    )


@router.patch("/cameras/{camera_id}", response_model=CameraResponse)
def update_camera_info(
    camera_id: int,
    payload: CameraUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CameraResponse:
    """Perbarui nama ruangan atau lokasi alamat/Maps CCTV milik keluarga."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan."
        )
    group = ensure_group_access(db, cam.group_id, current_user)
    if payload.nama_ruangan is not None and payload.nama_ruangan.strip():
        cam.nama_ruangan = payload.nama_ruangan.strip()
    if payload.lokasi_cctv is not None:
        cam.lokasi_cctv = payload.lokasi_cctv.strip()
    if payload.sumber is not None and payload.sumber.strip():
        cam.sumber = payload.sumber.strip()
    db.commit()
    db.refresh(cam)
    return _serialize_camera(cam, group)


@router.delete("/cameras/{camera_id}")
def delete_camera(
    camera_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Hapus kamera dari grup keluarga."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan."
        )
    ensure_group_access(db, cam.group_id, current_user)
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
    """Ganti sumber video kamera milik grup sendiri."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan."
        )

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

    return _serialize_camera(cam)


@router.get("/cameras/{camera_id}/stream")
async def stream_camera(
    camera_id: int,
    current_user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Proxy MJPEG khusus grup pemilik kamera (tidak membocorkan stream kamera grup lain)."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan."
        )

    ensure_group_access(db, cam.group_id, current_user)

    if cam.sumber.startswith("http://") or cam.sumber.startswith("https://"):
        upstream_url = cam.sumber
    else:
        from app.routers.simulations import _ensure_cv_worker_running

        ws_manager.active_worker_camera_id = camera_id
        _ensure_cv_worker_running(camera_id)
        upstream_url = f"{CV_WORKER_URL}/stream"

    async def mjpeg_generator():
        timeout = httpx.Timeout(connect=5.0, read=None, write=5.0, pool=5.0)
        for _attempt in range(8):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("GET", upstream_url) as response:
                        if response.status_code == 200:
                            async for chunk in response.aiter_bytes(chunk_size=4096):
                                if chunk:
                                    yield chunk
                            return
            except Exception:
                await asyncio.sleep(0.5)

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
    """Terima rekaman suara dari HP Keluarga -> putar di speaker POV CCTV Laptop."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan."
        )

    ensure_group_access(db, cam.group_id, current_user)

    suffix = Path(audio.filename or "pesan.m4a").suffix.lower()
    if suffix not in ALLOWED_AUDIO_EXTS:
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
        played_at=utc_now(),
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

    voice_entry = {
        "id": vm.id,
        "direction": "family_to_cctv",
        "camera_id": cam.id,
        "camera_name": cam.nama_ruangan,
        "sender_name": current_user.nama,
        "file_path": rel_path,
        "url": audio_url,
        "created_at": to_wib_iso(vm.played_at or utc_now()),
    }
    ws_manager.record_camera_voice(cam.id, voice_entry)
    await ws_manager.broadcast_to_group(
        cam.group_id,
        {"type": "family.voice", **voice_entry},
    )

    return {
        "id": vm.id,
        "delivered_to_speaker": delivered,
        "url": audio_url,
        "message": (
            "Pesan suara dikirim ke speaker POV CCTV."
            if delivered
            else "Pesan suara terkirim ke POV CCTV."
        ),
    }


@router.post("/cameras/{camera_id}/cctv-voice", status_code=status.HTTP_201_CREATED)
async def send_cctv_pov_voice_to_family(
    camera_id: int,
    request: Request,
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Terima rekaman suara dari Mikrofon POV CCTV (Laptop) -> kirim real-time ke HP Keluarga pemilik kamera."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan."
        )

    if current_user.role != "admin":
        ensure_group_access(db, cam.group_id, current_user)

    group = db.get(FamilyGroup, cam.group_id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Grup keluarga tidak ditemukan."
        )

    suffix = Path(audio.filename or "cctv.webm").suffix.lower()
    if suffix not in ALLOWED_AUDIO_EXTS:
        suffix = ".webm"

    filename = f"cctv_{camera_id}_{int(time.time())}_{uuid.uuid4().hex[:6]}{suffix}"
    dest_path = VOICES_DIR / filename
    content = await audio.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File rekaman suara POV CCTV kosong.",
        )
    dest_path.write_bytes(content)

    rel_path = f"uploads/voices/{filename}"
    vm = VoiceMessage(
        camera_id=cam.id,
        user_id=current_user.id,
        file_path=rel_path,
        played_at=utc_now(),
    )
    db.add(vm)
    db.commit()
    db.refresh(vm)

    base_url = build_base_url(request)
    audio_url = f"{base_url}/{rel_path}"

    voice_entry = {
        "id": vm.id,
        "direction": "cctv_to_family",
        "camera_id": cam.id,
        "camera_name": cam.nama_ruangan,
        "nama_lansia": group.nama_lansia,
        "sender_name": f"POV CCTV ({cam.nama_ruangan})",
        "file_path": rel_path,
        "url": audio_url,
        "created_at": to_wib_iso(vm.played_at or utc_now()),
    }
    ws_manager.record_camera_voice(cam.id, voice_entry)

    # Broadcast HANYA ke grup keluarga pemilik kamera ini
    await ws_manager.broadcast_to_group(
        group.id,
        {"type": "cctv.voice", **voice_entry},
    )

    tokens = collect_group_fcm_tokens(db, group)
    if tokens:
        asyncio.create_task(
            asyncio.to_thread(
                send_cctv_voice_fcm,
                tokens,
                cam.id,
                group.id,
                group.nama_lansia,
                cam.nama_ruangan,
                audio_url,
            )
        )

    return {
        "id": vm.id,
        "url": audio_url,
        "group_id": group.id,
        "camera_name": cam.nama_ruangan,
        "message": f"Suara dari POV CCTV '{cam.nama_ruangan}' terkirim ke HP keluarga {group.nama_grup}!",
    }


@router.get("/cameras/{camera_id}/voices")
def get_recent_camera_voices(
    camera_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Daftar riwayat pesan suara 2 arah terbaru pada kamera tertentu."""
    cam = db.get(Camera, camera_id)
    if not cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan."
        )
    if current_user.role != "admin":
        ensure_group_access(db, cam.group_id, current_user)

    base_url = build_base_url(request)
    rows = (
        db.query(VoiceMessage)
        .filter(VoiceMessage.camera_id == camera_id)
        .order_by(VoiceMessage.id.desc())
        .limit(10)
        .all()
    )
    group = db.get(FamilyGroup, cam.group_id)
    items = []
    for r in rows:
        rel = r.file_path.lstrip("/")
        is_cctv = Path(rel).name.startswith("cctv_")
        sender_user = db.get(User, r.user_id)
        items.append(
            {
                "id": r.id,
                "direction": "cctv_to_family" if is_cctv else "family_to_cctv",
                "camera_id": camera_id,
                "camera_name": cam.nama_ruangan,
                "nama_lansia": group.nama_lansia if group else "Lansia",
                "sender_name": (
                    f"POV CCTV ({cam.nama_ruangan})"
                    if is_cctv
                    else (sender_user.nama if sender_user else "Keluarga")
                ),
                "file_path": rel,
                "url": f"{base_url}/{rel}",
                "created_at": to_wib_iso(r.played_at or utc_now()),
            }
        )
    return {"camera_id": camera_id, "items": items}
