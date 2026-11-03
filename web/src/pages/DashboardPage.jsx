import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  Camera,
  ChevronRight,
  Cpu,
  Database,
  Film,
  HardDrive,
  Lock,
  Phone,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";
import api from "../services/api";
import AppSidebar from "../components/layout/AppSidebar";
import AppHeader from "../components/layout/AppHeader";
import { MetricCard, Pill, SaasMonitoringCard } from "../components/DashboardCards";
import { Button, InlineError, SigapLoader } from "../components/Ui";
import SimulationPage from "./SimulationPage";

const NAV = [
  {
    id: "performa",
    label: "Performa Layanan",
    subtitle: "Analitik & Grafik Utama",
    icon: BarChart3,
  },
  {
    id: "keluarga",
    label: "Daftar Keluarga",
    subtitle: "Grup & Privasi Kode",
    icon: Building2,
  },
  {
    id: "sistem",
    label: "Kesehatan Sistem",
    subtitle: "Server & Perangkat Kamera",
    icon: Server,
  },
  {
    id: "simulasi",
    label: "Lab Simulasi AI",
    subtitle: "Uji Model & Interkom",
    icon: Film,
  },
];

function readPageFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  if (raw === "overview" || raw === "saas" || raw === "dashboard") return "performa";
  if (raw === "tenants") return "keluarga";
  if (raw === "system") return "sistem";
  return NAV.some((item) => item.id === raw) ? raw : "performa";
}

function PageBreadcrumb({ title, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-3xl leading-tight font-normal tracking-normal text-gray-950 sm:text-4xl">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Jejak navigasi">
          <ol className="flex items-center gap-1.5 text-sm">
            <li>
              <a
                href="#/performa"
                className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900"
              >
                Pusat Admin
                <ChevronRight size={16} aria-hidden="true" />
              </a>
            </li>
            <li className="font-medium text-gray-800" aria-current="page">
              {title}
            </li>
          </ol>
        </nav>
        {actions}
      </div>
    </div>
  );
}

