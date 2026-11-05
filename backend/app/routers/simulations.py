"""Router Lab Simulasi AI: Pemilihan Target CCTV, Kepemilikan Video per Grup, & Area Aman 4-Titik."""

import asyncio
import json
import logging
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import httpx
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import BASE_DIR, CV_WORKER_URL
from app.database import get_db
from app.deps import (
    ensure_group_access,
    get_current_user,
    get_current_user_or_query_token,
)
from app.models import Camera, FamilyGroup, GroupMember, User
from app.services.ws_manager import ws_manager

logger = logging.getLogger("sigap.simulations")
router = APIRouter(prefix="/simulations", tags=["Lab Simulasi AI"])

CV_WORKER_DIR = BASE_DIR.parent / "cv-worker"
SIMULATIONS_UPLOAD_DIR = CV_WORKER_DIR / "simulations"
SAFE_ZONES_JSON_PATH = CV_WORKER_DIR / "safe_zones.json"
VIDEOS_META_JSON_PATH = SIMULATIONS_UPLOAD_DIR / "videos_meta.json"
SIMULATIONS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_VIDEO_EXTS = {".mp4", ".avi", ".mov", ".webm", ".mkv"}
_last_worker_spawn_ts: float = 0.0


class SimulationPrepareRequest(BaseModel):
    camera_id: int = 1
    video_name: str = Field(..., min_length=1, max_length=255)


class SimulationRunRequest(BaseModel):
    camera_id: int = 1
    video_name: str = Field(..., min_length=1, max_length=255)
    zones: list[list[list[float]]] | None = None
    loop: bool = False


class SimulationStopRequest(BaseModel):
    camera_id: int = 1


class SimulationZonesRequest(BaseModel):
    camera_id: int = 1
    video_name: str = Field(default="_default", max_length=255)
    zones: list[list[list[float]]] = []


def _is_worker_mjpeg_port_open(host: str = "127.0.0.1", port: int = 8001) -> bool:
    try:
        with httpx.Client(timeout=0.3) as client:
            r = client.get(f"http://{host}:{port}/telemetry")
            if r.status_code == 200:
                data = r.json()
                return isinstance(data, dict) and data.get("source") not in (None, "IDLE")
            return False
    except Exception:
        return False


