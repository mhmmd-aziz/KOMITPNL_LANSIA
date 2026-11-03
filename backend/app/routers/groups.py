"""Router manajemen grup keluarga dan anggota."""

import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import to_wib_iso
from app.database import get_db
from app.deps import ensure_group_access, get_current_user, require_admin
from app.models import FamilyGroup, GroupMember, User
from app.schemas import (
    CameraResponse,
    GroupCreateRequest,
    GroupDetailResponse,
    GroupJoinRequest,
    GroupUpdateRequest,
    MemberResponse,
)

router = APIRouter(prefix="/groups", tags=["Grup Keluarga"])

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_invite_code(db: Session) -> str:
    """Buat kode undangan 6 karakter unik tanpa karakter ambigu (0/O/1/I)."""
    for _ in range(20):
        code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(6))
        exists = db.query(FamilyGroup).filter(FamilyGroup.kode_undangan == code).first()
        if not exists:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Gagal membuat kode undangan unik.",
    )


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
    """Ambil semua grup yang diikuti pengguna atau dikelola sebagai admin."""
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
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> GroupDetailResponse:
    """Admin membuat grup keluarga baru beserta kode undangan 6 karakter."""
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

    # Masukkan admin sebagai anggota agar otomatis punya akses penuh ke event & stream
    db.add(GroupMember(group_id=group.id, user_id=current_user.id))
    db.commit()
    db.refresh(group)
    return serialize_group(group)


@router.post("/join", response_model=GroupDetailResponse)
def join_group(
    payload: GroupJoinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupDetailResponse:
    """Keluarga bergabung ke grup menggunakan kode undangan 6 karakter."""
    code = payload.kode_undangan.upper().strip()
    group = db.query(FamilyGroup).filter(FamilyGroup.kode_undangan == code).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kode undangan tidak ditemukan. Periksa kembali 6 karakter kode grup.",
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
def update_group(
    group_id: int,
    payload: GroupUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> GroupDetailResponse:
    """Perbarui nama grup, nama lansia, atau nomor kontak darurat."""
    group = db.get(FamilyGroup, group_id)
    if not group or group.admin_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grup tidak ditemukan atau Anda bukan admin grup ini.",
        )

    if payload.nama_grup is not None:
        group.nama_grup = payload.nama_grup.strip()
    if payload.nama_lansia is not None:
        group.nama_lansia = payload.nama_lansia.strip()
    if payload.kontak_darurat is not None:
        group.kontak_darurat = payload.kontak_darurat.strip()

    db.commit()
    db.refresh(group)
    return serialize_group(group)


@router.delete("/{group_id}/members/{user_id}")
def remove_group_member(
    group_id: int,
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Admin mengeluarkan anggota dari grup keluarga (FR-03)."""
    group = db.get(FamilyGroup, group_id)
    if not group or group.admin_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grup tidak ditemukan atau Anda bukan admin grup ini.",
        )
    if user_id == group.admin_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin pembuat grup tidak dapat dikeluarkan.",
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
    return {"message": "Anggota berhasil dikeluarkan dari grup."}

