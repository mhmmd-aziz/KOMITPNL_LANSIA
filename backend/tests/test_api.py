"""Pengujian otomatis alur inti API SIGAP (Auth, Grup, Kamera, Event, Voice)."""

import os
import sys
from pathlib import Path

# Gunakan SQLite sementara agar pengujian tidak menyentuh database MySQL produksi
BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DB_PATH = BACKEND_DIR / "test_sigap_temp.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["WORKER_API_KEY"] = "test-worker-key"
os.environ["FIREBASE_CREDENTIALS"] = "mock-offline-test.json"

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

            # 4. Keluarga membuat grup rumah sendiri + Kode Keluarga buatan sendiri
            r_grp = client.post(
                "/groups",
                headers=fam_headers,
                json={
                    "nama_grup": "Rumah Eyang Sri",
                    "nama_lansia": "Eyang Sri",
                    "kontak_darurat": "081234567890",
                    "kode_undangan": "SRIKU88",
                    "nama_ruangan_awal": "Ruang Tamu",
                },
            )
            assert r_grp.status_code == 201, r_grp.text
            group_data = r_grp.json()
            group_id = group_data["id"]
            invite_code = group_data["kode_undangan"]
            assert invite_code == "SRIKU88"
            camera_id = group_data["cameras"][0]["id"]

            # 5. Verifikasi buka kunci akses dengan Kode Keluarga
            r_ver_bad = client.post(
                f"/groups/{group_id}/verify-code",
                headers=fam_headers,
                json={"kode_undangan": "SALAH99"},
            )
            assert r_ver_bad.status_code == 403
            r_ver_ok = client.post(
                f"/groups/{group_id}/verify-code",
                headers=fam_headers,
                json={"kode_undangan": "SRIKU88"},
            )
            assert r_ver_ok.status_code == 200 and r_ver_ok.json()["valid"] is True

            # 6. Admin SaaS TIDAK BOLEH mengintip event privat grup keluarga (403)
            r_priv = client.get(f"/events?group_id={group_id}", headers=admin_headers)
            assert r_priv.status_code == 403, r_priv.text

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

            # 8. Keluarga mengatur Lokasi CCTV (untuk WA Darurat) & melihat detail event
            r_cam_loc = client.patch(
                f"/cameras/{camera_id}",
                headers=fam_headers,
                json={"lokasi_cctv": "Ruang Tamu Lt. 1, Jl. Melati No. 10 https://maps.google.com/?q=-6.2,106.8"},
            )
            assert r_cam_loc.status_code == 200, r_cam_loc.text
            assert "Jl. Melati No. 10" in r_cam_loc.json()["lokasi_cctv"]

            r_list = client.get(f"/events?group_id={group_id}", headers=fam_headers)
            assert r_list.status_code == 200 and len(r_list.json()) == 1

            r_det = client.get(f"/events/{event_id}", headers=fam_headers)
            assert r_det.status_code == 200
            assert r_det.json()["camera_name"] == "Ruang Tamu"
            assert "Jl. Melati No. 10" in r_det.json()["lokasi_cctv"]

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

            # 11. Admin mengecek daftar & mengunggah video di Halaman Simulasi
            safe_zones_path = BACKEND_DIR.parent / "cv-worker" / "safe_zones.json"
            videos_meta_path = BACKEND_DIR.parent / "cv-worker" / "simulations" / "videos_meta.json"
            backup_zones = safe_zones_path.read_text(encoding="utf-8") if safe_zones_path.exists() else None
            backup_meta = videos_meta_path.read_text(encoding="utf-8") if videos_meta_path.exists() else None
            created_sim_files: list[Path] = []
            try:
                r_vids = client.get("/simulations/videos", headers=admin_headers)
                assert r_vids.status_code == 200, r_vids.text

                r_up = client.post(
                    "/simulations/upload",
                    headers=admin_headers,
                    files={"video": ("uji_temp_sim.mp4", b"FAKE_MP4_STREAM", "video/mp4")},
                )
                assert r_up.status_code == 201, r_up.text
                created_sim_files.append(
                    BACKEND_DIR.parent / "cv-worker" / "simulations" / "uji_temp_sim.mp4"
                )

                r_vf = client.get(
                    f"/simulations/video-file?video_name=uji_temp_sim.mp4&token={admin_token}"
                )
                assert r_vf.status_code == 200 and r_vf.content == b"FAKE_MP4_STREAM"

                # 12. Admin SaaS memantau analitik performa SaaS (kode keluarga di-masking) & manage nomor WA darurat
                r_saas = client.get("/admin/saas-overview", headers=admin_headers)
                assert r_saas.status_code == 200, r_saas.text
                saas_data = r_saas.json()
                assert saas_data["kpis"]["total_tenants"] == 1
                assert "•" in saas_data["tenants"][0]["kode_masked"]
                assert saas_data["tenants"][0]["kode_masked"] != "SRIKU88"

                r_em_contact = client.patch(
                    "/admin/emergency-contact",
                    headers=admin_headers,
                    json={"kontak_darurat": "+62 895-6006-86367"},
                )
                assert r_em_contact.status_code == 200, r_em_contact.text
                assert r_em_contact.json()["emergency_whatsapp"] == "+62 895-6006-86367"

                # 13. Pra-analisis pratinjau & penyimpanan permanen 4 titik Area Aman per kamera + video
                test_poly = [[[0.12, 0.20], [0.48, 0.20], [0.48, 0.55], [0.12, 0.55]]]
                r_zones_save = client.post(
                    "/simulations/zones",
                    headers=admin_headers,
                    json={
                        "camera_id": camera_id,
                        "video_name": "test_room_calib.mp4",
                        "zones": test_poly,
                    },
                )
                assert r_zones_save.status_code == 200, r_zones_save.text
                assert len(r_zones_save.json()["zones"]) == 1

                r_zones_get = client.get(
                    f"/simulations/zones?camera_id={camera_id}&video_name=test_room_calib.mp4",
                    headers=admin_headers,
                )
                assert r_zones_get.status_code == 200
                assert r_zones_get.json()["zones"] == test_poly

                r_prep = client.post(
                    "/simulations/prepare",
                    headers=admin_headers,
                    json={"camera_id": camera_id, "video_name": "test_room_calib.mp4"},
                )
                assert r_prep.status_code == 200
                assert r_prep.json()["zones"] == test_poly

                # 14. Interkom 2 Arah: POV CCTV (Laptop) -> HP Keluarga + Isolasi Grup Lain
                r_cctv_voice = client.post(
                    f"/cameras/{camera_id}/cctv-voice",
                    headers=admin_headers,
                    files={"audio": ("cctv_talk.webm", b"FAKE_WEBM_CCTV_AUDIO", "audio/webm")},
                )
                assert r_cctv_voice.status_code == 201, r_cctv_voice.text

                r_voices_list = client.get(
                    f"/cameras/{camera_id}/voices",
                    headers=fam_headers,
                )
                assert r_voices_list.status_code == 200, r_voices_list.text
                directions = [it["direction"] for it in r_voices_list.json()["items"]]
                assert "cctv_to_family" in directions
                assert "family_to_cctv" in directions

                # 15. Isolasi Lintas Grup Keluarga: Upload Video POV dari HP otomatis milik sendiri & Area Aman Mandiri
                r_fam_b = client.post(
                    "/auth/register",
                    json={
                        "nama": "Budi Uji",
                        "email": "budi@test.id",
                        "password": "password123",
                        "role": "keluarga",
                    },
                )
                assert r_fam_b.status_code == 201, r_fam_b.text
                fam_b_token = r_fam_b.json()["access_token"]
                fam_b_headers = {"Authorization": f"Bearer {fam_b_token}"}

                r_grp_b = client.post(
                    "/groups",
                    headers=fam_b_headers,
                    json={
                        "nama_grup": "Rumah Kakek Budi",
                        "nama_lansia": "Kakek Budi",
                        "kontak_darurat": "089988776655",
                        "kode_undangan": "BUDIKU99",
                        "nama_ruangan_awal": "Kamar Tidur Utama",
                    },
                )
                assert r_grp_b.status_code == 201, r_grp_b.text
                grp_b = r_grp_b.json()
                cam_b_id = grp_b["cameras"][0]["id"]

                # Keluarga B tidak boleh mengakses suara kamera Keluarga A (403)
                r_forbidden_voices = client.get(
                    f"/cameras/{camera_id}/voices",
                    headers=fam_b_headers,
                )
                assert r_forbidden_voices.status_code == 403

                # Keluarga B mengunggah video POV dari HP -> otomatis terikat ke grup & kamera miliknya
                r_up_b = client.post(
                    "/simulations/upload",
                    headers=fam_b_headers,
                    data={"camera_id": str(cam_b_id)},
                    files={"video": ("kamar_budi.mp4", b"FAKE_POV_MP4_BUDI", "video/mp4")},
                )
                assert r_up_b.status_code == 201, r_up_b.text
                uploaded_b_name = r_up_b.json()["uploaded"]
                assert uploaded_b_name.startswith(f"grp{grp_b['id']}_cam{cam_b_id}_")
                created_sim_files.append(
                    BACKEND_DIR.parent / "cv-worker" / "simulations" / uploaded_b_name
                )

                # Sumber kamera Keluarga B otomatis diperbarui ke video POV yang baru diunggah
                r_grp_b_detail = client.get(f"/groups/{grp_b['id']}", headers=fam_b_headers)
                assert r_grp_b_detail.status_code == 200
                assert r_grp_b_detail.json()["cameras"][0]["sumber"] == uploaded_b_name

                # Keluarga B menandai sendiri 4 titik Area Aman dari HP miliknya
                poly_b = [[[0.20, 0.25], [0.60, 0.25], [0.60, 0.70], [0.20, 0.70]]]
                r_zone_b = client.post(
                    "/simulations/zones",
                    headers=fam_b_headers,
                    json={
                        "camera_id": cam_b_id,
                        "video_name": uploaded_b_name,
                        "zones": poly_b,
                    },
                )
                assert r_zone_b.status_code == 200, r_zone_b.text
                assert r_zone_b.json()["zones"] == poly_b

                # Keluarga A TIDAK BOLEH melihat video privat Keluarga B atau mengakses Area Aman Kamera B
                r_vids_a = client.get(
                    f"/simulations/videos?camera_id={camera_id}",
                    headers=fam_headers,
                )
                assert r_vids_a.status_code == 200
                names_seen_by_a = [v["name"] for v in r_vids_a.json()["videos"]]
                assert uploaded_b_name not in names_seen_by_a

                r_vf_forbidden = client.get(
                    f"/simulations/video-file?video_name={uploaded_b_name}&token={fam_token}"
                )
                assert r_vf_forbidden.status_code == 403

                r_zone_forbidden = client.post(
                    "/simulations/zones",
                    headers=fam_headers,
                    json={
                        "camera_id": cam_b_id,
                        "video_name": uploaded_b_name,
                        "zones": poly_b,
                    },
                )
                assert r_zone_forbidden.status_code == 403
            finally:
                for fp in created_sim_files:
                    if fp.exists():
                        fp.unlink()
                if backup_zones is not None:
                    safe_zones_path.write_text(backup_zones, encoding="utf-8")
                elif safe_zones_path.exists():
                    safe_zones_path.unlink()
                if backup_meta is not None:
                    videos_meta_path.write_text(backup_meta, encoding="utf-8")
                elif videos_meta_path.exists():
                    videos_meta_path.unlink()

        print("SEMUA 15 SKENARIO UJI ALUR INTI, INTERKOM 2 ARAH, AREA AMAN HP, & ISOLASI GRUP LULUS 100%!")
    finally:
        if TEST_DB_PATH.exists():
            try:
                TEST_DB_PATH.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    run_tests()

