import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, Camera, Check, CheckCheck, ChevronDown, LockKeyhole, Menu, Phone, ScanLine, Users, X } from "lucide-react";
import "./LandingPage.css";

const navigation = [
  ["tentang", "Tentang"],
  ["cara-kerja", "Cara kerja"],
  ["untuk-keluarga", "Untuk keluarga"],
  ["pertanyaan", "Tanya jawab"],
];

const steps = [
  {
    title: "Kamera mengenali kemungkinan jatuh.",
    description: "SIGAP membaca postur dan gerakan tubuh melalui kamera. Posisi jatuh yang menetap menjadi pemicu peringatan.",
    image: "/assets/onboarding-1-deteksi.svg",
    alt: "Ilustrasi kamera mengenali posisi tubuh lansia melalui titik-titik postur.",
    caption: "Pemantauan pasif, tanpa perangkat yang harus dikenakan lansia.",
  },
  {
    title: "Kabar sampai ke grup keluarga.",
    description: "Peringatan dikirim ke aplikasi keluarga, disertai lokasi kamera dan cuplikan gambar kejadian agar ada konteks untuk merespons.",
    image: "/assets/onboarding-2-notifikasi.svg",
    alt: "Ilustrasi peringatan dari rumah yang diterima melalui ponsel keluarga.",
    caption: "Satu kejadian dapat diketahui semua anggota grup keluarga.",
  },
  {
    title: "Keluarga menentukan langkah berikutnya.",
    description: "Lihat kondisi melalui kamera, hubungi kontak keluarga, lalu tandai kejadian yang sudah ditangani agar anggota lain ikut mengetahui.",
    image: "/assets/onboarding-3-aksi.svg",
    alt: "Ilustrasi ponsel dengan cuplikan kejadian, panggilan, dan tanda sudah ditangani.",
    caption: "Informasi dan tindak lanjut terhubung dalam satu alur.",
  },
];

const features = [
  { icon: Camera, title: "Lihat apa yang terjadi", text: "Cuplikan kejadian dan tampilan langsung kamera membantu keluarga memeriksa situasi di rumah." },
  { icon: Phone, title: "Hubungi orang yang bisa membantu", text: "Kontak darurat yang ditentukan keluarga bisa dihubungi langsung dari aplikasi, tanpa mencari nomor saat panik." },
  { icon: CheckCheck, title: "Bagikan status penanganan", text: "Tandai kejadian yang sudah ditangani atau alarm palsu. Riwayatnya tetap bisa dilihat anggota grup." },
];

const questions = [
  ["Apa itu SIGAP?", "SIGAP adalah proyek sistem deteksi jatuh pada lansia berbasis computer vision. Kamera membantu mengenali kemungkinan jatuh, lalu sistem mengirim peringatan ke keluarga melalui aplikasi. Tujuannya membantu keluarga mengetahui kejadian dan menindaklanjutinya."],
  ["Apakah lansia harus memakai alat khusus?", "Tidak ada perangkat yang perlu dikenakan atau tombol yang harus ditekan oleh lansia. Pemantauan menggunakan kamera pada area yang telah disiapkan. Posisi kamera, pencahayaan, dan pandangan yang tidak terhalang memengaruhi proses deteksi."],
  ["Siapa yang bisa melihat kamera dan kejadian?", "Akses kamera dan riwayat kejadian dibatasi untuk anggota grup keluarga terkait. Anggota bergabung melalui undangan grup, sehingga pemantauan dilakukan dalam lingkup keluarga."],
  ["Apakah SIGAP sudah bisa digunakan dengan semua CCTV?", "SIGAP saat ini merupakan prototipe. Pengujian menggunakan webcam atau video simulasi; kompatibilitas dengan CCTV IP masih memerlukan pengembangan dan pengujian. Pengiriman notifikasi juga membutuhkan koneksi internet dan layanan notifikasi yang aktif."],
  ["Apakah peringatan otomatis memanggil bantuan darurat?", "Tidak. Keluarga menerima informasi untuk memeriksa kondisi dan mengambil tindakan. Fitur panggilan membuka nomor kontak yang sudah disiapkan keluarga. SIGAP tidak otomatis menghubungi ambulans atau menggantikan pendampingan langsung."],
];

