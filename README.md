# SIGAP — Sistem Deteksi Jatuh pada Lansia Berbasis Computer Vision Menggunakan CCTV dengan Notifikasi Real-Time kepada Keluarga

> **"Lansia jatuh, keluarga langsung tahu dan langsung bertindak."**
> Proyek Mini Hackathon Offline **MAKE IT FEST III** (Subtema: Lansia)

SIGAP mengubah CCTV ruangan (pada purwarupa demo: webcam laptop / video simulasi) menjadi pendeteksi jatuh pasif berbasis *Pose Estimation* (**YOLOv8n-Pose**) tanpa mengharuskan lansia memakai perangkat apa pun di tubuhnya. Saat jatuh terkonfirmasi selama ≥ 5 detik di luar zona kasur/sofa, sistem memburamkan wajah pada *snapshot* demi privasi, menyimpannya ke **MySQL**, lalu mengirimkan notifikasi prioritas tinggi (**Firebase Cloud Messaging** & **WebSocket**) ke **aplikasi Android keluarga** dan **dasbor Web Admin** dalam hitungan detik.

---

## Struktur Monorepo

```text
SIGAP_LANSIA/
├── backend/      # FastAPI + SQLAlchemy + MySQL + Firebase Admin (FCM) + WebSocket + Proxy MJPEG
├── cv-worker/    # Python + OpenCV + YOLOv8n-Pose + State Machine 5 detik + Pemutar Suara Speaker
├── mobile/       # Aplikasi Flutter (Android) untuk anggota keluarga (SOS, Live View, Push-to-Talk)
├── web/          # Website Admin (React + Vite + Tailwind CSS + Axios) untuk kelola grup & kamera
├── docs/         # PRD lengkap, sistem warna UI (colour.md), dan dokumen pendukung
└── colour.md     # Panduan sistem warna & design token lintas platform
```

---

## Prasyarat Sistem

- **Python 3.10+** (untuk `backend` dan `cv-worker`)
- **MySQL 8.0+** (buat database kosong bernama `sigap`: `CREATE DATABASE sigap;`)
- **Node.js 18+ & npm** (untuk `web`)
- **Flutter SDK 3.x & Android SDK** (untuk `mobile`)
- Satu jaringan Wi-Fi / Hotspot lokal yang sama antara laptop dan HP Android demo (gunakan IPv4 LAN laptop, mis. `192.168.43.10`, bukan `localhost` untuk HP).

Cek IP LAN laptop di Windows PowerShell:
```powershell
ipconfig
```

---

## Cara Menjalankan Proyek

Untuk fokus **UI web setelah clone**, ikuti [panduan setup UI lokal](docs/SETUP_UI_WEB.md). Setelah dependensi, konfigurasi, dan seed siap, jalankan `.\start-web-dev.ps1` dari folder utama untuk menyalakan web serta backend. Mode UI dapat memakai SQLite yang sudah didukung backend; tidak memerlukan CV worker atau Flutter untuk login.

### 1. Backend FastAPI (`port 8000`)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

Copy-Item .env.example .env
# Edit file .env: sesuaikan DATABASE_URL MySQL dan path FIREBASE_CREDENTIALS (jika sudah ada)

# Opsional: isi akun & grup awal demo ("Rumah Eyang Sri", CAMERA_ID=1)
python seed_demo.py

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Dokumentasi interaktif Swagger tersedia di `http://localhost:8000/docs`.

### 2. CV Worker — Deteksi Jatuh & Speaker CCTV (`port 8001`)

```powershell
cd cv-worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

Copy-Item .env.example .env
# Pastikan CAMERA_ID sesuai ID kamera di Web Admin (default seed: CAMERA_ID=1)

# Mode webcam live:
python main.py --source 0

# Mode cadangan file video loop:
python main.py --source demo.mp4
```
**Pintasan jendela kamera `cv-worker`:**
- Tekan `z` lalu klik 4 sudut kasur/sofa untuk mengaktifkan **Zona Abaikan** (rebahan di kasur tidak memicu alarm).
- Tekan `r` untuk mereset zona abaikan.
- Tekan `q` untuk keluar.

### 3. Web Admin React (`port 5173`)

```powershell
cd web
Copy-Item .env.example .env
# Isi BACKEND_URL=http://<IP-LAN-laptop>:8000

npm install
npm run dev -- --host
```
Buka `http://localhost:5173` (akun seed demo: `admin@sigap.id` / `sigap123`).

### 4. Aplikasi Mobile Keluarga (Flutter Android)

1. Jika menggunakan FCM penuh, letakkan `google-services.json` dari Firebase Console ke `mobile/android/app/google-services.json` (jangan pernah di-*commit*).
2. Jalankan aplikasi ke HP Android:
```powershell
cd mobile
flutter pub get
flutter run --dart-define=BACKEND_URL=http://<IP-LAN-laptop>:8000
```
> **Tips Demo:** Alamat `BACKEND_URL` juga dapat diubah langsung dari dalam aplikasi melalui ikon **Pengaturan Server** di pojok kanan atas layar Masuk tanpa perlu *build* ulang APK! (Akun keluarga seed demo: `rina@sigap.id` / `sigap123`).

---

## Fitur Utama & Privasi Lansia

- **Deteksi Jatuh Tanpa Alat di Tubuh:** Menggabungkan laju turun pinggul, kemiringan garis bahu–pinggul (> 60°), rasio *bounding box* (> 1,2), serta **konfirmasi 5 detik di lantai** dan **zona abaikan kasur/sofa** untuk menekan alarm palsu.
- **Notifikasi Cepat & Pengingat Ulang:** Push FCM prioritas tinggi (`sigap_fall_alert`) disertai pengingat otomatis tiap 2 menit (maksimal 3 kali) bila belum ditangani.
- **Aksi Keluarga ≤ 2 Ketukan:** Lihat *snapshot* & *Live View* MJPEG, bicara ke speaker CCTV (*Push-to-Talk*), tekan **Tombol SOS Telepon Darurat**, atau tandai **Sudah Ditangani / Alarm Palsu** yang tersinkronisasi *real-time* via WebSocket.
- **Privacy by Design:** Sistem **tidak pernah menyimpan rekaman video**; hanya satu *snapshot* saat jatuh terkonfirmasi dengan **wajah diburamkan otomatis**, serta pembersihan retensi otomatis 30 hari.

