"""Pengujian otomatis alur inti API SIGAP (Auth, Grup, Kamera, Event, Voice)."""

import os
import sys
from pathlib import Path

# Gunakan SQLite sementara agar pengujian tidak menyentuh database MySQL produksi
BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DB_PATH = BACKEND_DIR / "test_sigap_temp.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["WORKER_API_KEY"] = "test-worker-key"

sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


def run_tests() -> None:
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    try:
        with TestClient(app) as client:
            # 1. Health check
            r = client.get("/health")
            assert r.status_code == 200, r.text

            # 2. Register Admin & Keluarga
            r_admin = client.post(
                "/auth/register",
                json={
                    "nama": "Admin Uji",
                    "email": "admin@test.id",
                    "password": "password123",
                    "role": "admin",
                },
            )
            assert r_admin.status_code == 201, r_admin.text
            admin_token = r_admin.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            r_fam = client.post(
                "/auth/register",
                json={
                    "nama": "Rina Uji",
                    "email": "rina@test.id",
                    "password": "password123",
                    "role": "keluarga",
                },
            )
            assert r_fam.status_code == 201, r_fam.text
            fam_token = r_fam.json()["access_token"]
            fam_headers = {"Authorization": f"Bearer {fam_token}"}

            # 3. Simpan token FCM
            r_fcm = client.post(
                "/devices/fcm-token",
                headers=fam_headers,
                json={"fcm_token": "dummy-fcm-token-android-12345"},
            )
            assert r_fcm.status_code == 200, r_fcm.text

            # 4. Admin membuat grup keluarga
            r_grp = client.post(
                "/groups",
                headers=admin_headers,
                json={
                    "nama_grup": "Rumah Eyang Sri",
                    "nama_lansia": "Eyang Sri",
                    "kontak_darurat": "081234567890",
                },
            )
            assert r_grp.status_code == 201, r_grp.text
            group_data = r_grp.json()
            group_id = group_data["id"]
            invite_code = group_data["kode_undangan"]
            assert len(invite_code) == 6

            # 5. Keluarga bergabung memakai kode undangan
            r_join = client.post(
                "/groups/join",
                headers=fam_headers,
                json={"kode_undangan": invite_code},
            )
            assert r_join.status_code == 200, r_join.text

            # 6. Admin mendaftarkan kamera
            r_cam = client.post(
                f"/groups/{group_id}/cameras",
                headers=admin_headers,
                json={"nama_ruangan": "Ruang Tamu", "sumber": "0"},
            )
            assert r_cam.status_code == 201, r_cam.text
            camera_id = r_cam.json()["id"]

            # 7. CV Worker mengirim event jatuh + snapshot
            fake_jpeg = b"\xff\xd8\xff\xe0JFIF_TEST_SNAPSHOT\xff\xd9"
            r_ev = client.post(
                "/events",
                headers={"X-Worker-Key": "test-worker-key"},
                data={"camera_id": str(camera_id), "confidence": "0.92"},
                files={"snapshot": ("fall.jpg", fake_jpeg, "image/jpeg")},
            )
            assert r_ev.status_code == 201, r_ev.text
            event_id = r_ev.json()["id"]
            assert r_ev.json()["status"] == "baru"

            # 8. Keluarga melihat riwayat & detail event
            r_list = client.get(f"/events?group_id={group_id}", headers=fam_headers)
            assert r_list.status_code == 200 and len(r_list.json()) == 1

            r_det = client.get(f"/events/{event_id}", headers=fam_headers)
            assert r_det.status_code == 200
            assert r_det.json()["camera_name"] == "Ruang Tamu"

            # 9. Keluarga menandai Sudah Ditangani
            r_patch = client.patch(
                f"/events/{event_id}",
                headers=fam_headers,
                json={"status": "ditangani"},
            )
            assert r_patch.status_code == 200, r_patch.text
            assert r_patch.json()["status"] == "ditangani"
            assert r_patch.json()["handled_by_name"] == "Rina Uji"

            # 10. Keluarga mengirim pesan suara Push-to-Talk
            r_voice = client.post(
                f"/cameras/{camera_id}/voice",
                headers=fam_headers,
                files={"audio": ("pesan.m4a", b"FAKE_M4A_AUDIO", "audio/mp4")},
            )
            assert r_voice.status_code == 201, r_voice.text

        print("SEMUA 10 SKENARIO UJI ALUR INTI BACKEND LULUS 100%!")
    finally:
        if TEST_DB_PATH.exists():
            try:
                TEST_DB_PATH.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    run_tests()

