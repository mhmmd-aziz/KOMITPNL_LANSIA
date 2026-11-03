"""Router autentikasi pengguna dan penyimpanan token FCM perangkat."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import create_access_token, get_current_user, hash_password, verify_password
from app.models import User
from app.schemas import (
    AuthResponse,
    FcmTokenRequest,
    LoginRequest,
    RegisterRequest,
    UserSummary,
)

router = APIRouter(tags=["Auth & Perangkat"])


@router.post("/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Daftarkan akun baru (admin atau keluarga) dan langsung kembalikan JWT."""
    email_clean = payload.email.lower().strip()
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email tersebut sudah terdaftar.",
        )

    user = User(
        nama=payload.nama.strip(),
        email=email_clean,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user)
    return AuthResponse(
        access_token=token,
        user=UserSummary(id=user.id, nama=user.nama, email=user.email, role=user.role),
    )


@router.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Masuk dengan email + password dan kembalikan token JWT."""
    email_clean = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau kata sandi salah.",
        )

    token = create_access_token(user)
    return AuthResponse(
        access_token=token,
        user=UserSummary(id=user.id, nama=user.nama, email=user.email, role=user.role),
    )


@router.get("/auth/me", response_model=UserSummary)
def get_me(current_user: User = Depends(get_current_user)) -> UserSummary:
    """Kembalikan profil pengguna yang sedang masuk."""
    return UserSummary(
        id=current_user.id,
        nama=current_user.nama,
        email=current_user.email,
        role=current_user.role,
    )


@router.post("/devices/fcm-token")
def update_fcm_token(
    payload: FcmTokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Simpan atau perbarui token FCM HP pengguna saat login atau refresh token."""
    current_user.fcm_token = payload.fcm_token.strip()
    db.commit()
    return {"message": "Token FCM berhasil disimpan."}

