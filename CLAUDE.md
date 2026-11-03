# CLAUDE.md — SIGAP

SIGAP: Sistem Deteksi Jatuh pada Lansia Berbasis Computer Vision Menggunakan CCTV dengan Notifikasi Real-Time kepada Keluarga.
Proyek Mini Hackathon Offline MAKE IT FEST III (subtema Lansia). Detail produk lengkap: @docs/PRD_SIGAP.md

## Aturan lomba yang wajib dipatuhi (TOR)

- Seluruh kode produk ditulis selama hari lomba. Jangan menyalin proyek jadi dari luar.
- AI hanya alat bantu. Tim harus bisa menjelaskan struktur, alur, dan kode ke juri. Karena itu:
  - Kerjakan per langkah kecil sesuai permintaan, jangan membuat seluruh modul sekaligus tanpa diminta.
  - Setelah setiap perubahan, jelaskan singkat (2–3 kalimat) apa yang diubah dan kenapa.
  - Pilih kode sederhana dan mudah dijelaskan, bukan pola yang rumit.
- Boilerplate resmi (flutter create, npm create vite, template FastAPI) dan library open-source boleh dipakai. Patuhi lisensinya.
- Commit kecil dan sering, oleh anggota yang mengerjakan, sebagai bukti proses (TOR J.4).

## Prioritas pengerjaan

Gerbang pukul 12.00: alur inti harus jalan sebelum ishoma.

1. **Alur inti (wajib, sebelum 12.00):** webcam → CV worker deteksi jatuh → POST /events → simpan MySQL → FCM → notifikasi muncul di HP Android.
2. **Aksi keluarga (12.40–14.30):** detail event + snapshot, telepon darurat, tandai ditangani, live view, web admin grup.
3. **Tambahan (jika waktu cukup):** push-to-talk suara ke speaker CCTV, notifikasi ulang, riwayat dengan filter.

Jangan mengerjakan fitur di luar daftar MVP sebelum alur inti berjalan. Jika ragu, tanya dulu.

## Struktur repo

```
/backend      FastAPI + SQLAlchemy + MySQL + firebase-admin
/cv-worker    Python: OpenCV + YOLOv8n-Pose, CCTV dummy, pemutar suara
/mobile       Flutter (Android) untuk keluarga
/web          React + Vite + Tailwind untuk admin
/docs         PRD, diagram, aset presentasi
```

## Menjalankan proyek

Semua komponen berjalan di satu jaringan lokal. HP memakai IP LAN laptop, bukan `localhost`.

```bash
# Backend (port 8000)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# CV worker (port 8001, MJPEG + WebSocket ke backend)
cd cv-worker && pip install -r requirements.txt
python main.py --source 0            # webcam
python main.py --source demo.mp4     # cadangan: video file

# Web admin (port 5173)
cd web && npm install && npm run dev -- --host

# Mobile
cd mobile && flutter pub get && flutter run
```

## Environment variables

Simpan di `.env` masing-masing folder. Jangan pernah commit `.env`, file service account Firebase, atau `google-services.json`.

| Variabel | Dipakai di | Isi |
| --- | --- | --- |
| `DATABASE_URL` | backend | `mysql+pymysql://user:pass@localhost:3306/sigap` |
| `JWT_SECRET` | backend | string acak |
| `FIREBASE_CREDENTIALS` | backend | path ke JSON service account |
| `WORKER_API_KEY` | backend, cv-worker | kunci untuk endpoint khusus worker |
| `BACKEND_URL` | cv-worker, web, mobile | `http://<IP-LAN-laptop>:8000` |
| `CAMERA_ID` | cv-worker | id kamera di tabel `cameras` |

## Arsitektur singkat

- **cv-worker** membaca frame, mendeteksi jatuh, mengirim event + snapshot ke backend, menyajikan stream MJPEG di port 8001, dan memutar pesan suara yang diterima lewat WebSocket.
- **backend** adalah satu-satunya pintu data: menyimpan ke MySQL, mengirim FCM, mem-proxy stream kamera, menerima upload suara, dan menyiarkan pembaruan lewat WebSocket.
- **mobile** dan **web** hanya bicara ke backend, tidak langsung ke cv-worker.

## Kontrak API

| Method | Endpoint | Auth | Keterangan |
| --- | --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | — | Respons login: `{access_token, user:{id,nama,role}}` |
| POST | `/groups` | admin | Buat grup; respons berisi `kode_undangan` (6 karakter) |
| POST | `/groups/join` | keluarga | Body `{kode_undangan}` |
| GET | `/groups/{id}` | anggota | Detail grup, anggota, kamera, kontak darurat |
| POST | `/devices/fcm-token` | user | Body `{fcm_token}`; dipanggil setiap login dan saat token berubah |
| POST | `/events` | `X-Worker-Key` | Multipart: `camera_id`, `confidence`, `snapshot` (JPEG) |
| GET | `/events?group_id=&status=` | anggota | Riwayat, terbaru dulu |
| PATCH | `/events/{id}` | anggota | Body `{status: "ditangani" \| "alarm_palsu"}` |
| GET | `/cameras/{id}/stream?token=` | anggota | Proxy MJPEG dari cv-worker; token lewat query karena `<img>` tidak bisa kirim header |
| POST | `/cameras/{id}/voice` | anggota | Multipart `audio` (AAC/M4A) |
| WS | `/ws/groups/{id}?token=` | anggota | Pesan `event.created`, `event.updated` |
| WS | `/ws/worker/{camera_id}?key=` | worker | Pesan `voice.play` berisi `{url}` |

