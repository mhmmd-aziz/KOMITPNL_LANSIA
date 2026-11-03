"""Router event jatuh: penerimaan dari cv-worker, riwayat, detail, dan tindak lanjut."""

import asyncio
import time
import uuid
from datetime import datetime, time as dt_time, timezone
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.config import SNAPSHOTS_DIR, WIB_TZ, to_wib_iso
from app.database import get_db
from app.deps import (
    build_base_url,
    ensure_group_access,
    get_current_user,
    verify_worker_key,
)
from app.models import Camera, Event, FamilyGroup, GroupMember, User
from app.schemas import EventResponse, EventUpdateRequest
from app.services.fcm_service import (
    collect_group_fcm_tokens,
    send_fall_fcm,
    start_fall_reminder_task,
)
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/events", tags=["Event Jatuh"])


def serialize_event(event: Event, base_url: str) -> EventResponse:
    """Susun respons Event lengkap untuk mobile dan web admin."""
    camera = event.camera
    group = camera.group
    rel_path = event.snapshot_path.lstrip("/")
    return EventResponse(
        id=event.id,
        camera_id=camera.id,
        camera_name=camera.nama_ruangan,
        group_id=group.id,
        nama_grup=group.nama_grup,
        nama_lansia=group.nama_lansia,
        kontak_darurat=group.kontak_darurat,
        waktu=to_wib_iso(event.waktu) or "",
        snapshot_path=rel_path,
        snapshot_url=f"{base_url}/{rel_path}",
        confidence=round(float(event.confidence), 3),
        status=event.status,
        handled_by=event.handled_by,
        handled_by_name=event.handler.nama if event.handler else None,
    )


@router.post(
    "",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_worker_key)],
)
async def create_event(
    request: Request,
    camera_id: int = Form(...),
    confidence: float = Form(...),
    snapshot: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> EventResponse:
    """Dipanggil cv-worker saat jatuh terkonfirmasi: simpan snapshot, kirim FCM & WebSocket."""
    camera = db.get(Camera, camera_id)
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Kamera dengan id={camera_id} belum terdaftar di database.",
        )

    img_bytes = await snapshot.read()
    if not img_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File snapshot kosong.",
        )

    filename = f"fall_{camera_id}_{int(time.time())}_{uuid.uuid4().hex[:6]}.jpg"
    dest_path = SNAPSHOTS_DIR / filename
    dest_path.write_bytes(img_bytes)

    camera.status = "online"
    event = Event(
        camera_id=camera.id,
        confidence=confidence,
        snapshot_path=f"uploads/snapshots/{filename}",
        status="baru",
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    base_url = build_base_url(request)
    event_data = serialize_event(event, base_url)
    group = camera.group

    # 1. Kirim pembaruan real-time lewat WebSocket ke web admin & mobile yang terbuka
    await ws_manager.broadcast_to_group(
        group.id,
        {
            "type": "event.created",
            "event": event_data.model_dump(),
        },
    )

    # 2. Kirim push notification FCM prioritas tinggi ke seluruh anggota grup
    tokens = collect_group_fcm_tokens(db, group)
    await asyncio.to_thread(
        send_fall_fcm,
        tokens,
        event.id,
        group.id,
        group.nama_lansia,
        camera.nama_ruangan,
        False,
    )

    # 3. Jadwalkan notifikasi ulang tiap 2 menit (maks 3x) bila belum ditangani (FR-08)
    start_fall_reminder_task(event.id)

    return event_data


@router.get("", response_model=list[EventResponse])
def list_events(
    request: Request,
    group_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    date_from: str | None = Query(default=None, description="Format YYYY-MM-DD (WIB)"),
    date_to: str | None = Query(default=None, description="Format YYYY-MM-DD (WIB)"),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EventResponse]:
    """Ambil daftar riwayat event terbaru dulu, mendukung filter grup, status, dan tanggal."""
    if group_id is not None:
        ensure_group_access(db, group_id, current_user)
        allowed_group_ids = [group_id]
    else:
        member_ids = [
            gm.group_id
            for gm in db.query(GroupMember).filter(GroupMember.user_id == current_user.id).all()
        ]
        admin_ids = [
            fg.id
            for fg in db.query(FamilyGroup).filter(FamilyGroup.admin_id == current_user.id).all()
        ]
        allowed_group_ids = list(set(member_ids + admin_ids))

    if not allowed_group_ids:
        return []

    query = (
        db.query(Event)
        .join(Camera, Event.camera_id == Camera.id)
        .filter(Camera.group_id.in_(allowed_group_ids))
    )

    if status_filter:
        query = query.filter(Event.status == status_filter)

    if date_from:
        try:
            d_start = datetime.strptime(date_from, "%Y-%m-%d").date()
            utc_start = datetime.combine(d_start, dt_time.min, tzinfo=WIB_TZ).astimezone(
                timezone.utc
            )
            query = query.filter(Event.waktu >= utc_start.replace(tzinfo=None))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Format date_from harus YYYY-MM-DD.",
            )

    if date_to:
        try:
            d_end = datetime.strptime(date_to, "%Y-%m-%d").date()
            utc_end = datetime.combine(d_end, dt_time.max, tzinfo=WIB_TZ).astimezone(
                timezone.utc
            )
            query = query.filter(Event.waktu <= utc_end.replace(tzinfo=None))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Format date_to harus YYYY-MM-DD.",
            )

    events = query.order_by(Event.waktu.desc(), Event.id.desc()).limit(limit).all()
    base_url = build_base_url(request)
    return [serialize_event(ev, base_url) for ev in events]


@router.get("/{event_id}", response_model=EventResponse)
def get_event_detail(
    event_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventResponse:
    """Ambil detail satu kejadian jatuh (dipakai saat pengguna mengetuk notifikasi FCM)."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data kejadian tidak ditemukan.",
        )

    ensure_group_access(db, event.camera.group_id, current_user)
    return serialize_event(event, build_base_url(request))


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event_status(
    event_id: int,
    payload: EventUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventResponse:
    """Tandai kejadian sebagai 'ditangani' atau 'alarm_palsu' dan siarkan ke grup."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data kejadian tidak ditemukan.",
        )

    group_id = event.camera.group_id
    ensure_group_access(db, group_id, current_user)

    event.status = payload.status
    event.handled_by = current_user.id
    db.commit()
    db.refresh(event)

    event_data = serialize_event(event, build_base_url(request))
    await ws_manager.broadcast_to_group(
        group_id,
        {
            "type": "event.updated",
            "event": event_data.model_dump(),
        },
    )
    return event_data

