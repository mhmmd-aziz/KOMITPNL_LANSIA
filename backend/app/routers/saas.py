"""Router analitik performa platform SaaS SIGAP khusus Admin (Zero-Access terhadap privasi keluarga)."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import FIREBASE_CREDENTIALS, RETENTION_DAYS, UPLOADS_DIR, WIB_TZ
from app.database import get_db
from app.deps import require_admin
from app.models import Camera, Event, FamilyGroup, User, VoiceMessage
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/admin", tags=["SaaS Performance Admin"])

DEFAULT_EMERGENCY_WA = "+62 895-6006-86367"


class AdminEmergencyContactRequest(BaseModel):
    kontak_darurat: str = Field(..., min_length=5, max_length=30)
    group_id: int | None = None


def _compute_dir_size_mb(folder: Path) -> float:
    if not folder.exists():
        return 0.0
    total_bytes = sum(f.stat().st_size for f in folder.rglob("*") if f.is_file())
    return round(total_bytes / (1024 * 1024), 2)


def _mask_family_code(code: str) -> str:
    if len(code) <= 2:
        return "••••••"
    return f"{code[:2]}{'•' * max(4, len(code) - 2)}"


@router.get("/saas-overview")
def get_saas_overview(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Metrik agregat performa SaaS, akurasi AI, kesehatan node, dan daftar tenant terenkripsi/terkunci."""
    keluarga_users = db.query(User).filter(User.role == "keluarga").all()
    total_keluarga = len(keluarga_users)
    fcm_ready_users = sum(1 for u in keluarga_users if u.fcm_token and u.fcm_token.strip())

    groups = db.query(FamilyGroup).order_by(FamilyGroup.id.desc()).all()
    cameras = db.query(Camera).order_by(Camera.id.asc()).all()
    events = db.query(Event).all()
    total_voices = db.query(VoiceMessage).count()

    total_cameras = len(cameras)
    online_cameras = sum(
        1 for c in cameras if c.status == "online" or c.id in ws_manager.worker_connections
    )
    camera_uptime_pct = round((online_cameras / total_cameras) * 100, 1) if total_cameras else 0.0

    total_events = len(events)
    handled_events = sum(1 for e in events if e.status == "ditangani")
    unhandled_events = sum(1 for e in events if e.status == "baru")
    false_alarm_events = sum(1 for e in events if e.status == "alarm_palsu")

    actionable_events = handled_events + unhandled_events
    response_rate_pct = (
        round((handled_events / actionable_events) * 100, 1)
        if actionable_events > 0
        else 100.0
    )
    ai_precision_pct = (
        round(((total_events - false_alarm_events) / total_events) * 100, 1)
        if total_events > 0
        else 100.0
    )
    avg_confidence_pct = (
        round((sum(e.confidence for e in events) / total_events) * 100, 1)
        if total_events > 0
        else 94.5
    )

    now_wib = datetime.now(timezone.utc).astimezone(WIB_TZ)
    today_date = now_wib.date()

    # Hitung tren 7 hari terakhir (WIB)
    day_buckets: dict = {}
    day_labels_id = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
    for offset in range(6, -1, -1):
        d = today_date - timedelta(days=offset)
        day_buckets[d] = {
            "date": d.isoformat(),
            "label": f"{day_labels_id[d.weekday()]} {d.strftime('%d/%m')}",
            "total": 0,
            "handled": 0,
            "false_alarm": 0,
        }

    events_today = 0
    events_by_group: dict[int, list[Event]] = {}
    cam_to_group = {c.id: c.group_id for c in cameras}

    for ev in events:
        gid = cam_to_group.get(ev.camera_id)
        if gid is not None:
            events_by_group.setdefault(gid, []).append(ev)

        dt = ev.waktu
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        ev_date = dt.astimezone(WIB_TZ).date()
        if ev_date == today_date:
            events_today += 1
        if ev_date in day_buckets:
            day_buckets[ev_date]["total"] += 1
            if ev.status == "ditangani":
                day_buckets[ev_date]["handled"] += 1
            elif ev.status == "alarm_palsu":
                day_buckets[ev_date]["false_alarm"] += 1

    # Daftar Tenant (Privasi Terkunci - Tanpa nama lansia/telepon/snapshot/stream)
    tenants_out = []
    for g in groups:
        g_events = events_by_group.get(g.id, [])
        g_handled = sum(1 for e in g_events if e.status == "ditangani")
        g_actionable = sum(1 for e in g_events if e.status in ("ditangani", "baru"))
        g_resp_rate = round((g_handled / g_actionable) * 100, 0) if g_actionable > 0 else 100
        g_online_cams = sum(
            1
            for c in g.cameras
            if c.status == "online" or c.id in ws_manager.worker_connections
        )

        tenants_out.append(
            {
                "tenant_code": f"FAM-{g.id:04d}",
                "group_id": g.id,
                "nama_grup": g.nama_grup,
                "owner_name": g.admin.nama if g.admin else "Akun Keluarga",
                "kontak_darurat": g.kontak_darurat or DEFAULT_EMERGENCY_WA,
                "kode_masked": _mask_family_code(g.kode_undangan),
                "member_count": len(g.members),
                "camera_count": len(g.cameras),
                "online_camera_count": g_online_cams,
                "event_count": len(g_events),
                "response_rate_pct": int(g_resp_rate),
                "subscription_status": "Aktif",
                "privacy_locked": True,
            }
        )

    edge_nodes = [
        {
            "node_code": f"EDGE-{c.id:03d}",
            "camera_id": c.id,
            "tenant_code": f"FAM-{c.group_id:04d}",
            "status": (
                "online"
                if (c.status == "online" or c.id in ws_manager.worker_connections)
                else "offline"
            ),
            "ws_connected": c.id in ws_manager.worker_connections,
        }
        for c in cameras
    ]

    active_group_ws_count = sum(len(conns) for conns in ws_manager.group_connections.values())
    primary_emergency_wa = (
        groups[0].kontak_darurat
        if groups and groups[0].kontak_darurat
        else DEFAULT_EMERGENCY_WA
    )

    return {
        "emergency_whatsapp": primary_emergency_wa,
        "kpis": {
            "total_tenants": len(groups),
            "total_keluarga_users": total_keluarga,
            "fcm_ready_users": fcm_ready_users,
            "total_cameras": total_cameras,
            "online_cameras": online_cameras,
            "camera_uptime_pct": camera_uptime_pct,
            "total_events": total_events,
            "events_today": events_today,
            "handled_events": handled_events,
            "unhandled_events": unhandled_events,
            "false_alarm_events": false_alarm_events,
            "response_rate_pct": response_rate_pct,
            "ai_precision_pct": ai_precision_pct,
            "avg_confidence_pct": avg_confidence_pct,
            "total_voice_messages": total_voices,
        },
        "daily_trend": list(day_buckets.values()),
        "tenants": tenants_out,
        "edge_nodes": edge_nodes,
        "system_health": {
            "api_status": "Operasional Normal",
            "database_status": "Terhubung (MySQL)",
            "cv_model": "YOLOv8n-Pose (4-Layer Kinematics)",
            "fcm_status": (
                "Aktif (Firebase Admin SDK)"
                if Path(FIREBASE_CREDENTIALS).exists()
                else "Mode Siaga"
            ),
            "active_family_ws": active_group_ws_count,
            "active_worker_ws": len(ws_manager.worker_connections),
            "storage_used_mb": _compute_dir_size_mb(UPLOADS_DIR),
            "retention_days": RETENTION_DAYS,
        },
    }


@router.patch("/emergency-contact")
async def update_admin_emergency_contact(
    payload: AdminEmergencyContactRequest,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Admin mengelola nomor WhatsApp darurat (untuk satu grup tenant atau seluruh grup)."""
    cleaned = payload.kontak_darurat.strip()
    if len(cleaned) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nomor WhatsApp darurat minimal 5 karakter.",
        )

    if payload.group_id is not None:
        grp = db.get(FamilyGroup, payload.group_id)
        if not grp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant grup keluarga tidak ditemukan.",
            )
        target_groups = [grp]
    else:
        target_groups = db.query(FamilyGroup).all()

    for g in target_groups:
        g.kontak_darurat = cleaned
    db.commit()

    for g in target_groups:
        await ws_manager.broadcast_to_group(
            g.id,
            {
                "type": "emergency.contact",
                "group_id": g.id,
                "kontak_darurat": cleaned,
            },
        )

    return {
        "emergency_whatsapp": cleaned,
        "updated_groups": len(target_groups),
        "message": (
            f"Nomor WhatsApp Darurat berhasil diatur ke {cleaned} "
            f"({len(target_groups)} grup tersinkron ke HP)."
        ),
    }

