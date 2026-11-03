# Referensi UI SIGAP (Web dan Mobile)

3 November 2026 · Amir

Kumpulan referensi alur, tampilan, dan animasi untuk aplikasi keluarga (Flutter) dan web admin (React) SIGAP.

## 1. Aplikasi nyata untuk ditiru alurnya

Referensi paling realistis adalah aplikasi yang sudah dipakai jutaan orang: install di HP tim, coba alurnya, lalu screenshot atau rekam layar (sekaligus menangkap animasinya).

| Aplikasi | Yang ditiru untuk SIGAP | Link |
| --- | --- | --- |
| Life360 | Konsep "lingkaran keluarga": buat grup, undang anggota dengan kode, notifikasi ke semua anggota | [life360.com](https://www.life360.com/no-no/learn/what-does-life360-do) |
| Ring | Snapshot di beranda yang membuka live view, tombol mikrofon untuk bicara (Two-Way Talk), dan riwayat kejadian per kamera | [Panduan Live View Ring](https://ring.com/au/en/support/articles/sjo2f/Using-Live-View) |
| Imou Life | Beranda dengan status perangkat dan beberapa feed kamera, timeline rekaman dengan thumbnail kejadian, two-way talk, dan pengaturan hak akses admin rumah | [App Store Imou Life](https://apps.apple.com/app/id1071165451) |
| Google Home (Nest) | Daftar aktivitas kamera dengan thumbnail dan notifikasi deteksi | Cari "Google Home" di Play Store |
| EZVIZ, Xiaomi Home | Tampilan kamera online/offline dan tombol bicara, banyak dipakai di Indonesia | Cari namanya di Play Store |
| Halodoc | UI kesehatan berbahasa Indonesia yang bersih dan mudah dibaca orang tua | Cari "Halodoc" di Play Store |
| Layar SOS bawaan Android/iPhone | Layar darurat: tombol besar, hitung mundur, kontak darurat | Pengaturan HP → Keamanan dan darurat |

Di Ring, mengetuk pratinjau kamera di dasbor kini membuka timeline riwayat kejadian perangkat itu, bukan langsung live view ([Ring](https://ring.com/au/en/support/articles/sjo2f/Using-Live-View)). Pola ini cocok untuk SIGAP: kartu kamera → riwayat → detail kejadian → live view.

## 2. Inspirasi desain mobile

Shot Dribbble paling cocok untuk gaya visual dan micro-interaction; banyak yang berupa video, jadi animasinya ikut terlihat. Ambil gayanya, tapi alurnya tetap ikuti aplikasi nyata di bagian 1.

| Referensi | Relevansi untuk SIGAP | Link |
| --- | --- | --- |
| Kinwell (10am space): pusat notifikasi dan UI kit aplikasi keluarga untuk perawatan lansia | Paling dekat dengan SIGAP: triase notifikasi kesehatan, push notification, dan dasbor pemantauan untuk keluarga | [dribbble.com/10amspace](https://dribbble.com/10amspace?page=2) |
| Home Security Mobile App (SK Radwoan) | Kamera keamanan, alarm, rekaman, dan panel kontrol keamanan | [Dribbble Radwoan](https://dribbble.com/Radwoan-2023/tags/monitor) |
| IoT Smart Home Security App Design (CMARIX) | Tata letak aplikasi keamanan rumah pintar | [Koleksi smart home app](https://dribbble.com/zera_fath/collections/7237368-smart-home-app) |
| Koleksi Caregiver (Yemzahi): login, kalender, dasbor perawatan lansia | Contoh layar login dan dasbor yang ramah keluarga | [Koleksi Caregiver](https://dribbble.com/Yemzahidesigns/collections/7607227-Caregiver) |
| Caregiving App (Softteco Design): dasbor mobile dan web | Satu produk dengan versi mobile dan web, sama seperti SIGAP | [Softteco Design](https://dribbble.com/SofttecoDesign) |
| Elli App (Dtail Studio): eldercare, aksesibilitas, beberapa shot beranimasi | Tipografi besar dan kontras yang ramah lansia | [Dtail Studio](https://dribbble.com/dtailstudio?page=2) |
| MyWisdom (Phenomenon Studio): studi kasus lengkap, dari moodboard sampai UI | Cara tim desain profesional merancang aplikasi pemantauan lansia: mengurangi gangguan dan menonjolkan momen yang butuh aksi cepat | [Studi kasus MyWisdom](https://phenomenonstudio.com/projects/mywisdom-a-digital-platform-for-safer-more-connected-aging) |

Kata kunci pencarian tambahan di Dribbble dan Behance: "elderly care app", "fall detection app", "caregiver app", "home security app", "cctv app", "family safety app".

## 3. Referensi dasbor web admin

Untuk web admin, contoh terbaik adalah aplikasi NVR (perekam CCTV) open-source dan blok dasbor shadcn/ui yang bisa langsung dipakai di React + Tailwind.

| Referensi | Yang ditiru untuk SIGAP | Link |
| --- | --- | --- |
| Frigate NVR: halaman Review | Grid thumbnail kejadian di samping timeline; arahkan kursor atau geser untuk memutar pratinjau; kejadian dibagi menjadi alert dan detection | [Rilis Frigate 0.14](https://github.com/blakeblackshear/frigate/releases/tag/v0.14.0-beta3), [Dokumentasi Review](https://docs.frigate.video/configuration/review) |
| Frigate NVR: halaman History | Klik satu kejadian langsung membuka rekaman di detik sebelum aktivitas; daftar kejadian per kamera di samping pemutar | [Dokumentasi History](https://docs.frigate.video/usage/history) |
| Lexoh Camera Management | Tiga tab (Live, NVR, Events), pilihan tata letak grid kamera (1, 4, 9, 16), dan izin akses per peran | [Dokumentasi Lexoh](https://www.lexoh.com/en/documentation/cameras) |
| Caregiving App: Web Dashboard (Softteco Design) | Dasbor web perawatan dengan kartu, kalender, dan menu samping | [Softteco Design](https://dribbble.com/SofttecoDesign) |
| shadcn/ui Blocks (dashboard-01) | Kerangka dasbor siap pakai: sidebar, kartu statistik, tabel data | [shadcn Blocks](https://ui.shadcn.com/docs/_blocks) |
| Contoh sidebar shadcn (termasuk sidebar beranimasi) | Navigasi samping web admin: Grup, Kamera, Kejadian, Anggota | [shadcn/studio](https://shadcnstudio.com/blog/shadcn-sidebar-examples/), [Shadcnblocks Sidebar](https://www.shadcnblocks.com/blocks/sidebar) |

Usulan tata letak web admin SIGAP berdasarkan referensi di atas: sidebar kiri, baris kartu ringkasan (jumlah kamera online, kejadian hari ini, belum ditangani), grid kamera 2×2, dan tabel kejadian terbaru dengan status berwarna.

## 4. Animasi

Animasi cukup di lima momen penting: layar peringatan jatuh, tombol telepon darurat, "sudah ditangani", live view yang sedang dimuat, dan event baru di web admin.

**Animasi siap pakai (LottieFiles)**

| Kebutuhan SIGAP | Kategori | Link |
| --- | --- | --- |
| Layar peringatan jatuh | Sirene | [Free siren animations](https://lottiefiles.com/free-animations/siren) |
| Layar peringatan (alternatif) | Sirene ambulans | [Free ambulance siren](https://lottiefiles.com/free-animations/ambulance-siren) |
| Tombol telepon darurat | Emergency hotline (36 animasi gratis) | [Free emergency hotline](https://lottiefiles.com/free-animations/emergency-hotline) |
| Notifikasi masuk, lonceng, tanda seru | Pack Notification & Alert (12 animasi) | [Notification & Alert pack](https://lottiefiles.com/marketplace/notification-alert-animation-pack_369584) |
| "Sudah ditangani" | Success loader (174 animasi gratis) | [Free success loader](https://lottiefiles.com/free-animations/success-loader) |

Animasi di halaman marketplace bisa berbayar, jadi cek label Free sebelum mengunduh. Warna animasi bisa diganti ke navy `#003480` dan biru `#2F9AF8` lewat editor LottieFiles sebelum diunduh.

**Library animasi**

| Platform | Library | Kegunaan | Link |
| --- | --- | --- | --- |
| Flutter | flutter_animate | Efek siap pakai (fade, scale, slide, shake, shimmer) dengan satu baris kode, misalnya `.animate().fade().scale()`; efek shimmer bisa dipakai untuk skeleton live view | [Dokumentasi flutter_animate](https://pub.dev/documentation/flutter_animate/latest/) |
| Flutter | lottie | Memutar file Lottie dari LottieFiles | Cari "lottie" di pub.dev |
| React | Motion (dulu Framer Motion) | Animasi masuk baris event, transisi halaman; instal dengan `npm install motion` dan impor dari `motion/react` | [motion.dev/react](https://motion.dev/react) |
| React | @lottiefiles/dotlottie-react | Memutar file .lottie di web admin | [Contoh pemakaian](https://skills.sh/petbrains/mvp-builder/frontend-lottie) |

**Contoh animasi di referensi lain:** sidebar shadcn beranimasi di [shadcn/studio](https://shadcnstudio.com/blog/shadcn-sidebar-examples/) dan shot Elli App yang berlabel animation di [Dtail Studio](https://dribbble.com/dtailstudio?page=2).

## 5. UI kit dan komponen

UI kit mempercepat pembuatan mockup sebelum hari H dan menjaga tampilan tetap konsisten saat coding.

| Kit | Cocok untuk | Catatan | Link |
| --- | --- | --- | --- |
| Material 3 Design Kit (Google) | Mockup aplikasi Flutter | Kit Figma resmi Google, dipakai lebih dari 1 juta pengguna Figma Community; komponennya sama dengan widget Material 3 di Flutter | [Ulasan kit](https://uithings.com/free-figma-ui-kits), cari "Material 3 Design Kit" di Figma Community |
| Material Theme Builder | Membuat skema warna Material 3 dari warna logo `#003480` | Plugin Figma pendamping Material 3 Design Kit | [Blog Material Design](https://m2.material.io/blog/designer-toolbox-figma-android-studio-relay) |
| Panduan Material Design 3 | Aturan komponen, warna, dan motion | Termasuk pedoman motion untuk durasi dan easing | [m3.material.io](https://m3.material.io/) |
| shadcn/ui Design System | Mockup dan kode web admin React | Tersedia versi Figma dan blok kode siap salin | [shadcn Blocks](https://ui.shadcn.com/docs/_blocks) |
| Flowbite Design System | Komponen web berbasis Tailwind CSS | Alternatif shadcn jika tim lebih nyaman dengan Tailwind murni | Disebut di [daftar UI kit gratis](https://uithings.com/free-figma-ui-kits) |

Tip: buat mockup cukup untuk 5 layar utama (beranda, detail kejadian, live view, grup keluarga, dasbor web). Lebih dari itu tidak sebanding dengan waktu persiapan.

## 6. Peta referensi per layar SIGAP

Setiap layar cukup punya satu referensi alur dan satu referensi gaya, supaya tim tidak tenggelam dalam inspirasi.

| Layar SIGAP | Referensi alur | Referensi gaya / animasi |
| --- | --- | --- |
| Onboarding dan login | Halodoc | Ilustrasi SIGAP + login Koleksi Caregiver (Yemzahi) |
| Gabung grup keluarga | Life360 (lingkaran keluarga, kode undangan) | Kinwell (10am space) |
| Beranda kamera | Imou Life (status perangkat + feed kamera) | Home Security Mobile App (Radwoan) |
| Notifikasi dan detail kejadian | Ring (snapshot → riwayat → live view) | Kinwell Notification Center + Lottie sirene |
| Live view + push-to-talk | Ring dan Imou (tombol mikrofon) | Efek shimmer flutter_animate untuk loading |
| Tombol telepon darurat | Layar SOS bawaan Android/iPhone | Lottie emergency hotline |
| "Sudah ditangani" | Ring (status kejadian) | Lottie success loader |
| Dasbor web admin | Frigate Review dan History, Lexoh (grid kamera) | shadcn dashboard + Motion untuk baris event baru |

## 7. Catatan lisensi dan TOR

Referensi boleh dipakai sebagai inspirasi alur dan tata letak, tetapi desain orang lain tidak boleh disalin persis karena TOR melarang plagiarisme (D, P.2).

- **Shot Dribbble/Behance dan aplikasi komersial:** hanya untuk inspirasi; jangan menyalin layar atau aset grafisnya.
- **Animasi LottieFiles:** cek label Free dan lisensi tiap animasi, lalu catat sumbernya di README repo (TOR H.3).
- **Library (flutter_animate, lottie, Motion, shadcn/ui):** open-source dan boleh dipakai sesuai TOR H.2; tetap cantumkan di daftar dependensi README.
- **Aset SIGAP sendiri** (logo, ilustrasi, ikon aplikasi) adalah identitas visual utama; referensi di atas menyesuaikan dengan aset ini, bukan sebaliknya.
