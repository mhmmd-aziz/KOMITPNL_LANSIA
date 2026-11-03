# Menjalankan UI web SIGAP setelah clone

Halaman login membutuhkan dua layanan: web Vite di port `5173` dan backend FastAPI di port `8000`. Menjalankan `npm run dev` saja belum menyalakan backend atau membuat akun demo. Pesan “Belum dapat terhubung” dapat muncul ketika backend belum berjalan.

## Mode pengembangan UI lokal

Untuk mengerjakan UI, gunakan dukungan SQLite yang sudah ada di backend. MySQL tetap digunakan untuk konfigurasi sistem lengkap. Mode ini menjalankan API dan menyimpan data lokal; tidak memakai respons API palsu.

Prasyarat: Python 3.12, Node.js, dan npm tersedia di terminal.

### 1. Pasang dependensi

Dari folder utama proyek:

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm ci --prefix web
```

### 2. Buat konfigurasi lokal

Salin template hanya jika file `.env` belum ada; pertahankan konfigurasi yang sudah dipakai:

```powershell
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (-not (Test-Path web/.env)) { Copy-Item web/.env.example web/.env }
```

Untuk SQLite, ubah `DATABASE_URL` di `backend/.env`:

```dotenv
DATABASE_URL=sqlite:///./sigap-local.db
CV_WORKER_URL=http://127.0.0.1:8001
```

Isi `JWT_SECRET` dan `WORKER_API_KEY` dengan nilai acak lokal. Berkas `.env` dan database tidak masuk Git. Jalankan backend dari folder `backend` agar path database relatif mengarah ke lokasi yang benar; launcher di bawah sudah mengatur direktori ini.

Isi `web/.env`:

```dotenv
BACKEND_URL=http://127.0.0.1:8000
```

Jika ingin memakai MySQL, gunakan URL MySQL dan kredensial milik Anda di `backend/.env`, serta buat database `sigap` terlebih dahulu. Jangan mengganti atau mereset akun MySQL hanya untuk menjalankan UI.

### 3. Buat akun demo

```powershell
Push-Location backend
.\.venv\Scripts\python.exe seed_demo.py
Pop-Location
```

Seed membuat akun yang belum tersedia, satu grup keluarga, dan kamera demo. Akun web admin:

- Email: `admin@sigap.id`
- Kata sandi: `sigap123`

Seed tidak mereset kata sandi akun yang sudah ada.

### 4. Jalankan web dan backend

Dari folder utama proyek:

```powershell
.\start-web-dev.ps1
```

Buka [SIGAP Web Admin](http://127.0.0.1:5173). Launcher memakai jendela tersembunyi dan mencatat log di `.runtime/`. Server SIGAP yang sudah berjalan akan dipakai kembali; proses pada port yang tidak dikenali tidak dihentikan otomatis.

Untuk menghentikan proses yang dibuat launcher:

```powershell
.\start-web-dev.ps1 -Stop
```

Web yang sebelumnya dijalankan sendiri dengan `npm run dev` tetap dikelola melalui terminal tersebut. Jika konfigurasi `web/.env` berubah dan belum terbaca, restart Vite dari terminal itu.

## Verifikasi

- [Health backend](http://127.0.0.1:8000/health) menampilkan `status: ok` dan `service: sigap-backend`.
- Login admin berhasil membuka dasbor “Rumah Eyang Sri”.
- Kamera tampil offline selama CV worker belum dijalankan; ini tidak menghalangi login atau pengerjaan UI.
- Firebase belum diperlukan untuk login. Tanpa file kredensial Firebase, backend melewati FCM dan tetap melayani API/WebSocket.

Mode UI lokal belum menjalankan CV worker, streaming kamera nyata, atau notifikasi FCM ke perangkat. Untuk pengujian sistem lengkap, ikuti [README proyek](../README.md). SQLite lokal tidak menggantikan pengujian relasi dan cascade pada MySQL.
