"""Layanan Firebase Cloud Messaging (FCM) dan pengingat ulang otomatis."""

import asyncio
import logging
from pathlib import Path
from sqlalchemy.orm import Session

from app.config import (
    FIREBASE_CREDENTIALS,
    MAX_REMINDER_COUNT,
    REMINDER_INTERVAL_SECONDS,
)
from app.database import SessionLocal
from app.models import Camera, Event, FamilyGroup, GroupMember, User
from app.services.ws_manager import ws_manager

logger = logging.getLogger("sigap.fcm")

_firebase_ready = False
_firebase_checked = False
_active_reminder_tasks: set[asyncio.Task] = set()


def start_fall_reminder_task(event_id: int) -> None:
    """Mulai background task pengingat dan lacak agar bersih saat server dimatikan."""
    task = asyncio.create_task(schedule_fall_reminders(event_id))
    _active_reminder_tasks.add(task)
    task.add_done_callback(_active_reminder_tasks.discard)


async def cancel_all_reminder_tasks() -> None:
    """Batalkan semua timer pengingat aktif saat server shutdown / reload."""
    tasks = list(_active_reminder_tasks)
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    _active_reminder_tasks.clear()


def init_firebase() -> bool:
    """Inisialisasi Firebase Admin SDK jika file kredensial tersedia."""
    global _firebase_ready, _firebase_checked
    if _firebase_checked:
        return _firebase_ready

    _firebase_checked = True
    cred_path = Path(FIREBASE_CREDENTIALS)
    if not cred_path.exists():
        logger.warning(
            "File FIREBASE_CREDENTIALS (%s) belum ditemukan. "
            "Backend tetap berjalan (mode WebSocket aktif, FCM dilewati sampai file dipasang).",
            cred_path,
        )
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            cred = credentials.Certificate(str(cred_path))
            firebase_admin.initialize_app(cred)
        _firebase_ready = True
        logger.info("Firebase Admin SDK berhasil diinisialisasi.")
    except Exception as exc:
        logger.error("Gagal menginisialisasi Firebase Admin SDK: %s", exc)
        _firebase_ready = False

    return _firebase_ready


def collect_group_fcm_tokens(db: Session, group: FamilyGroup) -> list[str]:
    """Kumpulkan seluruh token FCM unik milik anggota dan admin grup."""
    user_ids = {group.admin_id}
    members = db.query(GroupMember).filter(GroupMember.group_id == group.id).all()
    for m in members:
        user_ids.add(m.user_id)

    users = (
        db.query(User)
        .filter(User.id.in_(user_ids), User.fcm_token.isnot(None))
        .all()
    )
    return list({u.fcm_token.strip() for u in users if u.fcm_token and u.fcm_token.strip()})


def send_fall_fcm(
    tokens: list[str],
    event_id: int,
    group_id: int,
    nama_lansia: str,
    camera_name: str,
    is_reminder: bool = False,
) -> int:
    """Kirim notifikasi FCM prioritas tinggi sesuai kontrak CLAUDE.md."""
    if not tokens:
        logger.info("Tidak ada token FCM terdaftar untuk grup %s.", group_id)
        return 0

    if not init_firebase():
        return 0

    from firebase_admin import messaging

    title = "Peringatan jatuh! (Belum ditangani)" if is_reminder else "Peringatan jatuh!"
    body = f"{nama_lansia} terdeteksi jatuh di {camera_name}"

    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
        data={
            "type": "fall",
            "event_id": str(event_id),
            "group_id": str(group_id),
            "camera_name": camera_name,
        },
        android=messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                channel_id="sigap_fall_alert",
                sound="default",
            ),
        ),
    )

    try:
        response = messaging.send_each_for_multicast(message)
        logger.info(
            "FCM terkirim untuk event #%s: %s berhasil, %s gagal.",
            event_id,
            response.success_count,
            response.failure_count,
        )
        return response.success_count
    except Exception as exc:
        logger.error("Gagal mengirim multicast FCM untuk event #%s: %s", event_id, exc)
        return 0


async def schedule_fall_reminders(event_id: int) -> None:
    """Kirim pengingat ulang tiap 2 menit (maksimal 3 kali) jika event masih berstatus 'baru'."""
    for attempt in range(1, MAX_REMINDER_COUNT + 1):
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)
        db = SessionLocal()
        try:
            event = db.get(Event, event_id)
            if not event or event.status != "baru":
                return

            camera = db.get(Camera, event.camera_id)
            if not camera:
                return
            group = db.get(FamilyGroup, camera.group_id)
            if not group:
                return

            tokens = collect_group_fcm_tokens(db, group)
            logger.info(
                "Mengirim notifikasi ulang ke-%s untuk event #%s yang belum ditangani.",
                attempt,
                event_id,
            )
            await asyncio.to_thread(
                send_fall_fcm,
                tokens,
                event.id,
                group.id,
                group.nama_lansia,
                camera.nama_ruangan,
                True,
            )
            await ws_manager.broadcast_to_group(
                group.id,
                {
                    "type": "event.reminder",
                    "event_id": event.id,
                    "attempt": attempt,
                },
            )
        except Exception as exc:
            logger.error("Error saat menjalankan pengingat event #%s: %s", event_id, exc)
        finally:
            db.close()

