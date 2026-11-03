"""Model tabel database MySQL untuk SIGAP."""

from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def utc_now() -> datetime:
    """Kembalikan waktu saat ini dalam UTC."""
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nama: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="keluarga", nullable=False)
    fcm_token: Mapped[str | None] = mapped_column(String(512), nullable=True)


class FamilyGroup(Base):
    __tablename__ = "family_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nama_grup: Mapped[str] = mapped_column(String(120), nullable=False)
    nama_lansia: Mapped[str] = mapped_column(String(120), nullable=False)
    kode_undangan: Mapped[str] = mapped_column(String(6), unique=True, index=True, nullable=False)
    kontak_darurat: Mapped[str] = mapped_column(String(30), nullable=False)
    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    admin: Mapped["User"] = relationship("User")
    members: Mapped[list["GroupMember"]] = relationship(
        "GroupMember", back_populates="group", cascade="all, delete-orphan"
    )
    cameras: Mapped[list["Camera"]] = relationship(
        "Camera", back_populates="group", cascade="all, delete-orphan"
    )


class GroupMember(Base):
    __tablename__ = "group_members"

    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("family_groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    group: Mapped["FamilyGroup"] = relationship("FamilyGroup", back_populates="members")
    user: Mapped["User"] = relationship("User")


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("family_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nama_ruangan: Mapped[str] = mapped_column(String(100), nullable=False)
    sumber: Mapped[str] = mapped_column(String(255), default="0", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="offline", nullable=False)

    group: Mapped["FamilyGroup"] = relationship("FamilyGroup", back_populates="cameras")
    events: Mapped[list["Event"]] = relationship(
        "Event", back_populates="camera", cascade="all, delete-orphan"
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    camera_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False, index=True
    )
    waktu: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False, index=True)
    snapshot_path: Mapped[str] = mapped_column(String(255), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="baru", nullable=False, index=True)
    handled_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    camera: Mapped["Camera"] = relationship("Camera", back_populates="events")
    handler: Mapped["User | None"] = relationship("User")


class VoiceMessage(Base):
    __tablename__ = "voice_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    camera_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    played_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

