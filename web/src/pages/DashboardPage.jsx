import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  LogOut,
  Phone,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserMinus,
  Users,
  Video,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import api, { getCameraStreamUrl, getGroupWsUrl } from "../services/api";
import StatusBadge from "../components/StatusBadge";

function formatWib(isoStr) {
  if (!isoStr) return "-";
  try {
    return new Date(isoStr).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " WIB";
  } catch {
    return isoStr;
  }
}

function playAlertTone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Abaikan jika browser memblokir autoplay audio sebelum interaksi
  }
}

export default function DashboardPage({ user, onLogout }) {
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [events, setEvents] = useState([]);

  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [wsConnected, setWsConnected] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Modal buat grup baru
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [namaGrup, setNamaGrup] = useState("");
  const [namaLansia, setNamaLansia] = useState("");
  const [kontakDarurat, setKontakDarurat] = useState("");

  // Form tambah kamera
  const [namaRuangan, setNamaRuangan] = useState("");
  const [sumberKamera, setSumberKamera] = useState("demo_duduk.mp4");

  // Modal live view & zoom snapshot
  const [liveCamera, setLiveCamera] = useState(null);
  const [zoomEvent, setZoomEvent] = useState(null);

  const wsRef = useRef(null);

  const fetchGroups = useCallback(async () => {
    try {
      const { data } = await api.get("/groups");
      setGroups(data);
      if (data.length > 0) {
        setSelectedGroupId((prev) =>
          prev && data.some((g) => g.id === prev) ? prev : data[0].id
        );
      } else {
        setSelectedGroupId(null);
        setActiveGroup(null);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal memuat daftar grup.");
    }
  }, []);

  const fetchGroupDetail = useCallback(async (groupId) => {
    if (!groupId) return;
    try {
      const { data } = await api.get(`/groups/${groupId}`);
      setActiveGroup(data);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal memuat detail grup.");
    }
  }, []);

  const fetchEvents = useCallback(
    async (groupId) => {
      if (!groupId) {
        setEvents([]);
        return;
      }
      try {
        const params = { group_id: groupId };
        if (statusFilter) params.status = statusFilter;
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        const { data } = await api.get("/events", { params });
        setEvents(data);
      } catch (err) {
        setErrorMsg(err.response?.data?.detail || "Gagal memuat daftar kejadian.");
      }
    },
    [statusFilter, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (selectedGroupId) {
      fetchGroupDetail(selectedGroupId);
      fetchEvents(selectedGroupId);
    }
  }, [selectedGroupId, fetchGroupDetail, fetchEvents]);

  // Koneksi WebSocket real-time per grup aktif
  useEffect(() => {
    if (!selectedGroupId) return undefined;

    let reconnectTimer = null;
    let closedManually = false;

    function connectWs() {
      const ws = new WebSocket(getGroupWsUrl(selectedGroupId));
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);

      ws.onmessage = (msgEvent) => {
        try {
          const payload = JSON.parse(msgEvent.data);
          if (payload.type === "event.created" && payload.event) {
            playAlertTone();
            setEvents((prev) => [
              payload.event,
              ...prev.filter((ev) => ev.id !== payload.event.id),
            ]);
          } else if (payload.type === "event.updated" && payload.event) {
            setEvents((prev) =>
              prev.map((ev) => (ev.id === payload.event.id ? payload.event : ev))
            );
            setZoomEvent((curr) =>
              curr && curr.id === payload.event.id ? payload.event : curr
            );
          } else if (payload.type === "camera.status") {
            setActiveGroup((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                cameras: prev.cameras.map((cam) =>
                  cam.id === payload.camera_id
                    ? { ...cam, status: payload.status }
                    : cam
                ),
              };
            });
          } else if (payload.type === "camera.source") {
            setActiveGroup((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                cameras: prev.cameras.map((cam) =>
                  cam.id === payload.camera_id
                    ? { ...cam, sumber: payload.sumber }
                    : cam
                ),
              };
            });
            setLiveCamera((curr) =>
              curr && curr.id === payload.camera_id
                ? { ...curr, sumber: payload.sumber }
                : curr
            );
          }
        } catch {
          // Abaikan pesan non-JSON
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedManually) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      };
    }

    connectWs();

    return () => {
      closedManually = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [selectedGroupId]);

  const unhandledCount = useMemo(
    () => events.filter((e) => e.status === "baru").length,
    [events]
  );

  async function handleCreateGroup(e) {
    e.preventDefault();
    setErrorMsg("");
    try {
      const { data } = await api.post("/groups", {
        nama_grup: namaGrup,
        nama_lansia: namaLansia,
        kontak_darurat: kontakDarurat,
      });
      setNamaGrup("");
      setNamaLansia("");
      setKontakDarurat("");
      setShowGroupModal(false);
      await fetchGroups();
      setSelectedGroupId(data.id);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal membuat grup keluarga.");
    }
  }

  async function handleAddCamera(e) {
    e.preventDefault();
    if (!selectedGroupId || !namaRuangan.trim()) return;
    setErrorMsg("");
    try {
      await api.post(`/groups/${selectedGroupId}/cameras`, {
        nama_ruangan: namaRuangan,
        sumber: sumberKamera || "0",
      });
      setNamaRuangan("");
      setSumberKamera("0");
      await fetchGroupDetail(selectedGroupId);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal menambahkan kamera.");
    }
  }

  async function handleDeleteCamera(cameraId) {
    if (!window.confirm("Hapus kamera ini dari grup?")) return;
    try {
      await api.delete(`/cameras/${cameraId}`);
      await fetchGroupDetail(selectedGroupId);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal menghapus kamera.");
    }
  }

  async function handleSwitchCameraSource(cameraId, newSource) {
    setErrorMsg("");
    try {
      const { data } = await api.post(`/cameras/${cameraId}/source`, {
        sumber: newSource,
      });
      setActiveGroup((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cameras: prev.cameras.map((c) => (c.id === data.id ? data : c)),
        };
      });
      setLiveCamera((curr) => (curr && curr.id === data.id ? data : curr));
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail || "Gagal mengganti video simulasi CCTV."
      );
    }
  }

  async function handleRemoveMember(memberUserId, memberName) {
    if (!window.confirm(`Keluarkan ${memberName} dari grup keluarga?`)) return;
    try {
      await api.delete(`/groups/${selectedGroupId}/members/${memberUserId}`);
      await fetchGroupDetail(selectedGroupId);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal mengeluarkan anggota.");
    }
  }

  async function handleUpdateEventStatus(eventId, newStatus) {
    try {
      const { data } = await api.patch(`/events/${eventId}`, { status: newStatus });
      setEvents((prev) => prev.map((ev) => (ev.id === data.id ? data : ev)));
      if (zoomEvent?.id === data.id) setZoomEvent(data);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal memperbarui status kejadian.");
    }
  }

  function copyInviteCode() {
    if (!activeGroup?.kode_undangan) return;
    navigator.clipboard.writeText(activeGroup.kode_undangan);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Navbar Utama */}
      <header className="sticky top-0 z-20 border-b border-teal-800 bg-teal-700 text-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">SIGAP Admin</h1>
              <p className="text-xs text-teal-100">Dasbor Pemantauan Jatuh Lansia</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {selectedGroupId && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  wsConnected
                    ? "bg-emerald-500/20 text-emerald-50"
                    : "bg-amber-500/25 text-amber-100"
                }`}
              >
                {wsConnected ? (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-emerald-300" />
                    Real-Time Aktif
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-amber-300" />
                    Menyambung Ulang...
                  </>
                )}
              </span>
            )}

            <span className="hidden text-sm text-teal-100 sm:inline">
              Admin: <strong className="text-white">{user.nama}</strong>
            </span>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-900"
            >
              <LogOut className="h-3.5 w-3.5" />
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {errorMsg && (
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Bar Pilihan Grup & Buat Grup */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-slate-700">Grup Keluarga:</label>
            {groups.length > 0 ? (
              <select
                value={selectedGroupId || ""}
                onChange={(e) => setSelectedGroupId(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nama_grup} — {g.nama_lansia}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-500">Belum ada grup keluarga.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedGroupId && (
              <button
                onClick={() => {
                  fetchGroupDetail(selectedGroupId);
                  fetchEvents(selectedGroupId);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Segarkan
              </button>
            )}
            <button
              onClick={() => setShowGroupModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" />
              Buat Grup Keluarga
            </button>
          </div>
        </div>

        {!activeGroup ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-teal-700" />
            <h2 className="text-lg font-bold text-slate-900">
              Mulai Siapkan Grup Pemantauan Lansia
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
              Buat grup rumah lansia (misalnya &ldquo;Rumah Eyang Sri&rdquo;), daftarkan kamera
              ruangan, lalu bagikan kode undangan 6 karakter ke aplikasi HP keluarga.
            </p>
            <button
              onClick={() => setShowGroupModal(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" />
              Buat Grup Pertama
            </button>
          </div>
        ) : (
          <>
            {/* Banner Peringatan Darurat Aktif */}
            {unhandledCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-red-600 bg-red-50 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-red-900">
                      PERINGATAN DARURAT: {unhandledCount} Kejadian Jatuh Belum Ditangani!
                    </h2>
                    <p className="text-sm text-red-800">
                      Lansia: <strong>{activeGroup.nama_lansia}</strong> · Kontak Darurat:{" "}
                      <strong>{activeGroup.kontak_darurat}</strong>
                    </p>
                  </div>
                </div>
                <a
                  href={`tel:${activeGroup.kontak_darurat}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-red-700"
                >
                  <Phone className="h-4 w-4" />
                  Hubungi {activeGroup.kontak_darurat}
                </a>
              </div>
            )}

            {/* Ringkasan Info Grup & Kode Undangan */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Lansia yang Dipantau
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {activeGroup.nama_lansia}
                </p>
                <p className="mt-1 text-sm text-slate-600">{activeGroup.nama_grup}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Kontak Darurat Grup (SOS)
                </p>
                <p className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900">
                  <Phone className="h-5 w-5 text-red-600" />
                  {activeGroup.kontak_darurat}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Terbuka otomatis saat keluarga menekan tombol SOS
                </p>
              </div>

              <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
                <p className="text-xs font-semibold tracking-wider text-teal-900 uppercase">
                  Kode Undangan Keluarga (6 Karakter)
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-2xl font-extrabold tracking-widest text-teal-900">
                    {activeGroup.kode_undangan}
                  </span>
                  <button
                    onClick={copyInviteCode}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Salin Kode
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-teal-800">
                  Masukkan di aplikasi Android keluarga untuk menerima FCM
                </p>
              </div>
            </div>

            {/* Grid Kamera & Anggota */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Panel Kamera */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-teal-700" />
                    <h2 className="text-base font-bold text-slate-900">
                      Kamera CCTV ({activeGroup.cameras.length})
                    </h2>
                  </div>
                </div>

                <div className="space-y-3">
                  {activeGroup.cameras.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
                      Belum ada kamera terdaftar di grup ini.
                    </p>
                  ) : (
                    activeGroup.cameras.map((cam) => (
                      <div
                        key={cam.id}
                        className="space-y-3 rounded-lg border border-slate-200 p-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                  cam.status === "online" ? "bg-emerald-500" : "bg-slate-400"
                                }`}
                              />
                              <span className="font-semibold text-slate-900">
                                {cam.nama_ruangan}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                                CAMERA_ID={cam.id}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                                  cam.status === "online"
                                    ? "bg-emerald-50 text-emerald-800"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {cam.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              Sumber aktif:{" "}
                              <code className="font-mono font-semibold text-slate-700">
                                {cam.sumber}
                              </code>
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setLiveCamera(cam)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                            >
                              <Video className="h-3.5 w-3.5" />
                              Live View
                            </button>
                            <button
                              onClick={() => handleDeleteCamera(cam.id)}
                              title="Hapus kamera"
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Tombol Kontrol CCTV Virtual untuk Demo Tanpa CCTV Fisik */}
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                          <span className="text-[11px] font-semibold text-slate-500 uppercase">
                            Simulasi CCTV:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleSwitchCameraSource(cam.id, "demo_duduk.mp4")
                            }
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                              cam.sumber === "demo_duduk.mp4"
                                ? "bg-emerald-700 text-white"
                                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            1. Aktivitas Normal (Duduk & Sofa)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleSwitchCameraSource(cam.id, "demo_jatuh.mp4")
                            }
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                              cam.sumber === "demo_jatuh.mp4"
                                ? "bg-red-600 text-white"
                                : "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
                            }`}
                          >
                            2. Uji Lansia Jatuh
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Form Tambah Kamera */}
                <form
                  onSubmit={handleAddCamera}
                  className="mt-4 grid gap-2.5 border-t border-slate-200 pt-4 sm:grid-cols-12"
                >
                  <input
                    type="text"
                    required
                    value={namaRuangan}
                    onChange={(e) => setNamaRuangan(e.target.value)}
                    placeholder="Nama ruangan (mis. Ruang Tamu)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-6 focus:border-teal-700 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={sumberKamera}
                    onChange={(e) => setSumberKamera(e.target.value)}
                    placeholder="Sumber (0 / demo.mp4)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-3 focus:border-teal-700 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 sm:col-span-3"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah
                  </button>
                </form>
              </section>

              {/* Panel Anggota Keluarga */}
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-teal-700" />
                  <h2 className="text-base font-bold text-slate-900">
                    Anggota Grup Keluarga ({activeGroup.members.length})
                  </h2>
                </div>

                <div className="space-y-2.5">
                  {activeGroup.members.map((m) => (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{m.nama}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                              m.role === "admin"
                                ? "bg-teal-50 text-teal-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {m.role}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{m.email}</p>
                      </div>

                      {m.user_id !== activeGroup.admin_id && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id, m.nama)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Keluarkan
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Daftar & Riwayat Event Jatuh */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Daftar & Riwayat Kejadian Jatuh
                  </h2>
                  <p className="text-xs text-slate-500">
                    Diperbarui otomatis tanpa muat ulang halaman melalui WebSocket
                  </p>
                </div>

                {/* Filter Status & Tanggal (FR-15) */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    <option value="">Semua Status</option>
                    <option value="baru">Belum Ditangani</option>
                    <option value="ditangani">Sudah Ditangani</option>
                    <option value="alarm_palsu">Alarm Palsu</option>
                  </select>

                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700"
                    title="Dari tanggal"
                  />
                  <span className="text-xs text-slate-400">s/d</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700"
                    title="Sampai tanggal"
                  />
                  {(statusFilter || dateFrom || dateTo) && (
                    <button
                      onClick={() => {
                        setStatusFilter("");
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {events.length === 0 ? (
                <div className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-500">
                  Belum ada kejadian jatuh tercatat pada filter ini. Kondisi aman terpantau.
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className={`flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
                        ev.status === "baru"
                          ? "border-l-4 border-red-200 border-l-red-600 bg-red-50/70"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <button
                          type="button"
                          onClick={() => setZoomEvent(ev)}
                          className="group relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-900"
                        >
                          <img
                            src={ev.snapshot_url}
                            alt={`Snapshot ${ev.camera_name}`}
                            className="h-full w-full object-cover transition group-hover:opacity-85"
                          />
                          <span className="absolute right-1 bottom-1 rounded bg-black/65 p-1 text-white">
                            <Eye className="h-3 w-3" />
                          </span>
                        </button>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={ev.status} />
                            <span className="text-xs font-medium text-slate-500">
                              #{ev.id} · Keyakinan {(ev.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-900">
                            {ev.nama_lansia} — Ruangan: {ev.camera_name}
                          </p>
                          <p className="text-xs text-slate-600">Waktu: {formatWib(ev.waktu)}</p>
                          {ev.handled_by_name && (
                            <p className="text-xs font-medium text-emerald-800">
                              Ditindaklanjuti oleh: <strong>{ev.handled_by_name}</strong>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {ev.status !== "ditangani" && (
                          <button
                            onClick={() => handleUpdateEventStatus(ev.id, "ditangani")}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Sudah Ditangani
                          </button>
                        )}
                        {ev.status !== "alarm_palsu" && (
                          <button
                            onClick={() => handleUpdateEventStatus(ev.id, "alarm_palsu")}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Alarm Palsu
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Modal Buat Grup Baru */}
      {showGroupModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Buat Grup Keluarga Baru</h3>
              <button onClick={() => setShowGroupModal(false)}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nama Grup / Rumah
                </label>
                <input
                  type="text"
                  required
                  value={namaGrup}
                  onChange={(e) => setNamaGrup(e.target.value)}
                  placeholder="Mis. Rumah Eyang Sri"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nama Lansia yang Dipantau
                </label>
                <input
                  type="text"
                  required
                  value={namaLansia}
                  onChange={(e) => setNamaLansia(e.target.value)}
                  placeholder="Mis. Eyang Sri"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nomor Telepon Kontak Darurat (SOS)
                </label>
                <input
                  type="tel"
                  required
                  value={kontakDarurat}
                  onChange={(e) => setKontakDarurat(e.target.value)}
                  placeholder="Mis. 081234567890"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Simpan Grup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Live View MJPEG */}
      {liveCamera && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/75 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between bg-slate-900 px-5 py-3.5 text-white">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-bold">
                  Live View CCTV — {liveCamera.nama_ruangan}
                </h3>
              </div>
              <button onClick={() => setLiveCamera(null)}>
                <X className="h-5 w-5 text-slate-300 hover:text-white" />
              </button>
            </div>
            <div className="flex aspect-video items-center justify-center bg-slate-900">
              <img
                src={getCameraStreamUrl(liveCamera.id)}
                alt={`Stream ${liveCamera.nama_ruangan}`}
                className="max-h-[70vh] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
              <span className="text-xs font-medium text-slate-600">
                Sumber aktif: <code className="font-mono font-bold">{liveCamera.sumber}</code>
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSwitchCameraSource(liveCamera.id, "demo_duduk.mp4")
                  }
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Putar Skenario Normal (Duduk)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSwitchCameraSource(liveCamera.id, "demo_jatuh.mp4")
                  }
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Putar Skenario Jatuh!
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Perbesar Snapshot Event */}
      {zoomEvent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/75 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <StatusBadge status={zoomEvent.status} />
                <span className="text-sm font-bold text-slate-900">
                  {zoomEvent.camera_name} · {formatWib(zoomEvent.waktu)}
                </span>
              </div>
              <button onClick={() => setZoomEvent(null)}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="bg-slate-900">
              <img
                src={zoomEvent.snapshot_url}
                alt="Snapshot kejadian"
                className="max-h-[65vh] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <p className="text-xs text-slate-500">
                Wajah diburamkan otomatis untuk menjaga privasi lansia.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleUpdateEventStatus(zoomEvent.id, "ditangani")}
                  className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Tandai Sudah Ditangani
                </button>
                <button
                  onClick={() => handleUpdateEventStatus(zoomEvent.id, "alarm_palsu")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Alarm Palsu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