export default function DashboardPage({ user, onLogout }) {
  const [activePage, setActivePage] = useState(readPageFromHash);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  // Pengelolaan Nomor WhatsApp Darurat (+62 895-6006-86367)
  const [waNumberInput, setWaNumberInput] = useState("+62 895-6006-86367");
  const [waTargetGroupId, setWaTargetGroupId] = useState("all");
  const [savingWa, setSavingWa] = useState(false);

  const sidebarRef = useRef(null);
  const drawerButtonRef = useRef(null);

  const selectPage = useCallback((id) => {
    window.location.hash = `/${id}`;
    setActivePage(id);
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    const onHash = () => {
      setActivePage(readPageFromHash());
      setDrawerOpen(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const currentNavMeta = useMemo(
    () => NAV.find((item) => item.id === activePage) || NAV[0],
    [activePage]
  );

  useEffect(() => {
    document.title = `${currentNavMeta.label} · SIGAP Admin`;
  }, [currentNavMeta]);

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
        err.response?.data?.detail ||
          "Gagal memuat data performa layanan. Periksa koneksi ke server."
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

  const filteredGroups = useMemo(() => {
    const list = overview?.tenants || [];
    const q = groupQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.tenant_code.toLowerCase().includes(q) ||
        t.nama_grup.toLowerCase().includes(q) ||
        t.owner_name.toLowerCase().includes(q)
    );
  }, [overview, groupQuery]);

  async function handleSaveEmergencyWa(
    e,
    overrideGroupId = null,
    overridePhone = null
  ) {
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
      setSuccessMsg(
        data.message || "Nomor WhatsApp Darurat berhasil disimpan!"
      );
      await fetchOverview(true);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail || "Gagal menyimpan nomor WhatsApp darurat."
      );
    } finally {
      setSavingWa(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Lewati ke konten utama
      </a>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 xl:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <AppSidebar
        panelRef={sidebarRef}
        nav={NAV}
        activePage={activePage}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelectPage={selectPage}
      />

      <div className="xl:ml-[256px]" inert={drawerOpen ? "" : undefined}>
        <AppHeader
          toggleRef={drawerButtonRef}
          drawerOpen={drawerOpen}
          onOpenDrawer={() => setDrawerOpen(true)}
          title={currentNavMeta.label}
          subtitle={currentNavMeta.subtitle}
          lastUpdated={lastUpdated}
          emergencyWhatsapp={overview?.emergency_whatsapp || waNumberInput}
          refreshing={refreshing}
          onRefresh={() => fetchOverview(false)}
          user={user}
          onLogout={onLogout}
        />

        <main id="main-content" className="content" tabIndex={-1}>
          <PageBreadcrumb
            title={currentNavMeta.label}
            actions={
              activePage !== "simulasi" ? (
                <Button
                  icon={Sparkles}
                  onClick={() => selectPage("simulasi")}
                >
                  Buka Lab Simulasi AI
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  icon={BarChart3}
                  onClick={() => selectPage("performa")}
                >
                  Lihat Performa Layanan
                </Button>
              )
            }
          />

          <InlineError
            message={errorMsg}
            onRetry={() => fetchOverview(false)}
          />

          {successMsg && (
            <div
              role="status"
              className="mb-5 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-medium text-emerald-900"
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

          {/* PANEL PENGELOLAAN NOMOR WHATSAPP DARURAT (+62 895-6006-86367) */}
          {(activePage === "performa" || activePage === "keluarga") && (
            <form
              onSubmit={(e) => handleSaveEmergencyWa(e)}
              className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Pill tone="success">
                    <Phone className="size-3.5" /> Nomor WhatsApp Darurat &amp; Lokasi CCTV
                  </Pill>
                  <h2 className="mt-2 text-lg font-semibold text-gray-900">
                    Kelola Nomor WhatsApp Darurat Keluarga &amp; Tim Medis
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Nomor ini otomatis tersinkron ke aplikasi HP saat keluarga menekan tombol{" "}
                    <strong className="text-gray-800">
                      Kirim WA Darurat + Lokasi CCTV
                    </strong>{" "}
                    maupun <strong className="text-gray-800">Telepon Darurat</strong>.
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
                  Atur Nomor Baku: +62 895-6006-86367
                </Button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-12">
                <div className="field sm:col-span-5">
                  <label htmlFor="wa-darurat-input">Nomor WhatsApp Darurat</label>
                  <input
                    id="wa-darurat-input"
                    type="text"
                    value={waNumberInput}
                    onChange={(e) => setWaNumberInput(e.target.value)}
                    placeholder="+62 895-6006-86367"
                  />
                </div>

                <div className="field sm:col-span-4">
                  <label htmlFor="wa-target-grup">Terapkan pada Grup Keluarga</label>
                  <select
                    id="wa-target-grup"
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
                    <option value="all">Semua Grup Keluarga (Serentak)</option>
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
          )}

          {loading && activePage !== "simulasi" ? (
            <div className="panel" aria-busy="true" aria-label="Memuat data">
              <SigapLoader
                label="Memuat data performa layanan…"
                sublabel="Mengambil metrik grafik, daftar grup keluarga, dan status perangkat."
              />
            </div>
          ) : (
            <>
              {/* MENU 1: PERFORMA LAYANAN (DENGAN GRAFIK TERINTEGRASI) */}
              {activePage === "performa" && (
                <div className="space-y-6">
                  {/* 4 Kartu Metrik Utama Gaya TailAdmin */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
                    <MetricCard
                      icon={Building2}
                      tone="brand"
                      label="Grup Keluarga Terdaftar"
                      loading={loading}
                      value={kpis.total_tenants}
                      badge={<Pill>{kpis.total_keluarga_users} akun HP</Pill>}
                    />
                    <MetricCard
                      icon={Camera}
                      tone="brand"
                      label="Ketersediaan Kamera CCTV"
                      loading={loading}
                      value={`${kpis.camera_uptime_pct}%`}
                      badge={
                        <Pill tone="success">
                          {kpis.online_cameras}/{kpis.total_cameras} aktif
                        </Pill>
                      }
                    />
                    <MetricCard
                      icon={Cpu}
                      tone="neutral"
                      label="Akurasi Deteksi AI"
                      loading={loading}
                      value={`${kpis.ai_precision_pct}%`}
                      badge={
                        <Pill tone="dark">
                          Keyakinan {kpis.avg_confidence_pct}%
                        </Pill>
                      }
                    />
                    <MetricCard
                      icon={Activity}
                      tone={kpis.unhandled_events > 0 ? "danger" : "neutral"}
                      label="Tingkat Respons Keluarga"
                      loading={loading}
                      value={`${kpis.response_rate_pct}%`}
                      badge={
                        <Pill>
                          {kpis.total_voice_messages} pesan suara
                        </Pill>
                      }
                    />
                  </div>

                  {/* Grid 12 Kolom TailAdmin: Kiri Grafik Batang 7 Hari + SLA (7 kolom), Kanan Grafik Setengah Lingkaran Radial (5 kolom) */}
                  <div className="grid grid-cols-12 gap-4 md:gap-6">
                    <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-7">
                      {/* Grafik Batang Tren 7 Hari */}
                      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h2 className="text-lg font-semibold text-gray-800">
                              Grafik Tren Deteksi &amp; Penanganan (7 Hari Terakhir)
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                              Agregat seluruh grup keluarga tanpa menampilkan rekaman pribadi rumah
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-xs font-medium text-gray-600">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-xs bg-gray-900" />
                              Total Deteksi ({kpis.total_events})
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
                                ? Math.max(
                                    4,
                                    Math.round(
                                      (day.handled / maxDailyCount) * 140
                                    )
                                  )
                                : 0;
                            return (
                              <div
                                key={day.date}
                                className="flex flex-col items-center gap-2"
                              >
                                <span className="text-xs font-semibold text-gray-700 tabular-nums">
                                  {day.total}
                                </span>
                                <div className="flex h-36 w-full items-end justify-center gap-1">
                                  <div
                                    title={`Total deteksi: ${day.total}`}
                                    style={{
                                      height: `${day.total > 0 ? totalH : 6}px`,
                                    }}
                                    className={`w-3.5 rounded-t-md transition-all ${
                                      day.total > 0
                                        ? "bg-gray-900"
                                        : "bg-gray-200"
                                    }`}
                                  />
                                  {day.handled > 0 && (
                                    <div
                                      title={`Ditangani: ${day.handled}`}
                                      style={{ height: `${handledH}px` }}
                                      className="w-3.5 rounded-t-md bg-emerald-600 transition-all"
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-2.5 grid grid-cols-7 gap-2 text-center">
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

                      {/* Indikator Kualitas Layanan */}
                      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                        <div className="mb-4">
                          <h2 className="text-lg font-semibold text-gray-800">
                            Indikator Keandalan Layanan &amp; Notifikasi
                          </h2>
                          <p className="mt-1 text-sm text-gray-500">
                            Capaian ketepatan deteksi AI dan pengiriman peringatan darurat ke HP keluarga
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <div className="mb-1.5 flex justify-between text-xs font-semibold">
                              <span className="text-gray-700">
                                Ketepatan Deteksi Bebas Alarm Palsu
                              </span>
                              <span className="text-gray-900 tabular-nums">
                                {kpis.ai_precision_pct}%
                              </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full bg-gray-900"
                                style={{ width: `${kpis.ai_precision_pct}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="mb-1.5 flex justify-between text-xs font-semibold">
                              <span className="text-gray-700">
                                Penyelesaian Tindak Lanjut Keluarga
                              </span>
                              <span className="text-emerald-700 tabular-nums">
                                {kpis.response_rate_pct}%
                              </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full bg-emerald-600"
                                style={{ width: `${kpis.response_rate_pct}%` }}
                              />
                            </div>
                          </div>

                          <div>
                            <div className="mb-1.5 flex justify-between text-xs font-semibold">
                              <span className="text-gray-700">
                                Perangkat HP Terhubung Notifikasi Darurat
                              </span>
                              <span className="text-gray-900 tabular-nums">
                                {kpis.fcm_ready_users} dari{" "}
                                {kpis.total_keluarga_users} HP
                              </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full bg-gray-700"
                                style={{
                                  width: `${
                                    kpis.total_keluarga_users > 0
                                      ? Math.round(
                                          (kpis.fcm_ready_users /
                                            kpis.total_keluarga_users) *
                                            100
                                        )
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>

                    {/* Kanan: Grafik Setengah Lingkaran Radial (HalfRing) dari UI Kawan */}
                    <div className="col-span-12 xl:col-span-5">
                      <SaasMonitoringCard kpis={kpis} loading={loading} />
                    </div>
                  </div>
                </div>
              )}

              {/* MENU 2: DAFTAR KELUARGA (KODE TERKUNCI & KELOLA WA DARURAT) */}
              {activePage === "keluarga" && (
                <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5 sm:p-6">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">
                        Daftar Grup Keluarga Terdaftar ({filteredGroups.length})
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Grup dibuat oleh keluarga di aplikasi HP dan dikunci dengan Kode Keluarga masing-masing.
                      </p>
                    </div>

                    <div className="relative w-full sm:w-72">
                      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={groupQuery}
                        onChange={(e) => setGroupQuery(e.target.value)}
                        placeholder="Cari kode / nama grup keluarga…"
                        className="h-10 w-full rounded-full border border-gray-200 pr-4 pl-10 text-sm text-gray-800 focus:border-gray-400 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Kode Grup</th>
                          <th scope="col">Nama Grup Keluarga</th>
                          <th scope="col">Pembuat Grup</th>
                          <th scope="col">Nomor WA Darurat</th>
                          <th scope="col">Kode Keluarga</th>
                          <th scope="col">Anggota &amp; Kamera</th>
                          <th scope="col">Tingkat Respons</th>
                          <th scope="col">Status Privasi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGroups.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="py-10 text-center text-sm text-gray-500"
                            >
                              Belum ada grup keluarga yang cocok dengan pencarian.
                            </td>
                          </tr>
                        ) : (
                          filteredGroups.map((t) => (
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
                                      if (
                                        nextPhone &&
                                        nextPhone.trim().length >= 5
                                      ) {
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
                                    {t.member_count} orang
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Camera className="size-4 text-gray-400" />
                                    {t.online_camera_count}/{t.camera_count} aktif
                                  </span>
                                </span>
                              </td>
                              <td>
                                <Pill tone="success">
                                  {t.response_rate_pct}% ({t.event_count} catatan)
                                </Pill>
                              </td>
                              <td>
                                <Pill tone="dark">
                                  <Lock className="size-3" /> Terkunci Privasi
                                </Pill>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* MENU 3: KESEHATAN SISTEM & PERANGKAT KAMERA */}
              {activePage === "sistem" && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                      <div className="flex items-center gap-3 text-gray-900">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100">
                          <Database className="size-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">
                            Basis Data &amp; Layanan Inti
                          </h3>
                          <p className="text-xs text-gray-500">
                            Penyimpanan terpusat &amp; antarmuka sistem
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                        <span className="text-sm text-gray-600">
                          {overview?.system_health?.api_status ||
                            "Berjalan Normal"}
                        </span>
                        <Pill tone="success">
                          {overview?.system_health?.database_status ||
                            "Terhubung"}
                        </Pill>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                      <div className="flex items-center gap-3 text-gray-900">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100">
                          <Wifi className="size-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">
                            Notifikasi &amp; Kanal Waktu Nyata
                          </h3>
                          <p className="text-xs text-gray-500">
                            Pengiriman peringatan instan ke HP keluarga
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                        <span className="text-sm text-gray-600">
                          {overview?.system_health?.active_family_ws || 0} sesi
                          keluarga ·{" "}
                          {overview?.system_health?.active_worker_ws || 0} kamera
                        </span>
                        <Pill tone="success">
                          {overview?.system_health?.fcm_status || "Aktif"}
                        </Pill>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                      <div className="flex items-center gap-3 text-gray-900">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100">
                          <HardDrive className="size-5" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">
                            Penyimpanan Media &amp; Sensor Wajah
                          </h3>
                          <p className="text-xs text-gray-500">
                            Pembersihan otomatis &gt;{" "}
                            {overview?.system_health?.retention_days || 30} hari
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                        <span className="text-sm text-gray-600">
                          Sensor buram wajah aktif
                        </span>
                        <Pill tone="dark">
                          {overview?.system_health?.storage_used_mb ?? 0} MB
                          terpakai
                        </Pill>
                      </div>
                    </div>
                  </div>

                  {/* Daftar Perangkat Kamera Pemantau */}
                  <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-800">
                          Status Perangkat Kamera Pemantau
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                          Pemantauan keterhubungan perangkat tanpa mengakses video pribadi rumah
                        </p>
                      </div>
                      <Pill>
                        Model AI: Deteksi Pose Tubuh 4 Lapis
                      </Pill>
                    </div>

                    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                      {(overview?.edge_nodes || []).map((node) => {
                        const isOnline = node.status === "online";
                        return (
                          <div
                            key={node.node_code}
                            className="flex items-center justify-between rounded-2xl border border-gray-200 p-4"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    isOnline ? "bg-emerald-500" : "bg-gray-400"
                                  }`}
                                />
                                <span className="font-mono text-sm font-semibold text-gray-900">
                                  {node.node_code}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                Grup:{" "}
                                <strong className="font-mono text-gray-700">
                                  {node.tenant_code}
                                </strong>{" "}
                                · ID Kamera #{node.camera_id}
                              </p>
                            </div>
                            <Pill tone={isOnline ? "success" : "neutral"}>
                              {isOnline ? "Aktif" : "Tidak Aktif"}
                            </Pill>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              )}

              {/* MENU 4: LAB SIMULASI AI & INTERKOM SUARA 2 ARAH */}
              {activePage === "simulasi" && <SimulationPage />}
            </>
          )}

          <footer className="content-footer">
            <span>SIGAP · Sistem Deteksi Jatuh pada Lansia</span>
            <span>Waktu ditampilkan dalam WIB · Pusat Kendali Layanan Admin</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