Auth memakai header `Authorization: Bearer <jwt>`. Error memakai format FastAPI standar `{detail: "..."}` dengan pesan Bahasa Indonesia.

## Format notifikasi FCM

```json
{
  "notification": {"title": "Peringatan jatuh!", "body": "Eyang Sri terdeteksi jatuh di Ruang Tamu"},
  "data": {"type": "fall", "event_id": "123", "group_id": "4", "camera_name": "Ruang Tamu"},
  "android": {"priority": "high", "notification": {"channel_id": "sigap_fall_alert", "sound": "default"}}
}
```

Saat notifikasi diketuk, aplikasi membuka halaman detail event berdasarkan `data.event_id`.

## Model data (MySQL)

- `users`: id, nama, email, password_hash, role (`admin`/`keluarga`), fcm_token
- `family_groups`: id, nama_grup, nama_lansia, kode_undangan (unik), kontak_darurat, admin_id
- `group_members`: group_id, user_id, joined_at
- `cameras`: id, group_id, nama_ruangan, sumber, status
- `events`: id, camera_id, waktu, snapshot_path, confidence, status (`baru`/`ditangani`/`alarm_palsu`), handled_by
- `voice_messages`: id, camera_id, user_id, file_path, played_at

Untuk hackathon, tabel dibuat dengan `Base.metadata.create_all()`, tanpa Alembic. Waktu disimpan dalam UTC dan ditampilkan sebagai WIB (`Asia/Jakarta`).

## Logika deteksi jatuh (cv-worker)

Semua ambang ditaruh di `cv-worker/config.py` agar mudah disetel, jangan di-hardcode di logika.

- Laju turun pinggul > 0,5 × tinggi badan per detik
- Sudut garis bahu–pinggul > 60° dari tegak
- Rasio lebar/tinggi bounding box > 1,2
- State machine: `NORMAL → KEMUNGKINAN_JATUH → (tetap di lantai ≥ 5 detik) → JATUH_TERKONFIRMASI`; jika bangun sebelum timer habis, kembali `NORMAL`
- Abaikan pose berbaring di dalam poligon zona abaikan (kasur/sofa)
- Cooldown 60 detik per kamera setelah event agar tidak terkirim berulang
- Blur wajah di snapshot sebelum dikirim. Jangan pernah menyimpan video.

Target: ≥ 15 FPS di CPU (model `yolov8n-pose.pt`, input 640 px, boleh proses tiap frame ke-2).

## Konvensi kode

- **Python:** type hints, Pydantic schema untuk request/response, router per domain (`auth`, `groups`, `events`, `cameras`). Fungsi kecil dan diberi docstring singkat.
- **Flutter:** struktur `lib/screens`, `lib/services`, `lib/models`, `lib/widgets`. State management cukup Provider. HTTP lewat satu `ApiService` (dio). Paket utama: firebase_core, firebase_messaging, flutter_local_notifications, url_launcher, record.
- **React:** komponen fungsional + hooks, Tailwind, satu modul `api.js` (axios) dengan interceptor token.
- **Teks UI:** Bahasa Indonesia, singkat dan jelas. Tombol SOS besar dan berwarna merah; aksi utama ≤ 2 ketukan dari notifikasi.
- **Kode:** nama variabel dan fungsi dalam bahasa Inggris; komentar boleh Bahasa Indonesia.
- **Commit:** format `feat(mobile): ...`, `fix(backend): ...`, `chore: ...`.

## Jangan lakukan

- Commit kredensial, `.env`, file service account, atau data pribadi asli.
- Menyimpan atau mengunggah rekaman video; yang disimpan hanya snapshot event dan pesan suara.
- Menambah dependency besar atau mengganti stack (Flutter, React, FastAPI, MySQL, FCM) tanpa persetujuan tim.
- Membuat mobile atau web memanggil cv-worker secara langsung.
- Menulis ulang file besar jika yang diminta hanya perubahan kecil.

## Checklist sebelum demo (16.00)

- [ ] Jatuh di atas matras → notifikasi FCM muncul di HP ≤ 10 detik
- [ ] Duduk cepat dan rebahan di kasur → tidak ada notifikasi
- [ ] Ketuk notifikasi → detail event, snapshot, live view berjalan
- [ ] Tombol telepon darurat membuka dialer ke nomor kontak grup
- [ ] "Sudah ditangani" langsung terlihat di web admin
- [ ] Push-to-talk terdengar di speaker laptop (jika fitur selesai)
- [ ] Hotspot cadangan siap, `BACKEND_URL` memakai IP yang benar
- [ ] Repo GitHub, README, APK, dan video demo cadangan sudah dikumpulkan