def _ensure_cv_worker_running(camera_id: int = 1) -> bool:
    """Nyalakan CV Worker secara otomatis di background tanpa jendela popup jika belum aktif."""
    global _last_worker_spawn_ts

    if os.getenv("WORKER_API_KEY") == "test-worker-key":
        return False
    if _is_worker_mjpeg_port_open():
        return True

    now = time.monotonic()
    if now - _last_worker_spawn_ts < 12.0:
        return False

    main_script = CV_WORKER_DIR / "main.py"
    if not main_script.exists():
        return False

    win_py = CV_WORKER_DIR / ".venv" / "Scripts" / "python.exe"
    nix_py = CV_WORKER_DIR / ".venv" / "bin" / "python"
    if win_py.exists():
        py_bin = str(win_py)
    elif nix_py.exists():
        py_bin = str(nix_py)
    else:
        py_bin = sys.executable

    flags = 0
    if sys.platform == "win32":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(
            subprocess, "CREATE_NEW_PROCESS_GROUP", 0
        )

    try:
        subprocess.Popen(
            [py_bin, "main.py", "--source", "idle", "--camera-id", "1"],
            cwd=str(CV_WORKER_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
        )
        _last_worker_spawn_ts = now
        logger.info("Auto-start CV Worker headless berhasil dijalankan.")
        return True
    except Exception as exc:
        logger.error("Gagal auto-start CV Worker headless: %s", exc)
        return False


def _load_videos_meta() -> dict[str, dict]:
    if not VIDEOS_META_JSON_PATH.exists():
        return {}
    try:
        raw = json.loads(VIDEOS_META_JSON_PATH.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def _save_video_meta(video_name: str, meta: dict) -> None:
    data = _load_videos_meta()
    data[Path(video_name).name] = meta
    VIDEOS_META_JSON_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _load_all_safe_zones() -> dict[str, list[list[list[float]]]]:
    if not SAFE_ZONES_JSON_PATH.exists():
        return {}
    try:
        raw = json.loads(SAFE_ZONES_JSON_PATH.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def _zone_key(camera_id: int, video_name: str) -> str:
    clean_vid = Path(video_name).name if video_name else "_default"
    return f"cam_{camera_id}::{clean_vid}"


def _save_safe_zones_for_video(
    camera_id: int, video_name: str, zones: list[list[list[float]]]
) -> None:
    data = _load_all_safe_zones()
    clean_vid = Path(video_name).name if video_name else "_default"
    cleaned = [
        [[round(float(pt[0]), 4), round(float(pt[1]), 4)] for pt in poly]
        for poly in zones
        if isinstance(poly, list) and len(poly) >= 3
    ]
    data[_zone_key(camera_id, clean_vid)] = cleaned
    if camera_id == 1:
        data[clean_vid] = cleaned
    SAFE_ZONES_JSON_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _get_safe_zones_for_video(camera_id: int, video_name: str) -> list[list[list[float]]]:
    data = _load_all_safe_zones()
    clean_vid = Path(video_name).name if video_name else "_default"
    scoped = data.get(_zone_key(camera_id, clean_vid))
    if scoped is not None:
        return scoped
    if camera_id == 1:
        return data.get(clean_vid, [])
    return []


def _get_user_group_ids(db: Session, user: User) -> set[int]:
    owned = {
        g.id for g in db.query(FamilyGroup).filter(FamilyGroup.admin_id == user.id).all()
    }
    joined = {
        m.group_id
        for m in db.query(GroupMember).filter(GroupMember.user_id == user.id).all()
    }
    return owned | joined


def _ensure_simulation_access(db: Session, camera_id: int, user: User) -> Camera | None:
    """Admin SaaS dapat menguji kamera target di Lab; Keluarga HANYA boleh mengakses kamera grupnya sendiri."""
    cam = db.get(Camera, camera_id)
    if user.role == "admin":
        return cam
    if not cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kamera tidak ditemukan."
        )
    ensure_group_access(db, cam.group_id, user)
    return cam


def _resolve_video_file(video_name: str, db: Session, user: User) -> Path:
    clean_name = Path(video_name).name
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Nama video tidak valid."
        )

    meta = _load_videos_meta().get(clean_name)
    if meta and meta.get("owner_group_id") and user.role != "admin":
        user_gids = _get_user_group_ids(db, user)
        if int(meta["owner_group_id"]) not in user_gids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Video ini milik grup keluarga lain.",
            )

    for folder in (SIMULATIONS_UPLOAD_DIR, CV_WORKER_DIR):
        cand = folder / clean_name
        if cand.is_file() and cand.suffix.lower() in ALLOWED_VIDEO_EXTS:
            return cand
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"File video '{clean_name}' tidak ditemukan.",
    )


def _list_accessible_cameras(db: Session, user: User) -> list[dict]:
    if user.role == "admin":
        cams = db.query(Camera).order_by(Camera.id.asc()).all()
    else:
        gids = _get_user_group_ids(db, user)
        if not gids:
            return []
        cams = (
            db.query(Camera)
            .filter(Camera.group_id.in_(gids))
            .order_by(Camera.id.asc())
            .all()
        )

    out = []
    worker_online = ws_manager.has_any_worker()
    for c in cams:
        grp = db.get(FamilyGroup, c.group_id)
        grp_name = grp.nama_grup if grp else f"Grup #{c.group_id}"
        loc_cctv = (
            c.lokasi_cctv.strip()
            if getattr(c, "lokasi_cctv", None) and c.lokasi_cctv.strip()
            else f"{c.nama_ruangan}, {grp_name}"
        )
        out.append(
            {
                "camera_id": c.id,
                "nama_ruangan": c.nama_ruangan,
                "lokasi_cctv": loc_cctv,
                "group_id": c.group_id,
                "group_name": grp_name,
                "nama_lansia": grp.nama_lansia if grp else "-",
                "kontak_darurat": grp.kontak_darurat if grp else "",
                "sumber": c.sumber,
                "label": (
                    f"{grp.nama_grup} — {c.nama_ruangan} (Cam #{c.id})"
                    if grp
                    else f"{c.nama_ruangan} (Cam #{c.id})"
                ),
                "online": worker_online,
            }
        )
    return out


