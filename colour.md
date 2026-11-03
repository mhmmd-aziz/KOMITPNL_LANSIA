# Panduan Sistem Warna & Design Token — SIGAP

Sistem warna SIGAP dirancang khusus untuk **situasi darurat keluarga** dan **kejelasan proyektor saat demo**: tenang saat kondisi aman, namun langsung kontras dan mengarahkan mata ke tombol aksi dalam **≤ 3 detik** saat lansia terdeteksi jatuh.

---

## 1. Prinsip Utama UI/UX (Alasan Pemilihan Warna untuk Juri)

1. **Pemisahan Semantik yang Tegas:** Warna utama merek menggunakan **Deep Care Teal (`#0F766E`)** yang bernuansa medis, tenang, dan tepercaya. Warna **Merah (`#DC2626`)** **dilarang** dipakai untuk dekorasi biasa—hanya muncul untuk **kejadian jatuh (`baru`)** dan **Tombol SOS Telepon Darurat**.
2. **Ramah Proyektor Demo (Light Mode First):** Latar belakang terang (`#F8FAFC`) dengan kartu putih (`#FFFFFF`) dan teks gelap (`#0F172A`) menjamin keterbacaan tinggi di proyektor ruangan dan mirroring `scrcpy`, berbeda dengan *dark mode* yang sering pudar di layar proyektor.
3. **Standar Kontras WCAG AA:** Seluruh kombinasi tombol utama dan teks melewati rasio kontras minimal `4.5:1` sehingga mudah dibaca oleh anggota keluarga lintas usia saat panik.
4. **Tidak Mengandalkan Warna Saja:** Setiap status selalu dipasangkan dengan **ikon + label Bahasa Indonesia singkat** (`BARU`, `DITANGANI`, `ALARM PALSU`).

---

## 2. Palet Warna Inti (Core Tokens)

### A. Brand & Navigasi (Calm Care Teal)
Digunakan untuk AppBar, sidebar/navbar web admin, tombol login, aksi sekunder aktif (seperti *Push-to-Talk* saat siaga), dan fokus input.

| Token | Hex | Kelas Tailwind | Kontras Teks Putih | Kegunaan Utama |
| --- | --- | --- | --- | --- |
| `primary` | `#0F766E` | `teal-700` | `5.47:1` (AA) | AppBar, tombol utama non-darurat, tab aktif |
| `primary-hover` | `#115E59` | `teal-800` | `7.18:1` (AAA) | State ditekan / hover tombol utama |
| `primary-accent` | `#0D9488` | `teal-600` | `3.74:1` | Ikon aksen, indikator rekaman fokus |
| `primary-soft` | `#F0FDFA` | `teal-50` | — (teks `#115E59`) | Latar kartu info grup / kode undangan |
| `primary-border` | `#99F6E4` | `teal-200` | — | Garis tepi kartu informasi aktif |

### B. Darurat & SOS (Emergency Crimson)
Khusus untuk **notifikasi jatuh belum ditangani**, **banner peringatan aktif**, dan **Tombol SOS Telepon Darurat**.

| Token | Hex | Kelas Tailwind | Kontras Teks Putih | Kegunaan Utama |
| --- | --- | --- | --- | --- |
| `danger` / `sos` | `#DC2626` | `red-600` | `4.83:1` (AA) | **Tombol SOS Telepon Darurat**, badge event `baru` |
| `danger-pressed` | `#B91C1C` | `red-700` | `6.47:1` (AA) | State ditekan / hover tombol SOS, header alert kritis |
| `danger-soft` | `#FEF2F2` | `red-50` | — (teks `#991B1B`) | Latar kartu event `baru` yang belum ditangani |
| `danger-border` | `#FECACA` | `red-200` | — | Border kartu darurat & ring tombol SOS |
| `danger-text` | `#991B1B` | `red-800` | — | Teks pada badge/banner latar `red-50` (`7.8:1` AAA) |

### C. Status Operasional (Aman, Peringatan, Netral)

