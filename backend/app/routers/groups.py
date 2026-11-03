"""Router manajemen grup keluarga, kode kunci akses keluarga, dan anggota."""

import re
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import to_wib_iso
from app.database import get_db
from app.deps import ensure_group_access, get_current_user
from app.models import Camera, FamilyGroup, GroupMember, User
from app.schemas import (
    CameraResponse,
    GroupCreateRequest,
    GroupDetailResponse,
    GroupJoinRequest,
    GroupUpdateRequest,
    GroupVerifyCodeRequest,
    MemberResponse,
)
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/groups", tags=["Grup Keluarga"])

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CUSTOM_CODE_REGEX = re.compile(r"^[A-Z0-9]{4,12}$")


def generate_invite_code(db: Session) -> str:
    """Buat kode keluarga 6 karakter unik tanpa karakter ambigu (0/O/1/I)."""
    for _ in range(20):
        code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(6))
        exists = db.query(FamilyGroup).filter(FamilyGroup.kode_undangan == code).first()
        if not exists:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Gagal membuat kode keluarga unik.",
    )


def normalize_and_validate_code(
    db: Session,
    raw_code: str,
    exclude_group_id: int | None = None,
) -> str:
    """Validasi kode keluarga buatan pengguna (4-12 karakter huruf/angka, unik)."""
    cleaned = raw_code.strip().upper().replace(" ", "")
    if not CUSTOM_CODE_REGEX.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kode keluarga harus 4-12 karakter huruf/angka tanpa spasi.",
        )
    query = db.query(FamilyGroup).filter(FamilyGroup.kode_undangan == cleaned)
    if exclude_group_id is not None:
        query = query.filter(FamilyGroup.id != exclude_group_id)
    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Kode keluarga '{cleaned}' sudah digunakan grup lain. Buat kode unik lain.",
        )
    return cleaned


def serialize_group(group: FamilyGroup) -> GroupDetailResponse:
    """Ubah objek FamilyGroup beserta anggota dan kameranya ke skema respons."""
    members_out: list[MemberResponse] = []
    for gm in group.members:
        if gm.user:
            members_out.append(
                MemberResponse(
                    user_id=gm.user.id,
                    nama=gm.user.nama,
                    email=gm.user.email,
                    role=gm.user.role,
                    joined_at=to_wib_iso(gm.joined_at),
                )
            )

    cameras_out = [
        CameraResponse(
            id=cam.id,
            group_id=cam.group_id,
            nama_ruangan=cam.nama_ruangan,
            lokasi_cctv=cam.lokasi_cctv or f"{cam.nama_ruangan}, {group.nama_grup}",
            sumber=cam.sumber,
            status=cam.status,
        )
        for cam in group.cameras
    ]

    return GroupDetailResponse(
        id=group.id,
        nama_grup=group.nama_grup,
        nama_lansia=group.nama_lansia,
        kode_undangan=group.kode_undangan,
        kontak_darurat=group.kontak_darurat,
        admin_id=group.admin_id,
        members=members_out,
        cameras=cameras_out,
    )


