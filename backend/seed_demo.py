"""Skrip opsional pengisi data awal demo ('Rumah Eyang Sri' & Kamera Ruang Tamu id=1)."""

from app.database import Base, SessionLocal, engine
from app.deps import hash_password
from app.models import Camera, FamilyGroup, GroupMember, User
from app.routers.groups import generate_invite_code


def run_seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@sigap.id").first()
        if not admin:
            admin = User(
                nama="Admin Keluarga",
                email="admin@sigap.id",
                password_hash=hash_password("sigap123"),
                role="admin",
            )
            db.add(admin)
            db.flush()

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

        group = db.query(FamilyGroup).filter(FamilyGroup.admin_id == admin.id).first()
        if not group:
            group = FamilyGroup(
                nama_grup="Rumah Eyang Sri",
                nama_lansia="Eyang Sri",
                kode_undangan=generate_invite_code(db),
                kontak_darurat="081234567890",
                admin_id=admin.id,
            )
            db.add(group)
            db.flush()

        for u in (admin, rina):
            exists = (
                db.query(GroupMember)
                .filter(GroupMember.group_id == group.id, GroupMember.user_id == u.id)
                .first()
            )
            if not exists:
                db.add(GroupMember(group_id=group.id, user_id=u.id))

        camera = db.query(Camera).filter(Camera.group_id == group.id).first()
        if not camera:
            camera = Camera(
                group_id=group.id,
                nama_ruangan="Ruang Tamu",
                sumber="demo_duduk.mp4",
                status="offline",
            )
            db.add(camera)
        elif camera.sumber == "0":
            camera.sumber = "demo_duduk.mp4"

        db.commit()
        db.refresh(group)
        db.refresh(camera)

        print("=== SEED DEMO SIGAP BERHASIL ===")
        print("Akun Admin   : admin@sigap.id / sigap123")
        print("Akun Keluarga: rina@sigap.id  / sigap123")
        print(f"Grup         : {group.nama_grup} (Kode Undangan: {group.kode_undangan})")
        print(f"Kamera       : ID={camera.id} ({camera.nama_ruangan})")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()