/** Tandai elemen untuk animasi masuk/keluar saat scroll. delay (ms) dipakai untuk efek berurutan. */
function reveal(delay = 0) {
  return { "data-reveal": "", style: { "--reveal-delay": `${delay}ms` } };
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const menuButton = useRef(null);
  const currentStep = steps[activeStep];

  useEffect(() => {
    document.documentElement.classList.add("landing-scroll");
    function closeOnNavigation() { setMenuOpen(false); }
    window.addEventListener("hashchange", closeOnNavigation);
    return () => {
      document.documentElement.classList.remove("landing-scroll");
      window.removeEventListener("hashchange", closeOnNavigation);
    };
  }, []);

  // Animasi in/out: kelas is-visible dipasang saat elemen masuk layar dan dilepas saat keluar.
  useEffect(() => {
    const items = document.querySelectorAll(".landing-page [data-reveal]");
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle("is-visible", entry.isIntersecting));
    }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <div className="landing-page" id="beranda">
      <a className="landing-skip" href="#konten">Langsung ke konten</a>

      <header className="landing-header">
        <div className="landing-container landing-nav-row">
          <a href="#beranda" className="landing-brand" aria-label="SIGAP, kembali ke awal" onClick={() => setMenuOpen(false)}>
            <img src="/assets/wordmark.svg" alt="SIGAP" width="118" height="24" />
          </a>
          <nav id="landing-navigation" className={`landing-navigation${menuOpen ? " is-open" : ""}`} aria-label="Navigasi halaman publik">
            {navigation.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}
          </nav>
          <div className="landing-nav-actions">
            <a href="#/login" className="landing-button landing-button-sm">Masuk</a>
            <button ref={menuButton} type="button" className="landing-menu-toggle" aria-label={menuOpen ? "Tutup navigasi" : "Buka navigasi"} aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <main id="konten" tabIndex={-1}>
        {/* Hero setinggi satu layar: teks di atas, ilustrasi mengisi sisa tinggi */}
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-container landing-hero-copy">
            <h1 id="hero-title" {...reveal(0)}>Saat lansia jatuh,<br />keluarga <em>segera tahu.</em></h1>
            <p className="landing-hero-description" {...reveal(120)}>SIGAP mengubah kamera di rumah menjadi pendeteksi jatuh, lalu mengirim peringatan ke HP keluarga dalam hitungan detik.</p>
            <div className="landing-hero-actions" {...reveal(240)}>
              <a className="landing-button" href="#/login">Masuk ke dashboard</a>
              <a className="landing-round-button" href="#cara-kerja" aria-label="Lihat cara kerja"><ArrowDown size={18} aria-hidden="true" /></a>
            </div>
          </div>

          <figure className="landing-hero-visual">
            {/* Deretan ilustrasi: tengah paling besar, makin ke luar makin kecil. Ukuran dihitung dari sisa tinggi hero */}
            <div className="landing-hero-row">
              <img {...reveal(560)} className="landing-hero-img is-outer" src="/assets/empty-belum-grup.svg" alt="" width="400" height="300" />
              <img {...reveal(460)} className="landing-hero-img is-inner" src="/assets/empty-semua-aman.svg" alt="" width="400" height="300" />
              <img {...reveal(340)} className="landing-hero-img is-main" src="/assets/onboarding-1-deteksi.svg" alt="Kamera memantau gerakan lansia di rumah tanpa perangkat yang dikenakan." width="400" height="300" fetchPriority="high" />
              <img {...reveal(460)} className="landing-hero-img is-inner" src="/assets/onboarding-2-notifikasi.svg" alt="" width="400" height="300" />
              <img {...reveal(560)} className="landing-hero-img is-outer" src="/assets/onboarding-3-aksi.svg" alt="" width="400" height="300" />
            </div>
          </figure>
        </section>

        <div className="landing-principles">
          <div className="landing-container landing-principles-inner">
            <p {...reveal(0)}><ScanLine size={20} aria-hidden="true" /> Tanpa alat yang dikenakan</p>
            <p {...reveal(100)}><Users size={20} aria-hidden="true" /> Terhubung dalam grup keluarga</p>
            <p {...reveal(200)}><Bell size={20} aria-hidden="true" /> Peringatan dengan konteks kejadian</p>
          </div>
        </div>

        <section id="tentang" className="landing-container landing-section landing-about" aria-labelledby="about-title">
          <div>
            <h2 id="about-title" {...reveal(0)}>Tidak selalu serumah. <em>Tetap bisa ikut menjaga.</em></h2>
          </div>
          <div className="landing-about-copy" {...reveal(150)}>
            <p>Kita tidak selalu bisa berada di dekat orang tua. Saat mereka beraktivitas sendiri di rumah, kejadian jatuh bisa luput dari perhatian keluarga.</p>
            <p>SIGAP membantu memperpendek jarak antara kejadian dan respons. Kamera mengenali kemungkinan jatuh, keluarga menerima kabar, lalu memeriksa kondisi dan mengambil tindakan.</p>
            <a href="#untuk-keluarga" className="landing-text-link">Lihat peran keluarga <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
        </section>

        <section id="cara-kerja" className="landing-section landing-how" aria-labelledby="how-title">
          <div className="landing-container">
            <div className="landing-section-heading">
              <h2 id="how-title" {...reveal(0)}>Dari kamera di rumah, <em>ke langkah nyata keluarga.</em></h2>
            </div>
            <div className="landing-flow">
              <div {...reveal(100)} className="landing-step-list" aria-label="Tahapan cara kerja SIGAP">
                {steps.map((step, index) => (
                  <button key={step.title} type="button" className={`landing-step${activeStep === index ? " is-active" : ""}`} aria-pressed={activeStep === index} aria-controls="landing-flow-illustration" onClick={() => setActiveStep(index)}>
                    <span className="landing-step-number">0{index + 1}</span>
                    <span><strong>{step.title}</strong><span className="landing-step-description">{step.description}</span></span>
                  </button>
                ))}
              </div>
              <figure {...reveal(200)} id="landing-flow-illustration" className="landing-flow-illustration" aria-live="polite" aria-atomic="true">
                <img key={currentStep.image} src={currentStep.image} alt={currentStep.alt} width="400" height="300" loading="lazy" />
                <figcaption>{currentStep.caption}</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="untuk-keluarga" className="landing-container landing-section landing-family" aria-labelledby="family-title">
          <div className="landing-family-visual" {...reveal(0)}>
            <img src="/assets/empty-belum-grup.svg" alt="Ilustrasi anggota keluarga yang terhubung melalui undangan grup." width="400" height="300" loading="lazy" />
            <ol className="landing-timeline" aria-label="Contoh alur tindak lanjut grup keluarga">
              <li><span className="landing-timeline-icon"><Bell size={14} aria-hidden="true" /></span><div><strong>Peringatan diterima</strong><p>Semua anggota grup mendapat kabar.</p></div></li>
              <li><span className="landing-timeline-icon"><Phone size={14} aria-hidden="true" /></span><div><strong>Keluarga memeriksa kondisi</strong><p>Hubungi kontak yang sudah disiapkan.</p></div></li>
              <li><span className="landing-timeline-icon is-done"><Check size={14} aria-hidden="true" /></span><div><strong>Kejadian ditandai ditangani</strong><p>Anggota lain ikut mengetahui.</p></div></li>
            </ol>
          </div>
          <div>
            <h2 id="family-title" {...reveal(100)}>Tahu kondisinya. <em>Jelas tindak lanjutnya.</em></h2>
            <p className="landing-section-description" {...reveal(180)}>Peringatan hanyalah awal. SIGAP menghubungkan informasi yang dibutuhkan keluarga untuk merespons bersama.</p>
            <div className="landing-features">
              {features.map(({ icon: Icon, title, text }, index) => (
                <div key={title} className="landing-feature" {...reveal(260 + index * 100)}>
                  <span className="landing-feature-icon"><Icon size={18} aria-hidden="true" /></span>
                  <div><h3>{title}</h3><p>{text}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-privacy" aria-labelledby="privacy-title">
          <div className="landing-container landing-privacy-inner" {...reveal(0)}>
            <span className="landing-privacy-icon"><LockKeyhole size={22} strokeWidth={1.5} aria-hidden="true" /></span>
            <div>
              <h2 id="privacy-title">Kabar dari rumah, <em>untuk orang yang tepat.</em></h2>
              <p>Video tidak disimpan. Kamera dan kejadian hanya dapat diakses anggota grup terkait, dan keluarga menentukan siapa yang bergabung melalui undangan.</p>
            </div>
          </div>
        </section>

        <section id="pertanyaan" className="landing-container landing-section landing-faq" aria-labelledby="faq-title">
          <div>
            <h2 id="faq-title" {...reveal(0)}>Kenali <em>lebih dekat.</em></h2>
            <p className="landing-section-description" {...reveal(100)}>Beberapa hal yang perlu diketahui tentang SIGAP dan pengembangannya.</p>
          </div>
          <div className="landing-questions">
            {questions.map(([question, answer], index) => <details key={question} {...reveal(index * 80)}><summary>{question}<ChevronDown size={18} aria-hidden="true" /></summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section className="landing-container landing-closing" aria-labelledby="closing-title">
          <h2 id="closing-title" {...reveal(0)}>Kepedulian dimulai dari <em>tahu.</em></h2>
          <p {...reveal(120)}>Teknologi membantu memberi kabar. Keluarga yang mengambil peran.</p>
          <div className="landing-hero-actions" {...reveal(240)}>
            <a href="#/login" className="landing-button">Masuk ke dashboard</a>
            <a href="#cara-kerja" className="landing-text-link">Jelajahi cara kerja <ArrowUpRight size={16} aria-hidden="true" /></a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-top">
            <div className="landing-footer-brand">
              <a href="#beranda" aria-label="SIGAP, kembali ke awal"><img src="/assets/wordmark.svg" alt="SIGAP" width="118" height="24" loading="lazy" /></a>
              <p>Sistem deteksi jatuh pada lansia.<br />Menghubungkan rumah dan kepedulian keluarga.</p>
            </div>
            <nav aria-label="Navigasi footer">{navigation.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
          </div>
          <div className="landing-footer-bottom">
            <span>SIGAP · Prototipe pemantauan lansia berbasis computer vision</span>
            <a href="#beranda">Kembali ke atas <ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>
        </div>
      </footer>
    </div>
  );
}