@router.get("", response_model=list[GroupDetailResponse])
def list_my_groups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[GroupDetailResponse]:
    """Ambil semua grup yang diikuti atau dimiliki pengguna keluarga."""
    member_group_ids = [
        row.group_id
        for row in db.query(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    ]
    groups = (
        db.query(FamilyGroup)
        .filter(
            (FamilyGroup.admin_id == current_user.id)
            | (FamilyGroup.id.in_(member_group_ids))
        )
        .order_by(FamilyGroup.id.desc())
        .all()
    )
    return [serialize_group(g) for g in groups]


@router.post("", response_model=GroupDetailResponse, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupDetailResponse:
    """Keluarga membuat grup rumah sendiri beserta Kode Keluarga buatan sendiri."""
    if payload.kode_undangan and payload.kode_undangan.strip():
        code = normalize_and_validate_code(db, payload.kode_undangan)
    else:
        code = generate_invite_code(db)

    group = FamilyGroup(
        nama_grup=payload.nama_grup.strip(),
        nama_lansia=payload.nama_lansia.strip(),
        kode_undangan=code,
        kontak_darurat=payload.kontak_darurat.strip(),
        admin_id=current_user.id,
    )
    db.add(group)
    db.flush()

    db.add(GroupMember(group_id=group.id, user_id=current_user.id))

    if payload.nama_ruangan_awal and payload.nama_ruangan_awal.strip():
        room_str = payload.nama_ruangan_awal.strip()
        loc_str = (
            payload.lokasi_cctv_awal.strip()
            if payload.lokasi_cctv_awal and payload.lokasi_cctv_awal.strip()
            else f"{room_str}, {group.nama_grup}"
        )
        cam = Camera(
            group_id=group.id,
            nama_ruangan=room_str,
            lokasi_cctv=loc_str,
            sumber="idle",
            status="offline",
        )
        db.add(cam)
        db.flush()
        if cam.id in ws_manager.worker_connections:
            cam.status = "online"

    db.commit()
    db.refresh(group)
    return serialize_group(group)


@router.post("/join", response_model=GroupDetailResponse)
def join_group(
    payload: GroupJoinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupDetailResponse:
    """Anggota keluarga masuk ke grup menggunakan Kode Keluarga yang dibuat pemilik grup."""
    code = payload.kode_undangan.upper().strip()
    group = db.query(FamilyGroup).filter(FamilyGroup.kode_undangan == code).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kode keluarga tidak valid atau tidak ditemukan.",
        )

    existing = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id)
        .first()
    )
    if not existing:
        db.add(GroupMember(group_id=group.id, user_id=current_user.id))
        db.commit()
        db.refresh(group)

    return serialize_group(group)


@router.post("/{group_id}/verify-code")
def verify_family_code(
    group_id: int,
    payload: GroupVerifyCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Verifikasi Kode Keluarga untuk membuka kunci akses grup di aplikasi mobile."""
    group = ensure_group_access(db, group_id, current_user)
    if group.kode_undangan.upper() != payload.kode_undangan.strip().upper():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kode keluarga salah. Akses tetap terkunci.",
        )
    return {"valid": True, "message": "Akses keluarga berhasil dibuka."}


@router.get("/{group_id}", response_model=GroupDetailResponse)
def get_group_detail(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupDetailResponse:
    """Ambil detail grup, daftar anggota, kamera, dan kontak darurat."""
    group = ensure_group_access(db, group_id, current_user)
    return serialize_group(group)


@router.patch("/{group_id}", response_model=GroupDetailResponse)
async def update_group(
    group_id: int,
    payload: GroupUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupDetailResponse:
    """Pemilik grup keluarga (atau Admin untuk nomor darurat) memperbarui info grup."""
    group = db.get(FamilyGroup, group_id)
    if not group or (group.admin_id != current_user.id and current_user.role != "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pembuat grup keluarga atau admin yang dapat mengubah pengaturan ini.",
        )

    if payload.nama_grup is not None:
        group.nama_grup = payload.nama_grup.strip()
    if payload.nama_lansia is not None:
        group.nama_lansia = payload.nama_lansia.strip()
    if payload.kontak_darurat is not None:
        group.kontak_darurat = payload.kontak_darurat.strip()
    if payload.kode_undangan is not None and payload.kode_undangan.strip():
        group.kode_undangan = normalize_and_validate_code(
            db, payload.kode_undangan, exclude_group_id=group.id
        )

    db.commit()
    db.refresh(group)

    if payload.kontak_darurat is not None:
        await ws_manager.broadcast_to_group(
            group.id,
            {
                "type": "emergency.contact",
                "group_id": group.id,
                "kontak_darurat": group.kontak_darurat,
            },
        )

    return serialize_group(group)


@router.delete("/{group_id}/members/{user_id}")
def remove_group_member(
    group_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Pemilik grup keluarga mengeluarkan anggota dari grupnya."""
    group = db.get(FamilyGroup, group_id)
    if not group or group.admin_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pembuat grup keluarga yang dapat mengeluarkan anggota.",
        )
    if user_id == group.admin_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pembuat grup keluarga tidak dapat dikeluarkan.",
        )

    membership = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anggota tidak ditemukan dalam grup ini.",
        )

    db.delete(membership)
    db.commit()
    return {"message": "Anggota berhasil dikeluarkan dari grup keluarga."}
