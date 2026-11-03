import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  Camera,
  Cpu,
  Database,
  HardDrive,
  Lock,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";
import api from "../services/api";
import { MetricCard, Pill } from "../components/DashboardCards";
import { Button, InlineError } from "../components/Ui";

export default function SaasOverviewPage({ onOpenSimulasi, onSavedEmergencyContact }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [tenantQuery, setTenantQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  // Manajemen Nomor WhatsApp Darurat oleh Admin
  const [waNumberInput, setWaNumberInput] = useState("+62 895-6006-86367");
  const [waTargetGroupId, setWaTargetGroupId] = useState("all");
  const [savingWa, setSavingWa] = useState(false);

  const fetchOverview = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const { data } = await api.get("/admin/saas-overview");
      setOverview(data);
      if (!isSilent && data?.emergency_whatsapp) {
        setWaNumberInput(data.emergency_whatsapp);
      }
      setErrorMsg("");
      setLastUpdated(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " WIB"
      );
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail || "Gagal memuat analitik performa SaaS."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(false);
    const interval = setInterval(() => fetchOverview(true), 8000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const kpis = overview?.kpis || {
    total_tenants: 0,
    total_keluarga_users: 0,
    fcm_ready_users: 0,
    total_cameras: 0,
    online_cameras: 0,
    camera_uptime_pct: 0,
    total_events: 0,
    events_today: 0,
    handled_events: 0,
    unhandled_events: 0,
    false_alarm_events: 0,
    response_rate_pct: 100,
    ai_precision_pct: 100,
    avg_confidence_pct: 94.5,
    total_voice_messages: 0,
  };

  const dailyTrend = overview?.daily_trend || [];
  const maxDailyCount = useMemo(
    () => Math.max(1, ...dailyTrend.map((d) => d.total || 0)),
    [dailyTrend]
  );

  const filteredTenants = useMemo(() => {
    const list = overview?.tenants || [];
    const q = tenantQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.tenant_code.toLowerCase().includes(q) ||
        t.nama_grup.toLowerCase().includes(q) ||
        t.owner_name.toLowerCase().includes(q)
    );
  }, [overview, tenantQuery]);

  async function handleSaveEmergencyWa(e, overrideGroupId = null, overridePhone = null) {
    if (e) e.preventDefault();
    const phoneToSave = (overridePhone ?? waNumberInput).trim();
    if (phoneToSave.length < 5) {
      setErrorMsg("Masukkan nomor WhatsApp darurat yang valid.");
      return;
    }
    setSavingWa(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const effGroupId =
        overrideGroupId !== null
          ? overrideGroupId
          : waTargetGroupId === "all"
          ? null
          : Number(waTargetGroupId);
      const { data } = await api.patch("/admin/emergency-contact", {
        kontak_darurat: phoneToSave,
        group_id: effGroupId,
      });
      setWaNumberInput(data.emergency_whatsapp || phoneToSave);
      setSuccessMsg(data.message || "Nomor WhatsApp Darurat berhasil disimpan!");
      await fetchOverview(true);
      onSavedEmergencyContact?.();
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail || "Gagal menyimpan nomor WhatsApp darurat."
      );
    } finally {
      setSavingWa(false);
    }
  }

  return (
    <div className="space-y-6">
      <InlineError message={errorMsg} onRetry={() => fetchOverview(false)} />

      {successMsg && (
        <div
          role="status"
          className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-medium text-emerald-900"
        >
          <span>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg("")}
            className="text-xs font-semibold text-emerald-800 underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Banner Konsol Performa SaaS & Lab Simulasi */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                Performa SaaS &amp; Privasi Kode Keluarga
              </h2>
              {lastUpdated && <Pill tone="success">Sinkron {lastUpdated}</Pill>}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Tayangan CCTV &amp; identitas lansia di aplikasi Mobile dikunci dengan{" "}
              <strong className="text-gray-800">Kode Keluarga</strong> masing-masing.
              Admin dapat memantau kesehatan sistem, nomor WA darurat, dan menguji AI di Lab Simulasi.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={refreshing}
            onClick={() => fetchOverview(false)}
          >
            Segarkan
          </Button>
          {onOpenSimulasi && (
            <Button icon={Sparkles} onClick={onOpenSimulasi}>
              Buka Lab Simulasi AI
            </Button>
          )}
        </div>
      </div>

      {/* PANEL MANAJEMEN NOMOR WHATSAPP DARURAT (+62 895-6006-86367) */}
      <form
        onSubmit={(e) => handleSaveEmergencyWa(e)}
        className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Pill tone="success">
              <Phone className="size-3.5" /> Integrasi WhatsApp Darurat &amp; Lokasi CCTV
            </Pill>
            <h3 className="mt-2 text-lg font-semibold text-gray-900">
              Kelola Nomor WhatsApp Darurat Keluarga &amp; Tim Medis
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Nomor ini tersinkron real-time ke aplikasi HP saat keluarga menekan tombol{" "}
              <strong className="text-gray-800">Kirim WA Darurat + Lokasi CCTV</strong> maupun{" "}
              <strong className="text-gray-800">Telepon Darurat</strong>.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setWaNumberInput("+62 895-6006-86367");
              handleSaveEmergencyWa(null, null, "+62 895-6006-86367");
            }}
          >
            Set Default: +62 895-6006-86367
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-12">
          <div className="field sm:col-span-5">
            <label htmlFor="saas-wa-input">Nomor WhatsApp Darurat</label>
            <input
              id="saas-wa-input"
              type="text"
              value={waNumberInput}
              onChange={(e) => setWaNumberInput(e.target.value)}
              placeholder="+62 895-6006-86367"
            />
          </div>

          <div className="field sm:col-span-4">
            <label htmlFor="saas-wa-target">Terapkan ke Tenant Grup</label>
            <select
              id="saas-wa-target"
              value={waTargetGroupId}
              onChange={(e) => {
                const val = e.target.value;
                setWaTargetGroupId(val);
                if (val !== "all") {
                  const found = (overview?.tenants || []).find(
                    (t) => String(t.group_id) === val
                  );
                  if (found?.kontak_darurat) {
                    setWaNumberInput(found.kontak_darurat);
                  }
                }
              }}
            >
              <option value="all">Semua Grup Keluarga (Global)</option>
              {(overview?.tenants || []).map((t) => (
                <option key={t.group_id} value={String(t.group_id)}>
                  {t.nama_grup} ({t.tenant_code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end sm:col-span-3">
            <Button type="submit" loading={savingWa} className="w-full">
              {savingWa ? "Menyimpan…" : "Simpan Nomor WA"}
            </Button>
          </div>
        </div>
      </form>

      {/* 4 Kartu KPI Utama Gaya TailAdmin */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <MetricCard
          icon={Building2}
          tone="brand"
          label="Tenant Keluarga Aktif"
          loading={loading}
          value={kpis.total_tenants}
          badge={<Pill>{kpis.total_keluarga_users} akun HP</Pill>}
        />
        <MetricCard
          icon={Camera}
          tone="brand"
          label="Ketersediaan Node CCTV"
          loading={loading}
          value={`${kpis.camera_uptime_pct}%`}
          badge={
            <Pill tone="success">
              {kpis.online_cameras}/{kpis.total_cameras} online
            </Pill>
          }
        />
        <MetricCard
          icon={Cpu}
          tone="neutral"
          label="Presisi Model AI CV"
          loading={loading}
          value={`${kpis.ai_precision_pct}%`}
          badge={<Pill tone="dark">Keyakinan {kpis.avg_confidence_pct}%</Pill>}
        />
        <MetricCard
          icon={Activity}
          tone="neutral"
          label="Tingkat Respons Keluarga"
          loading={loading}
          value={`${kpis.response_rate_pct}%`}
          badge={<Pill>{kpis.total_voice_messages} suara PTT</Pill>}
        />
      </div>

      {/* Grafik Tren 7 Hari & SLA */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <section className="col-span-12 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 xl:col-span-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Tren Deteksi &amp; Respons (7 Hari Terakhir)
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Agregat seluruh grup keluarga yang dipantau sistem
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-gray-900" />
                Deteksi ({kpis.total_events})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                Ditangani ({kpis.handled_events})
              </span>
            </div>
          </div>

          <div className="grid h-48 grid-cols-7 items-end gap-3 border-b border-gray-200 pt-4 pb-3">
            {dailyTrend.map((day) => {
              const totalH = Math.max(
                6,
                Math.round((day.total / maxDailyCount) * 140)
              );
              const handledH =
                day.total > 0
                  ? Math.max(4, Math.round((day.handled / maxDailyCount) * 140))
                  : 0;
              return (
                <div key={day.date} className="flex flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">
                    {day.total}
                  </span>
                  <div className="flex h-36 w-full items-end justify-center gap-1">
                    <div
                      title={`Total deteksi: ${day.total}`}
                      style={{ height: `${day.total > 0 ? totalH : 6}px` }}
                      className={`w-3.5 rounded-t-md ${
                        day.total > 0 ? "bg-gray-900" : "bg-gray-200"
                      }`}
                    />
                    {day.handled > 0 && (
                      <div
                        title={`Ditangani: ${day.handled}`}
                        style={{ height: `${handledH}px` }}
                        className="w-3.5 rounded-t-md bg-emerald-600"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2 text-center">
            {dailyTrend.map((day) => (
              <span
                key={day.date}
                className="truncate text-xs font-medium text-gray-500"
              >
                {day.label}
              </span>
            ))}
          </div>
        </section>

        <section className="col-span-12 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 xl:col-span-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Kesehatan Sistem &amp; Infrastruktur
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Status real-time MySQL, FCM, WebSocket, &amp; Edge CV Worker
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3.5">
              <div className="flex items-center gap-3">
                <Database className="size-5 text-gray-700" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Database &amp; API</p>
                  <p className="text-xs text-gray-500">
                    {overview?.system_health?.api_status || "Operasional Normal"}
                  </p>
                </div>
              </div>
              <Pill tone="success">
                {overview?.system_health?.database_status || "Terhubung"}
              </Pill>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3.5">
              <div className="flex items-center gap-3">
                <Wifi className="size-5 text-gray-700" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Push FCM &amp; WebSocket
                  </p>
                  <p className="text-xs text-gray-500">
                    {overview?.system_health?.active_family_ws || 0} sesi keluarga ·{" "}
                    {overview?.system_health?.active_worker_ws || 0} worker
                  </p>
                </div>
              </div>
              <Pill tone="success">
                {overview?.system_health?.fcm_status || "Aktif"}
              </Pill>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3.5">
              <div className="flex items-center gap-3">
                <HardDrive className="size-5 text-gray-700" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Penyimpanan Media &amp; Blur Wajah
                  </p>
                  <p className="text-xs text-gray-500">
                    Retensi {overview?.system_health?.retention_days || 30} hari
                  </p>
                </div>
              </div>
              <Pill>{overview?.system_health?.storage_used_mb ?? 0} MB</Pill>
            </div>
          </div>
        </section>
      </div>

      {/* Tabel Tenant Keluarga */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5 sm:p-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Daftar Tenant Grup Keluarga ({filteredTenants.length})
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Kode Keluarga di-masking untuk privasi; Admin dapat mengelola Nomor WA Darurat tiap grup.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={tenantQuery}
              onChange={(e) => setTenantQuery(e.target.value)}
              placeholder="Cari tenant / nama grup…"
              className="h-10 w-full rounded-full border border-gray-200 pr-4 pl-10 text-sm text-gray-800 focus:border-gray-400 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">ID Tenant</th>
                <th scope="col">Grup Keluarga</th>
                <th scope="col">Pembuat Grup</th>
                <th scope="col">Nomor WA Darurat</th>
                <th scope="col">Kode Keluarga</th>
                <th scope="col">Anggota &amp; Kamera</th>
                <th scope="col">Respons</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((t) => (
                <tr key={t.tenant_code}>
                  <td className="font-mono text-xs font-semibold text-gray-900">
                    {t.tenant_code}
                  </td>
                  <td>
                    <strong>{t.nama_grup}</strong>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                      <Smartphone className="size-4 text-gray-500" />
                      {t.owner_name}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-900">
                        {t.kontak_darurat || "+62 895-6006-86367"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextPhone = window.prompt(
                            `Ubah Nomor WhatsApp Darurat untuk ${t.nama_grup}:`,
                            t.kontak_darurat || "+62 895-6006-86367"
                          );
                          if (nextPhone && nextPhone.trim().length >= 5) {
                            setWaNumberInput(nextPhone.trim());
                            handleSaveEmergencyWa(
                              null,
                              t.group_id,
                              nextPhone.trim()
                            );
                          }
                        }}
                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Ubah
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-xs font-semibold text-gray-700">
                      <Lock className="size-3.5 text-gray-500" />
                      {t.kode_masked}
                    </span>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-3 text-sm text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-4 text-gray-400" />
                        {t.member_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Camera className="size-4 text-gray-400" />
                        {t.online_camera_count}/{t.camera_count} online
                      </span>
                    </span>
                  </td>
                  <td>
                    <Pill tone="success">
                      {t.response_rate_pct}% ({t.event_count} log)
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

