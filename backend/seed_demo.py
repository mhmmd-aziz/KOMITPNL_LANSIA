"""Skrip pengisi data awal demo: Admin SaaS (Web) & Keluarga Rina (Mobile - Rumah Eyang Sri)."""

from sqlalchemy import text
from app.database import Base, SessionLocal, engine
from app.deps import hash_password
from app.models import Camera, FamilyGroup, GroupMember, User
from app.routers.groups import generate_invite_code


def run_seed() -> None:
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "mysql":
        try:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE family_groups MODIFY COLUMN kode_undangan VARCHAR(16) NOT NULL")
                )
        except Exception:
            pass
    try:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE cameras ADD COLUMN lokasi_cctv VARCHAR(255) NOT NULL DEFAULT ''")
            )
    except Exception:
        pass

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@sigap.id").first()
        if not admin:
            admin = User(
                nama="Admin Platform SIGAP",
                email="admin@sigap.id",
                password_hash=hash_password("sigap123"),
                role="admin",
            )
            db.add(admin)
            db.flush()
        else:
            admin.nama = "Admin Platform SIGAP"

        rina = db.query(User).filter(User.email == "rina@sigap.id").first()
        if not rina:
            rina = User(
                nama="Rina (Anak)",
                email="rina@sigap.id",
                password_hash=hash_password("sigap123"),
                role="keluarga",
            )
            db.add(rina)
            db.flush()

        # Pastikan grup keluarga contoh dimiliki oleh Rina (keluarga), BUKAN admin SaaS
        group = db.query(FamilyGroup).order_by(FamilyGroup.id.asc()).first()
        if not group:
            group = FamilyGroup(
                nama_grup="Rumah Eyang Sri",
                nama_lansia="Eyang Sri",
                kode_undangan="EYANG1",
                kontak_darurat="+62 895-6006-86367",
                admin_id=rina.id,
            )
            db.add(group)
            db.flush()
        else:
            group.admin_id = rina.id
            if not group.kontak_darurat or group.kontak_darurat == "081234567890":
                group.kontak_darurat = "+62 895-6006-86367"
            if group.kode_undangan == "GTERXE":
                group.kode_undangan = "EYANG1"

        # Keluarkan admin SaaS dari grup keluarga agar privasi tenant terjaga 100%
        admin_member = (
            db.query(GroupMember)
            .filter(GroupMember.group_id == group.id, GroupMember.user_id == admin.id)
            .first()
        )
        if admin_member:
            db.delete(admin_member)

        rina_member = (
            db.query(GroupMember)
            .filter(GroupMember.group_id == group.id, GroupMember.user_id == rina.id)
            .first()
        )
        if not rina_member:
            db.add(GroupMember(group_id=group.id, user_id=rina.id))

        camera = db.query(Camera).filter(Camera.group_id == group.id).first()
        default_loc = "Ruang Tamu Lt. 1, Rumah Eyang Sri - Jl. Melati No. 10 (https://maps.google.com/?q=-6.2088,106.8456)"
        if not camera:
            camera = Camera(
                group_id=group.id,
                nama_ruangan="Ruang Tamu",
                lokasi_cctv=default_loc,
                sumber="idle",
                status="offline",
            )
            db.add(camera)
        elif not getattr(camera, "lokasi_cctv", None) or not camera.lokasi_cctv.strip():
            camera.lokasi_cctv = default_loc

        db.commit()
        db.refresh(group)
        db.refresh(camera)

        print("=== SEED DEMO SIGAP BERHASIL ===")
        print("Admin SaaS (Web) : admin@sigap.id / sigap123")
        print("Keluarga (Mobile): rina@sigap.id  / sigap123")
        print(f"Grup Keluarga    : {group.nama_grup} (Kode Keluarga: {group.kode_undangan})")
        print(f"Kamera           : ID={camera.id} ({camera.nama_ruangan})")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