def _list_available_videos(
    db: Session, user: User, camera_id: int = 1
) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    meta_map = _load_videos_meta()
    target_cam = db.get(Camera, camera_id)
    target_group_id = target_cam.group_id if target_cam else None
    user_group_ids = _get_user_group_ids(db, user) if user.role != "admin" else set()

    for folder, is_uploaded in ((SIMULATIONS_UPLOAD_DIR, True), (CV_WORKER_DIR, False)):
        if not folder.exists():
            continue
        for fp in sorted(folder.iterdir()):
            if not (fp.is_file() and fp.suffix.lower() in ALLOWED_VIDEO_EXTS):
                continue
            if fp.name in seen:
                continue

            vmeta = meta_map.get(fp.name, {})
            owner_gid = vmeta.get("owner_group_id")

            # Isolasi kepemilikan video:
            if user.role != "admin":
                # Keluarga TIDAK BOLEH melihat video upload keluarga lain
                if owner_gid is not None and int(owner_gid) not in user_group_ids:
                    continue
                if target_group_id is not None and owner_gid is not None and int(owner_gid) != target_group_id:
                    continue
            else:
                # Di Admin Lab: jika memilih kamera grup X, sembunyikan video privat milik grup Y
                if (
                    target_group_id is not None
                    and owner_gid is not None
                    and int(owner_gid) != target_group_id
                ):
                    continue

            seen.add(fp.name)
            saved_zones = _get_safe_zones_for_video(camera_id, fp.name)
            is_owned = owner_gid is not None and (
                (target_group_id is not None and int(owner_gid) == target_group_id)
                or (user.role != "admin" and int(owner_gid) in user_group_ids)
            )
            items.append(
                {
                    "name": fp.name,
                    "size_mb": round(fp.stat().st_size / (1024 * 1024), 2),
                    "source_type": (
                        "milik_keluarga"
                        if is_owned
                        else ("upload" if is_uploaded else "bawaan")
                    ),
                    "is_owned": bool(is_owned),
                    "owner_group_id": owner_gid,
                    "camera_id": vmeta.get("camera_id"),
                    "zones_count": len(saved_zones),
                }
            )

    # Prioritaskan video milik kamera/keluarga sendiri di urutan paling atas
    items.sort(key=lambda x: (not x["is_owned"], x["name"].lower()))
    return items