| Kategori | Solid (Tombol/Dot) | Soft Bg (Badge/Card) | Border | Teks di Soft Bg | Padanan Tailwind |
| --- | --- | --- | --- | --- | --- |
| **Aman / Ditangani** | `#047857` (`emerald-700`) | `#ECFDF5` (`emerald-50`) | `#A7F3D0` (`emerald-200`) | `#065F46` (`emerald-800`) | `emerald` |
| **Indikator Online** | `#10B981` (`emerald-500`) | `#ECFDF5` (`emerald-50`) | `#A7F3D0` (`emerald-200`) | `#065F46` (`emerald-800`) | `emerald` |
| **Waspada / Timer 5 dtk** | `#D97706` (`amber-600`) | `#FFFBEB` (`amber-50`) | `#FDE68A` (`amber-200`) | `#92400E` (`amber-800`) | `amber` |
| **Alarm Palsu / Offline** | `#64748B` (`slate-500`) | `#F1F5F9` (`slate-100`) | `#CBD5E1` (`slate-300`) | `#334155` (`slate-700`) | `slate` |

### D. Permukaan Netral & Tipografi (Clean Slate)

| Token | Hex | Kelas Tailwind | Kegunaan |
| --- | --- | --- | --- |
| `bg-page` | `#F8FAFC` | `slate-50` | Latar belakang utama layar aplikasi & halaman web |
| `bg-surface` | `#FFFFFF` | `white` | Permukaan kartu, modal, tabel, bottom sheet |
| `bg-muted` | `#F1F5F9` | `slate-100` | Latar chip filter non-aktif, tombol sekunder |
| `bg-video` | `#0F172A` | `slate-900` | Bingkai kontainer *Live View* MJPEG & *snapshot* |
| `border-subtle` | `#E2E8F0` | `slate-200` | Garis pemisah kartu & baris tabel |
| `border-strong` | `#CBD5E1` | `slate-300` | Garis tepi input form & tombol *outline* |
| `text-primary` | `#0F172A` | `slate-900` | Judul, nama lansia, nama ruangan, waktu kejadian |
| `text-secondary` | `#334155` | `slate-700` | Isi teks umum, label form, anggota grup |
| `text-muted` | `#64748B` | `slate-500` | Teks bantu, timestamp relatif, keterangan kecil |

---

## 3. Pemetaan Langsung ke Komponen SIGAP

### A. Status Event (`events.status` di Mobile & Web Admin)
- **`baru`** → Latar baris/kartu `#FEF2F2`, garis kiri tebal `4px` `#DC2626`, badge `#FEE2E2` + teks `#991B1B` **"BELUM DITANGANI"**.
- **`ditangani`** → Latar kartu `#FFFFFF`, badge `#ECFDF5` + teks `#065F46` **"SUDAH DITANGANI"** (tampilkan nama penanggap dengan `#64748B`).
- **`alarm_palsu`** → Latar kartu `#FFFFFF`, badge `#F1F5F9` + teks `#475569` **"ALARM PALSU"**.

### B. Hierarki 4 Tombol di Halaman Detail Event (Mobile Flutter)
Agar keluarga tidak salah tekan saat darurat (target ≤ 2 ketukan dari notifikasi):
1. **Telepon Darurat (SOS)** — *Full-width*, tinggi minimal `56dp`, latar solid `#DC2626`, teks putih tebal + ikon telepon.
2. **Tahan untuk Bicara (Push-to-Talk)** — Saat siaga: latar `#0F766E` (teks putih); **saat ditahan/merekam**: berubah ke `#D97706` (`amber-600`) dengan teks *"Sedang Merekam... Lepas untuk Kirim"* agar pengguna sadar mikrofon aktif.
3. **Sudah Ditangani** — Tombol solid `#047857` (`emerald-700`), teks putih + ikon centang.
4. **Alarm Palsu** — Tombol *outline* netral (latar `#FFFFFF`, border `#CBD5E1`, teks `#475569`) agar tidak menyaingi tombol utama dan mencegah penutupan tidak sengaja.

### C. Warna Overlay Kamera di `cv-worker` (Format BGR OpenCV)
> Catatan penting: OpenCV menggunakan urutan **`(Blue, Green, Red)`**, bukan RGB. Gunakan konstanta ini di `cv-worker/config.py` agar warna kotak pose di *Live View* seragam dengan aplikasi.

