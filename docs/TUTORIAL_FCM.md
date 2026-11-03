# Panduan Lengkap Setup Firebase Cloud Messaging (FCM) — SIGAP

Panduan ini disusun khusus mengikuti konfigurasi yang sudah terpasang di kode **SIGAP** (`/backend` dan `/mobile`), sehingga Anda **tidak perlu mengubah kode apa pun**—cukup meletakkan **2 file JSON** dari Firebase Console ke folder yang tepat.

---

## Ringkasan 2 File yang Dibutuhkan

| Untuk Komponen | Nama File dari Firebase | Lokasi Simpan di Proyek SIGAP |
| --- | --- | --- |
| **Mobile Flutter** | `google-services.json` | `e:\SIGAP_LANSIA\mobile\android\app\google-services.json` |
| **Backend FastAPI** | Service Account Key JSON | `e:\SIGAP_LANSIA\backend\firebase-service-account.json` |

> Kedua file di atas sudah otomatis dilindungi di `.gitignore` sehingga tidak akan ikut ter-*commit* ke GitHub.

---

## Langkah 1 — Buat Proyek di Firebase Console

1. Buka [https://console.firebase.google.com/](https://console.firebase.google.com/) dan login dengan akun Google tim.
2. Klik **Create a project** (atau **Add project**).
3. Beri nama proyek misalnya **`sigap-lansia`**.
4. Matikan *Google Analytics* (tidak diperlukan untuk FCM dan membuat pembuatan proyek lebih cepat) → klik **Create project** → tunggu selesai lalu klik **Continue**.

---

## Langkah 2 — Daftarkan Aplikasi Android & Ambil `google-services.json`

1. Di halaman utama proyek Firebase, klik ikon **Android** (*Add Firebase to your Android app*).
2. Pada kolom **Android package name**, isi **PERSIS** seperti di `mobile/android/app/build.gradle.kts`:
   ```text
   id.sigap.sigap_mobile
   ```
   *(Penting: jangan salah ketik; huruf kecil semua).*
3. Kolom **App nickname** boleh diisi `SIGAP Keluarga` (opsional), dan **Debug signing certificate SHA-1** boleh dikosongkan untuk FCM.
4. Klik **Register app**.
5. Klik tombol **Download `google-services.json`**, lalu pindahkan file tersebut ke:
   ```text
   e:\SIGAP_LANSIA\mobile\android\app\google-services.json
   ```
6. Klik **Next** → **Next** → **Continue to console** (konfigurasi Gradle di `mobile/android/settings.gradle.kts` dan `mobile/android/app/build.gradle.kts` sudah kita siapkan otomatis untuk mendeteksi file ini!).

---

## Langkah 3 — Ambil Kunci Service Account untuk Backend FastAPI

1. Di kiri atas Firebase Console, klik ikon ⚙️ (** roda gigi** di sebelah *Project Overview*) → pilih **Project settings**.
2. Buka tab **Service accounts**.
3. Pastikan pilihan bahasa di bagian *Firebase Admin SDK* adalah **Python**, lalu klik tombol biru **Generate new private key** → konfirmasi klik **Generate key**.
4. File `.json` akan terunduh (namanya biasanya `sigap-lansia-firebase-adminsdk-xxxxx.json`).
5. **Ubah nama file tersebut** menjadi `firebase-service-account.json` lalu letakkan di folder `backend`:
   ```text
   e:\SIGAP_LANSIA\backend\firebase-service-account.json
   ```
6. Cek file `e:\SIGAP_LANSIA\backend\.env` dan pastikan baris ini sesuai (secara bawaan sudah sesuai):
   ```env
   FIREBASE_CREDENTIALS=./firebase-service-account.json
   ```

---

## Langkah 4 — Jalankan Ulang & Uji Notifikasi Masuk ke HP!

1. **Restart Backend** (atau jalankan `.\start-sigap.ps1`). Di terminal Backend akan muncul log:
   ```text
   INFO sigap.fcm: Firebase Admin SDK berhasil diinisialisasi.
   ```
2. **Build & Jalankan Aplikasi Flutter ke HP Android** (wajib `flutter run` ulang dari awal setelah menaruh `google-services.json`, bukan sekadar *Hot Reload*):
   ```powershell
   cd e:\SIGAP_LANSIA\mobile
   flutter clean
   flutter pub get
   flutter run --dart-define=BACKEND_URL=http://<IP-LAN-LAPTOP>:8000
   ```
3. **Di HP Android:**
   - Saat muncul pop-up **Allow SIGAP Keluarga to send you notifications?**, tekan **Allow / Izinkan**.
   - Masuk menggunakan akun keluarga bawaan seed: **`rina@sigap.id`** / **`sigap123`** (atau daftar akun baru lalu masukkan kode undangan 6 karakter dari Web Admin).
   - Saat berhasil masuk, aplikasi otomatis memanggil `POST /devices/fcm-token` dan menyimpan token FCM HP ke tabel `users` di MySQL.
4. **Tes Kirim Notifikasi FCM dalam 1 Detik (Tanpa Perlu Jatuh Dulu):**
   - Tekan tombol **Home** di HP Android agar aplikasi berada di *background* / layar terkunci.
   - Di PowerShell laptop (`e:\SIGAP_LANSIA`), jalankan:
     ```powershell
     .\test-fcm-event.ps1
     ```
   - Dalam **1–3 detik**, HP Android akan berbunyi & memunculkan *heads-up notification*:
     **"Peringatan jatuh! — Eyang Sri terdeteksi jatuh di Ruang Tamu"**.
   - Ketuk notifikasi tersebut → aplikasi langsung membuka halaman **Detail Kejadian Jatuh** lengkap dengan tombol merah **TELEPON DARURAT**, **Push-to-Talk**, dan **Sudah Ditangani**!

---

## Troubleshooting Cepat Saat Hari Lomba

- **Notifikasi tidak muncul saat HP terkunci?**
  - Pastikan HP memiliki koneksi internet (FCM dikirim melalui server Google, sehingga hotspot laptop/HP harus punya kuota internet aktif).
  - Di beberapa HP Xiaomi/MIUI, Oppo, atau Vivo: buka *Info Aplikasi SIGAP Keluarga* → *Notifikasi* → pastikan *Floating notifications / Pop-up* aktif.
- **Log Backend menulis `"Tidak ada token FCM terdaftar untuk grup 1"`?**
  - Keluar (*Logout*) lalu *Login* kembali di aplikasi HP setelah `google-services.json` terpasang agar aplikasi mengirim ulang token FCM ke `/devices/fcm-token`.
- **IP Hotspot berubah saat pindah ruangan presentasi?**
  - Tidak perlu *build* ulang APK! Ketuk ikon **Pengaturan IP Server** di kanan atas halaman Login aplikasi HP, masukkan `http://<IP-BARU>:8000`, lalu klik **Simpan**.