@router.get("/videos")
def get_simulation_videos(
    camera_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Daftar CCTV yang boleh diakses beserta video simulasi sesuai kepemilikan grup."""
    _ensure_cv_worker_running(1)
    cameras = _list_accessible_cameras(db, current_user)

    effective_cam_id = camera_id
    if effective_cam_id is not None:
        _ensure_simulation_access(db, effective_cam_id, current_user)
    elif cameras:
        effective_cam_id = cameras[0]["camera_id"]
    else:
        effective_cam_id = 1

    return {
        "cameras": cameras,
        "nodes": cameras
        if cameras
        else [
            {
                "camera_id": 1,
                "label": "Sandbox Node #1",
                "online": ws_manager.has_any_worker(),
                "has_db_camera": False,
            }
        ],
        "selected_camera_id": effective_cam_id,
        "videos": _list_available_videos(db, current_user, effective_cam_id),
    }


@router.get("/video-file")
def stream_simulation_video_file(
    video_name: str = Query(...),
    camera_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Sajikan file video langsung untuk pratinjau instan Frame ke-1 (terkunci hak akses grup)."""
    if camera_id is not None:
        _ensure_simulation_access(db, camera_id, current_user)
    vid_path = _resolve_video_file(video_name, db, current_user)
    media_map = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
    }
    media_type = media_map.get(vid_path.suffix.lower(), "application/octet-stream")
    return FileResponse(
        path=str(vid_path),
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/zones")
def get_saved_zones(
    video_name: str = Query(default="_default"),
    camera_id: int = Query(default=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ambil poligon Area Aman yang tersimpan khusus untuk pasangan (camera_id, video_name)."""
    _ensure_simulation_access(db, camera_id, current_user)
    return {
        "camera_id": camera_id,
        "video_name": video_name,
        "zones": _get_safe_zones_for_video(camera_id, video_name),
    }


@router.post("/prepare")
async def prepare_simulation_video(
    payload: SimulationPrepareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Muat daftar Area Aman tersimpan & sinkronkan pratinjau ke CV Worker untuk kamera terpilih."""
    _ensure_simulation_access(db, payload.camera_id, current_user)
    _ensure_cv_worker_running(payload.camera_id)
    saved_zones = _get_safe_zones_for_video(payload.camera_id, payload.video_name)

    sent = await ws_manager.send_to_worker(
        payload.camera_id,
        {
            "type": "simulation.prepare",
            "video_name": payload.video_name,
            "zones": saved_zones,
        },
    )
    return {
        "camera_id": payload.camera_id,
        "video_name": payload.video_name,
        "zones": saved_zones,
        "worker_notified": sent,
        "message": (
            f"Pratinjau '{payload.video_name}' siap untuk Kamera #{payload.camera_id}."
        ),
    }


@router.get("/telemetry")
def get_simulation_telemetry(
    camera_id: int = Query(default=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ambil telemetri pose real-time khusus untuk camera_id yang dipilih."""
    _ensure_simulation_access(db, camera_id, current_user)
    if not ws_manager.has_any_worker():
        _ensure_cv_worker_running(camera_id)

    tel = ws_manager.latest_telemetry.get(camera_id)
    if os.getenv("WORKER_API_KEY") != "test-worker-key":
        try:
            with httpx.Client(timeout=0.8) as client:
                r = client.get(f"{CV_WORKER_URL}/telemetry")
                if r.status_code == 200:
                    direct_tel = r.json()
                    if isinstance(direct_tel, dict):
                        tel = direct_tel
                        ws_manager.latest_telemetry[camera_id] = direct_tel
        except Exception:
            pass

    return {
        "online": ws_manager.is_worker_online_for(camera_id),
        "active_camera_id": ws_manager.active_worker_camera_id,
        "telemetry": tel,
    }


@router.get("/stream")
async def stream_simulation_monitor(
    camera_id: int = Query(default=1),
    current_user: User = Depends(get_current_user_or_query_token),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Stream visualisasi pose real-time dari Sandbox CV Worker (terisolasi per kamera)."""
    _ensure_simulation_access(db, camera_id, current_user)
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


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_simulation_video(
    video: UploadFile = File(...),
    camera_id: int | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Upload video POV simulasi: jika dari HP Keluarga otomatis terikat ke kamera & grup miliknya."""
    raw_name = Path(video.filename or "simulasi.mp4").name
    ext = Path(raw_name).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format video harus .mp4, .avi, .mov, .webm, atau .mkv.",
        )

    stem = re.sub(r"[^a-zA-Z0-9_\-]+", "_", Path(raw_name).stem).strip("_") or "simulasi"

    owner_group_id: int | None = None
    target_cam: Camera | None = None

    if current_user.role != "admin":
        if camera_id is not None:
            target_cam = _ensure_simulation_access(db, camera_id, current_user)
        else:
            gids = sorted(_get_user_group_ids(db, current_user))
            if not gids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Buat atau gabung grup keluarga terlebih dahulu sebelum mengunggah video.",
                )
            target_cam = (
                db.query(Camera)
                .filter(Camera.group_id == gids[0])
                .order_by(Camera.id.asc())
                .first()
            )
        if not target_cam:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Belum ada kamera terdaftar pada grup keluarga Anda.",
            )
        owner_group_id = target_cam.group_id
        prefix = f"grp{owner_group_id}_cam{target_cam.id}_"
        safe_name = (
            f"{stem}{ext}"
            if stem.startswith(f"grp{owner_group_id}_")
            else f"{prefix}{stem}{ext}"
        )
    else:
        if camera_id is not None:
            target_cam = db.get(Camera, camera_id)
            if target_cam:
                owner_group_id = target_cam.group_id
        safe_name = f"{stem}{ext}"

    dest = SIMULATIONS_UPLOAD_DIR / safe_name
    content = await video.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File video kosong.",
        )
    dest.write_bytes(content)

    _save_video_meta(
        safe_name,
        {
            "owner_group_id": owner_group_id,
            "camera_id": target_cam.id if target_cam else camera_id,
            "uploaded_by_user_id": current_user.id,
            "uploaded_by_role": current_user.role,
        },
    )

    if target_cam and current_user.role != "admin":
        target_cam.sumber = safe_name
        db.commit()

    _ensure_cv_worker_running(target_cam.id if target_cam else 1)
    eff_cam_id = target_cam.id if target_cam else (camera_id or 1)

    return {
        "uploaded": safe_name,
        "camera_id": eff_cam_id,
        "owner_group_id": owner_group_id,
        "videos": _list_available_videos(db, current_user, eff_cam_id),
        "message": (
            f"Video POV '{safe_name}' berhasil dikaitkan ke kamera '{target_cam.nama_ruangan}' milik keluarga Anda!"
            if target_cam and current_user.role != "admin"
            else f"Video '{safe_name}' berhasil diunggah."
        ),
    }


@router.post("/run")
async def run_simulation_once(
    payload: SimulationRunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Jalankan analisis AI 1x khusus ke target camera_id yang dipilih (tidak bocor ke grup lain)."""
    cam = _ensure_simulation_access(db, payload.camera_id, current_user)
    _resolve_video_file(payload.video_name, db, current_user)

    if payload.zones is not None:
        _save_safe_zones_for_video(payload.camera_id, payload.video_name, payload.zones)
        active_zones = payload.zones
    else:
        active_zones = _get_safe_zones_for_video(payload.camera_id, payload.video_name)

    if not ws_manager.has_any_worker():
        _ensure_cv_worker_running(payload.camera_id)
        for _ in range(40):
            if ws_manager.has_any_worker():
                break
            await asyncio.sleep(0.25)

    sent = await ws_manager.send_to_worker(
        payload.camera_id,
        {
            "type": "simulation.run",
            "video_name": payload.video_name,
            "zones": active_zones,
            "loop": payload.loop,
        },
    )
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CV Worker sedang memuat model YOLOv8, silakan klik Mulai Analisis sekali lagi dalam 2 detik.",
        )

    if cam:
        cam.sumber = payload.video_name
        db.commit()

    room_info = f" pada CCTV '{cam.nama_ruangan}' (Cam #{cam.id})" if cam else ""
    return {
        "message": (
            f"Analisis AI '{payload.video_name}' berjalan{room_info} ({len(active_zones)} Area Aman aktif)."
        ),
        "camera_id": payload.camera_id,
        "video_name": payload.video_name,
        "zones_count": len(active_zones),
    }


@router.post("/stop")
async def stop_simulation(
    payload: SimulationStopRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Hentikan analisis video dan kembali ke frame pratinjau kalibrasi."""
    _ensure_simulation_access(db, payload.camera_id, current_user)
    await ws_manager.send_to_worker(payload.camera_id, {"type": "simulation.stop"})
    return {"message": "Analisis dihentikan. Kembali ke pratinjau Area Aman."}


@router.post("/zones")
async def update_ignore_zones(
    payload: SimulationZonesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Simpan permanen poligon Area Aman (4 titik) khusus kamera & video terkait."""
    _ensure_simulation_access(db, payload.camera_id, current_user)
    _save_safe_zones_for_video(payload.camera_id, payload.video_name, payload.zones)

    await ws_manager.send_to_worker(
        payload.camera_id,
        {
            "type": "simulation.zones",
            "video_name": payload.video_name,
            "zones": payload.zones,
        },
    )
    return {
        "camera_id": payload.camera_id,
        "zones": _get_safe_zones_for_video(payload.camera_id, payload.video_name),
        "videos": _list_available_videos(db, current_user, payload.camera_id),
        "message": f"Area Aman disimpan ({len(payload.zones)} area aktif untuk Kamera #{payload.camera_id}).",
    }
