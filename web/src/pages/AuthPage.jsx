import { useState } from "react";
import { ShieldAlert, Lock, Mail, User } from "lucide-react";
import api, { BACKEND_URL } from "../services/api";

export default function AuthPage({ onSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister
        ? { nama, email, password, role: "admin" }
        : { email, password };

      const { data } = await api.post(endpoint, payload);
      if (data.user.role !== "admin") {
        setError("Dasbor web ini khusus untuk akun Admin. Gunakan aplikasi Android untuk akun Keluarga.");
        setLoading(false);
        return;
      }

      localStorage.setItem("sigap_token", data.access_token);
      localStorage.setItem("sigap_user", JSON.stringify(data.user));
      onSuccess(data.user);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          `Tidak dapat terhubung ke server (${BACKEND_URL}). Pastikan backend aktif.`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-teal-700 px-6 py-7 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <ShieldAlert className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SIGAP Web Admin</h1>
              <p className="text-sm text-teal-100">
                Pemantauan Deteksi Jatuh Lansia & Grup Keluarga
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setError("");
              }}
              className={`flex-1 rounded-md py-2 transition ${
                !isRegister ? "bg-white text-teal-700 shadow-xs" : "text-slate-600"
              }`}
            >
              Masuk Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegister(true);
                setError("");
              }}
              className={`flex-1 rounded-md py-2 transition ${
                isRegister ? "bg-white text-teal-700 shadow-xs" : "text-slate-600"
              }`}
            >
              Daftar Admin Baru
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">
              {error}
            </div>
          )}

          {isRegister && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nama Lengkap Admin
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Mis. Budi Santoso"
                  className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Alamat Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@sigap.id"
                className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {loading
              ? "Memproses..."
              : isRegister
              ? "Buat Akun Admin"
              : "Masuk ke Dasbor"}
          </button>

          <p className="text-center text-xs text-slate-500">
            Server API: <code className="font-mono text-slate-700">{BACKEND_URL}</code>
          </p>
        </form>
      </div>
    </div>
  );
}