| State `cv-worker` | Warna Visual | Hex (Web/App) | Tuple BGR OpenCV `(B, G, R)` |
| --- | --- | --- | --- |
| `NORMAL` | Hijau Emerald | `#10B981` | `(129, 185, 16)` |
| `KEMUNGKINAN_JATUH` (Timer < 5 dtk) | Kuning Amber | `#F59E0B` | `(11, 158, 245)` |
| `JATUH_TERKONFIRMASI` (≥ 5 dtk) | Merah Darurat | `#DC2626` | `(38, 38, 220)` |
| `ZONA_ABAIKAN` (Poligon Kasur/Sofa) | Biru Tenang | `#3B82F6` | `(246, 130, 59)` |

---

## 4. Potongan Kode Siap Pakai

### A. Flutter (`/mobile/lib/theme/app_colors.dart`)

```dart
import 'package:flutter/material.dart';

class AppColors {
  // Brand (Calm Care Teal)
  static const Color primary = Color(0xFF0F766E);
  static const Color primaryDark = Color(0xFF115E59);
  static const Color primarySoft = Color(0xFFF0FDFA);
  static const Color primaryBorder = Color(0xFF99F6E4);

  // Darurat & SOS
  static const Color sos = Color(0xFFDC2626);
  static const Color sosPressed = Color(0xFFB91C1C);
  static const Color dangerSoft = Color(0xFFFEF2F2);
  static const Color dangerBorder = Color(0xFFFECACA);
  static const Color dangerText = Color(0xFF991B1B);

  // Status Operasional
  static const Color safe = Color(0xFF047857);
  static const Color onlineDot = Color(0xFF10B981);
  static const Color safeSoft = Color(0xFFECFDF5);
  static const Color safeText = Color(0xFF065F46);

  static const Color warning = Color(0xFFD97706);
  static const Color warningSoft = Color(0xFFFFFBEB);
  static const Color warningText = Color(0xFF92400E);

  // Permukaan & Teks
  static const Color background = Color(0xFFF8FAFC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceMuted = Color(0xFFF1F5F9);
  static const Color videoFrame = Color(0xFF0F172A);
  static const Color border = Color(0xFFE2E8F0);
  static const Color borderStrong = Color(0xFFCBD5E1);

  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF334155);
  static const Color textMuted = Color(0xFF64748B);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: background,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        primary: primary,
        error: sos,
        surface: surface,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: border),
        ),
      ),
    );
  }
}
```

### B. React + Tailwind CSS (`/web/src/index.css` atau `tailwind.config.js`)

Seluruh warna di atas sudah **100% selaras dengan skala bawaan Tailwind CSS** (`teal`, `red`, `emerald`, `amber`, `slate`), sehingga tim web bisa langsung memakai kelas standar maupun alias CSS variable berikut di `src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-sigap-primary: #0f766e;
  --color-sigap-primary-hover: #115e59;
  --color-sigap-primary-soft: #f0fdfa;

  --color-sigap-sos: #dc2626;
  --color-sigap-sos-hover: #b91c1c;
  --color-sigap-danger-soft: #fef2f2;

  --color-sigap-safe: #047857;
  --color-sigap-safe-soft: #ecfdf5;

  --color-sigap-warning: #d97706;
  --color-sigap-warning-soft: #fffbeb;

  --color-sigap-bg: #f8fafc;
  --color-sigap-surface: #ffffff;
  --color-sigap-border: #e2e8f0;
  --color-sigap-text: #0f172a;
  --color-sigap-muted: #64748b;
}
```

### C. Python CV Worker (`/cv-worker/config.py` — bagian warna HUD)

```python
# Warna overlay OpenCV dalam urutan BGR (Blue, Green, Red)
COLOR_NORMAL = (129, 185, 16)       # #10B981 - Emerald
COLOR_SUSPECTED = (11, 158, 245)    # #F59E0B - Amber (timer < 5 detik)
COLOR_CONFIRMED = (38, 38, 220)     # #DC2626 - Red (jatuh terkonfirmasi)
COLOR_IGNORE_ZONE = (246, 130, 59)  # #3B82F6 - Blue (kasur/sofa)
```

