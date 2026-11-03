import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, User } from "lucide-react";
import api from "../services/api";
import { Button, InlineError, SigapLoader } from "../components/Ui";
import { errorMessage } from "../utils/format";

export default function AuthPage({ onSuccess, sessionExpired = false }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (isRegister && name.trim().length < 2) {
      setError("Nama lengkap harus berisi minimal 2 karakter.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError("");
    try {
      const payload = isRegister
        ? { nama: name.trim(), email: email.trim(), password, role: "admin" }
        : { email: email.trim(), password };
      const { data } = await api.post(isRegister ? "/auth/register" : "/auth/login", payload);
      if (data.user.role !== "admin") {
        setError("Web ini khusus untuk akun admin. Gunakan aplikasi SIGAP untuk akun keluarga.");
        return;
      }
      localStorage.setItem("sigap_token", data.access_token);
      localStorage.setItem("sigap_user", JSON.stringify(data.user));
      onSuccess(data.user);
    } catch (err) {
      setError(errorMessage(err, "Belum dapat terhubung. Periksa koneksi Anda, lalu coba lagi."));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  function changeMode(register) {
    setIsRegister(register);
    setError("");
    setShowPassword(false);
  }

  return (
    <main className="auth-page">
      {loading && (
        <SigapLoader
          overlay
          label={isRegister ? "Membuat akun admin…" : "Masuk ke dashboard SIGAP…"}
          sublabel="Menyiapkan akses pemantauan keluarga."
        />
      )}
      <header className="auth-header">
        <a href="#/beranda" aria-label="SIGAP, ke beranda"><img src="/assets/wordmark.svg" alt="SIGAP" width="118" height="24" /></a>
        <a href="#/beranda" className="auth-back"><ArrowLeft size={16} aria-hidden="true" /> Lihat beranda</a>
      </header>

      <section className="auth-main" aria-labelledby="auth-title">
        <div className="auth-card">
          <h1 id="auth-title">{isRegister ? <>Mulai bersama <em>SIGAP.</em></> : <>Selamat datang <em>kembali.</em></>}</h1>
          <p className="auth-subtitle">{isRegister ? "Buat akun admin untuk menyiapkan pemantauan keluarga." : "Masuk untuk melihat kabar dari grup keluarga Anda."}</p>

          <div className="auth-toggle" aria-label="Pilih masuk atau daftar">
            <button type="button" aria-pressed={!isRegister} className={!isRegister ? "active" : ""} disabled={loading} onClick={() => changeMode(false)}>Masuk</button>
            <button type="button" aria-pressed={isRegister} className={isRegister ? "active" : ""} disabled={loading} onClick={() => changeMode(true)}>Daftar admin</button>
          </div>

          {sessionExpired && !error && <p className="alert alert-warning" role="status">Sesi Anda berakhir. Silakan masuk kembali.</p>}
          {error && <InlineError message={error} />}

          <form className="form-grid auth-form" onSubmit={handleSubmit} aria-busy={loading}>
            {isRegister && (
              <div className="field">
                <label htmlFor="auth-name">Nama lengkap</label>
                <div className="input-with-icon">
                  <User size={19} aria-hidden="true" />
                  <input id="auth-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama admin" required minLength={2} maxLength={100} disabled={loading} />
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="auth-email">Alamat email</label>
              <div className="input-with-icon">
                <Mail size={19} aria-hidden="true" />
                <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@contoh.id" required disabled={loading} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="auth-password">Kata sandi</label>
              <div className="input-with-icon">
                <LockKeyhole size={19} aria-hidden="true" />
                <input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? "Minimal 6 karakter" : "Masukkan kata sandi"} minLength={isRegister ? 6 : undefined} maxLength={100} required disabled={loading} aria-describedby={isRegister ? "password-hint" : undefined} />
                <button className="password-toggle" type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)} disabled={loading}>
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              {isRegister && <p className="field-hint" id="password-hint">Gunakan minimal 6 karakter.</p>}
            </div>
            <Button type="submit" loading={loading} icon={ArrowRight} className="auth-submit">{loading ? "Memproses…" : isRegister ? "Buat akun admin" : "Masuk sebagai admin"}</Button>
          </form>

          <p className="auth-note">Web ini khusus admin. Anggota keluarga memakai aplikasi SIGAP di Android.</p>
        </div>
      </section>
      <p className="auth-copyright">SIGAP · Sistem Deteksi Jatuh pada Lansia</p>
    </main>
  );
}
