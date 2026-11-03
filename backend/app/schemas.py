"""Skema Pydantic untuk validasi request dan serialisasi response API."""

from typing import Literal
from pydantic import BaseModel, EmailStr, Field


# --- Auth & Perangkat ---

class RegisterRequest(BaseModel):
    nama: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    role: Literal["admin", "keluarga"] = "keluarga"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserSummary(BaseModel):
    id: int
    nama: str
    email: str
    role: str


class AuthResponse(BaseModel):
    access_token: str
    user: UserSummary


class FcmTokenRequest(BaseModel):
    fcm_token: str = Field(..., min_length=5)


# --- Grup Keluarga & Kamera ---

class GroupCreateRequest(BaseModel):
    nama_grup: str = Field(..., min_length=2, max_length=120)
    nama_lansia: str = Field(..., min_length=2, max_length=120)
    kontak_darurat: str = Field(..., min_length=5, max_length=30)
    kode_undangan: str | None = Field(default=None, max_length=16)
    nama_ruangan_awal: str | None = Field(default=None, max_length=100)
    lokasi_cctv_awal: str | None = Field(default=None, max_length=255)


class GroupUpdateRequest(BaseModel):
    nama_grup: str | None = Field(default=None, min_length=2, max_length=120)
    nama_lansia: str | None = Field(default=None, min_length=2, max_length=120)
    kontak_darurat: str | None = Field(default=None, min_length=5, max_length=30)
    kode_undangan: str | None = Field(default=None, max_length=16)


class GroupJoinRequest(BaseModel):
    kode_undangan: str = Field(..., min_length=4, max_length=16)


class GroupVerifyCodeRequest(BaseModel):
    kode_undangan: str = Field(..., min_length=4, max_length=16)


class CameraCreateRequest(BaseModel):
    group_id: int | None = None
    nama_ruangan: str = Field(..., min_length=2, max_length=100)
    lokasi_cctv: str = Field(default="", max_length=255)
    sumber: str = Field(default="demo_duduk.mp4", max_length=255)


class CameraUpdateRequest(BaseModel):
    nama_ruangan: str | None = Field(default=None, min_length=2, max_length=100)
    lokasi_cctv: str | None = Field(default=None, max_length=255)
    sumber: str | None = Field(default=None, max_length=255)


class CameraSourceSwitchRequest(BaseModel):
    sumber: str = Field(..., min_length=1, max_length=255)


class CameraResponse(BaseModel):
    id: int
    group_id: int
    nama_ruangan: str
    lokasi_cctv: str = ""
    sumber: str
    status: str


class MemberResponse(BaseModel):
    user_id: int
    nama: str
    email: str
    role: str
    joined_at: str | None


class GroupDetailResponse(BaseModel):
    id: int
    nama_grup: str
    nama_lansia: str
    kode_undangan: str
    kontak_darurat: str
    admin_id: int
    members: list[MemberResponse] = []
    cameras: list[CameraResponse] = []


# --- Event Jatuh ---

class EventUpdateRequest(BaseModel):
    status: Literal["ditangani", "alarm_palsu"]


class EventResponse(BaseModel):
    id: int
    camera_id: int
    camera_name: str
    lokasi_cctv: str = ""
    group_id: int
    nama_grup: str
    nama_lansia: str
    kontak_darurat: str
    waktu: str
    snapshot_path: str
    snapshot_url: str
    confidence: float
    status: str
    handled_by: int | None = None
    handled_by_name: str | None = None

