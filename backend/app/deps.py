"""Utilitas autentikasi JWT, hashing password bcrypt, dan penjaga otorisasi."""

from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import JWT_ALGORITHM, JWT_EXPIRE_HOURS, JWT_SECRET, WORKER_API_KEY
from app.database import get_db
from app.models import FamilyGroup, GroupMember, User

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash password teks biasa menggunakan bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Cocokkan password dengan hash bcrypt yang tersimpan."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user: User) -> str:
    """Buat JWT token berisi id pengguna dan peran."""
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str, db: Session) -> User:
    """Validasi JWT dan ambil objek User dari database."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub", "0"))
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token akses tidak valid atau sudah kedaluwarsa.",
        )

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Akun pengguna tidak ditemukan.",
        )
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Ambil pengguna aktif dari header Authorization: Bearer <jwt>."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autentikasi diperlukan. Silakan masuk terlebih dahulu.",
        )
    return decode_token(credentials.credentials, db)


def get_current_user_or_query_token(
    token: str | None = Query(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Mendukung token lewat query (?token=) untuk tag <img> MJPEG maupun header Bearer."""
    raw_token = token or (credentials.credentials if credentials else None)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token kamera diperlukan.",
        )
    return decode_token(raw_token, db)


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Pastikan pengguna memiliki peran admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya admin yang dapat melakukan aksi ini.",
        )
    return current_user


def verify_worker_key(x_worker_key: str | None = Header(default=None)) -> None:
    """Validasi header X-Worker-Key khusus untuk cv-worker."""
    if not x_worker_key or x_worker_key != WORKER_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kunci worker (X-Worker-Key) tidak valid.",
        )


def is_group_member_or_admin(db: Session, group_id: int, user: User) -> bool:
    """Cek apakah pengguna adalah anggota grup atau admin pembuat grup tersebut."""
    group = db.get(FamilyGroup, group_id)
    if not group:
        return False
    if group.admin_id == user.id:
        return True
    membership = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == user.id)
        .first()
    )
    return membership is not None


def ensure_group_access(db: Session, group_id: int, user: User) -> FamilyGroup:
    """Pastikan grup ada dan pengguna berhak mengaksesnya."""
    group = db.get(FamilyGroup, group_id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grup keluarga tidak ditemukan.",
        )
    if not is_group_member_or_admin(db, group_id, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda bukan anggota grup keluarga ini.",
        )
    return group


def build_base_url(request: Request) -> str:
    """Susun base URL dinamis sesuai IP/host yang diakses klien di jaringan lokal."""
    return str(request.base_url).rstrip("/")

