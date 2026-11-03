import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Bell, Camera, CheckCircle2, ChevronRight, House, ImageOff, LayoutDashboard, Plus, RefreshCw, Trash2, Users, WifiOff, X } from "lucide-react";
import useAdminData from "../hooks/useAdminData";
import { errorMessage, formatDate, formatTime, isOwner } from "../utils/format";
import { Button, EmptyState, InlineError, Modal, SigapLoader } from "../components/Ui";
import StatusBadge from "../components/StatusBadge";
import CameraCard from "../components/CameraCard";
import EventDetail from "../components/EventDetail";
import LiveViewDialog from "../components/LiveViewDialog";
import AppSidebar from "../components/layout/AppSidebar";
import AppHeader from "../components/layout/AppHeader";
import { MembersCard, MetricCard, MonitoringCard, Pill } from "../components/DashboardCards";
import { CameraFormDialog, GroupDetailPage, GroupFormDialog, GroupsPage, MembersPage } from "./ManagementPages";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "groups", label: "Grup Keluarga", icon: House },
  { id: "cameras", label: "Kamera", icon: Camera },
  { id: "events", label: "Kejadian", icon: Bell },
  { id: "members", label: "Anggota", icon: Users },
];

function readRoute() {
  const [page, detail] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { page: [...NAV.map((item) => item.id), "group"].includes(page) ? page : "dashboard", eventId: page === "events" && /^\d+$/.test(detail || "") ? Number(detail) : null };
}

function Thumbnail({ event }) {
  const [failed, setFailed] = useState(false);
  return failed || !event.snapshot_url
    ? <span className="event-thumb event-thumb-placeholder" aria-label="Snapshot tidak tersedia"><ImageOff size={19} /></span>
    : <img className="event-thumb" src={event.snapshot_url} alt={`Snapshot ${event.camera_name}`} onError={() => setFailed(true)} loading="lazy" />;
}

function EventTable({ events, onOpen, loading, error, onRetry, limit = 100, filtered = false }) {
  if (loading && !events.length) return <div className="panel" aria-label="Memuat kejadian" aria-busy="true"><SigapLoader size="sm" label="Memuat riwayat kejadian…" /></div>;
  return <>
    <InlineError message={error} onRetry={onRetry} />
    {!events.length && !error ? <EmptyState image="/assets/empty-semua-aman.svg" title={filtered ? "Tidak ada kejadian sesuai filter" : "Belum ada kejadian tercatat"} description={filtered ? "Coba rentang tanggal atau status lainnya." : "Kejadian yang terdeteksi akan tampil di sini untuk ditinjau bersama keluarga."} /> : events.length > 0 && <>
      <div className="table-wrap" data-event-list tabIndex={0} aria-label="Daftar kejadian">
        <table className="data-table event-table">
          <thead><tr><th scope="col">Kejadian</th><th scope="col">Waktu</th><th scope="col">Status</th><th scope="col">Penanggap</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>{events.map((event) => <tr key={event.id} className={event.status === "baru" ? "event-row-new" : ""}>
            <td><div className="event-cell"><Thumbnail event={event} /><div><strong>{event.camera_name}</strong><small>{event.nama_lansia} · #{event.id}</small></div></div></td>
            <td className="time-cell"><strong>{formatTime(event.waktu)}</strong><small>{formatDate(event.waktu)}</small></td>
            <td><StatusBadge status={event.status} /></td>
            <td>{event.handled_by_name || <span className="muted">—</span>}</td>
            <td><button type="button" className="section-link" aria-label={`Lihat detail kejadian ${event.id}`} onClick={() => onOpen(event)}>Detail <ChevronRight size={15} /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="table-caption">{events.length} kejadian ditampilkan · Maks. {limit} kejadian terbaru per pengambilan data.</p>
    </>}
  </>;
}

/** Judul halaman + breadcrumb, mengikuti PageBreadcrumb TailAdmin. */
function PageBreadcrumb({ title, actions }) {
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
    <h1 className="font-serif text-4xl leading-tight font-normal tracking-normal text-gray-950">{title}</h1>
    <div className="flex flex-wrap items-center gap-4">
      <nav aria-label="Breadcrumb"><ol className="flex items-center gap-1.5 text-sm">
        <li><a href="#/dashboard" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900">Beranda<ChevronRight size={16} aria-hidden="true" /></a></li>
        <li className="text-gray-800" aria-current="page">{title}</li>
      </ol></nav>
      {actions}
    </div>
  </div>;
}

function EventFilters({ filters, onChange }) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(filters); }, [filters]);
  function submit(event) {
    event.preventDefault();
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) { setError("Tanggal awal tidak boleh melewati tanggal akhir."); return; }
    setError(""); onChange(draft);
  }
  return <><form className="panel filters" onSubmit={submit}>
    <div className="field"><label htmlFor="event-status">Status kejadian</label><select id="event-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="">Semua status</option><option value="baru">Belum ditangani</option><option value="ditangani">Sudah ditangani</option><option value="alarm_palsu">Alarm palsu</option></select></div>
    <div className="field"><label htmlFor="date-from">Dari tanggal (WIB)</label><input id="date-from" type="date" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} /></div>
    <div className="field"><label htmlFor="date-to">Sampai tanggal (WIB)</label><input id="date-to" type="date" value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} /></div>
    <Button type="submit">Terapkan</Button><Button variant="ghost" onClick={() => { setError(""); onChange({ status: "", dateFrom: "", dateTo: "" }); }}>Reset</Button>
  </form><InlineError message={error} /></>;
}

export default function DashboardPage({ user, onLogout }) {
  const data = useAdminData(user);
  const [route, setRoute] = useState(readRoute);
  const [drawer, setDrawer] = useState(false);  const [groupForm, setGroupForm] = useState(null);
  const [cameraForm, setCameraForm] = useState(null);
  const [deleteCamera, setDeleteCamera] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [liveId, setLiveId] = useState(null);
  const [eventSeed, setEventSeed] = useState(null);
  const sidebarRef = useRef(null);
  const drawerButton = useRef(null);
  const { group, groups, groupId } = data;
  const owner = isOwner(user, group);
  const cameras = group?.cameras || [];
  const online = cameras.filter((camera) => camera.status === "online").length;
  const navigation = (page) => { window.location.hash = `/${page}`; setDrawer(false); };

  useEffect(() => {
    const update = () => { setRoute(readRoute()); setDrawer(false); };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => { setLiveId(null); }, [groupId]);
  useEffect(() => {
    const label = route.page === "group" ? "Detail Grup" : NAV.find((item) => item.id === route.page)?.label;
    document.title = `${label} · SIGAP Admin`;
  }, [route.page]);
  useEffect(() => {
    if (!drawer) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector("button")?.focus();
    function key(event) {
      if (event.key === "Escape") setDrawer(false);
      if (event.key === "Tab") {
        const items = [...sidebarRef.current.querySelectorAll("a[href],button")].filter((item) => item.getClientRects().length);
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    }
    const media = window.matchMedia("(min-width: 1280px)");
    const resize = () => { if (media.matches) setDrawer(false); };
    document.addEventListener("keydown", key); media.addEventListener("change", resize);
    return () => { document.body.style.overflow = original; document.removeEventListener("keydown", key); media.removeEventListener("change", resize); drawerButton.current?.focus(); };
  }, [drawer]);

  function openEvent(event) { setEventSeed(event); navigation(`events/${event.id}`); }
  function reviewAlerts() {
    if (data.alerts.length === 1) openEvent(data.alerts[0]);
    else { data.setFilters({ status: "baru" }); navigation("events"); }
  }
  async function confirmDeleteCamera() {
    if (deleteBusy) return;
    setDeleteBusy(true); setDeleteError("");
    try { await data.deleteCamera(deleteCamera.id, deleteCamera.group_id); setDeleteCamera(null); }
    catch (error) { setDeleteError(errorMessage(error, "Kamera belum berhasil dihapus.")); }
    finally { setDeleteBusy(false); }
  }
  const detailEvent = data.lastEventUpdate?.id === route.eventId ? data.lastEventUpdate : data.recentEvents.find((event) => event.id === route.eventId) || (eventSeed?.id === route.eventId ? eventSeed : null);
  const liveCamera = cameras.find((camera) => camera.id === liveId);
  const groupReady = Boolean(group && !data.loading);
  const filtered = Object.values(data.filters).some(Boolean);
  const noGroup = <div className="panel"><EmptyState image="/assets/empty-belum-grup.svg" title="Mulai dari satu grup keluarga" description="Buat grup untuk orang yang Anda sayangi. Hubungkan kamera, lalu undang keluarga untuk memantau bersama." action={<Button icon={Plus} onClick={() => setGroupForm({ group: null })}>Buat grup pertama</Button>} /></div>;
  const pageTitle = route.page === "dashboard" ? "Dashboard pemantauan" : NAV.find((item) => item.id === route.page)?.label;
  const cameraContent = cameras.length ? <div className={`camera-grid ${cameras.length === 1 ? "single" : ""}`}>{cameras.slice(0, route.page === "dashboard" ? 4 : cameras.length).map((camera) => <CameraCard key={camera.id} camera={camera} canManage={owner} onDelete={(item) => { setDeleteError(""); setDeleteCamera(item); }} onOpen={(item) => setLiveId(item.id)} />)}</div> : <EmptyState image="/assets/empty-kamera-offline.svg" title="Belum ada kamera terdaftar" description={owner ? "Tambahkan kamera untuk mulai memantau ruangan di grup ini." : "Admin grup dapat menambahkan kamera untuk pemantauan."} action={owner && <Button icon={Plus} onClick={() => setCameraForm(group.id)}>Tambah kamera</Button>} />;

  return <div className="min-h-screen bg-gray-50">
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>Lewati ke konten</a>
    {drawer && <div className="fixed inset-0 z-40 bg-gray-900/50 xl:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}
    <AppSidebar panelRef={sidebarRef} nav={NAV} activePage={route.page} open={drawer} onClose={() => setDrawer(false)} alertCount={data.alerts.length} alertLimit={data.limit} group={group} />

    <div className="xl:ml-[240px]" inert={drawer ? "" : undefined}>
      <AppHeader
        toggleRef={drawerButton} drawerOpen={drawer} onOpenDrawer={() => setDrawer(true)}
        groups={groups} groupId={groupId} loading={data.loading}
        onSelectGroup={(id) => { data.selectGroup(id); setEventSeed(null); if (route.eventId) navigation("events"); }}
        connected={data.connected} alertCount={data.alerts.length}
        onBellClick={() => (data.alerts.length ? reviewAlerts() : navigation("events"))}
        user={user} onLogout={onLogout}
      />
      <main id="main-content" className="content" tabIndex={-1}>
        <InlineError message={data.error} onRetry={data.refresh} />
        {groupReady && !data.connected && <div className="alert alert-warning" role="status"><WifiOff /><span>Pembaruan belum terhubung. Data mungkin belum terbaru.</span><Button variant="ghost" icon={RefreshCw} loading={data.refreshing} onClick={data.refresh}>Segarkan</Button></div>}
        {data.loading ? <div className="panel" aria-busy="true" aria-label="Memuat dashboard"><SigapLoader label="Memuat dashboard pemantauan…" sublabel="Mengambil data grup, kamera, dan kejadian terbaru." /></div> : <>
          {!["groups", "group", "members"].includes(route.page) && <PageBreadcrumb title={pageTitle} actions={route.page === "cameras" && owner ? <Button icon={Plus} onClick={() => setCameraForm(group.id)}>Tambah kamera</Button> : <Button variant="secondary" icon={RefreshCw} loading={data.refreshing} onClick={data.refresh}>Segarkan</Button>} />}

          {groupReady && data.alerts.length > 0 && <div className="alert alert-danger active-alert" role="status"><span className="alert-symbol"><AlertTriangle /></span><div className="alert-copy"><strong>{data.alerts.length === data.limit ? `Setidaknya ${data.limit}` : data.alerts.length} kejadian perlu ditindaklanjuti</strong><span>{group.nama_grup} · Belum ditangani pada data yang dimuat.</span></div><Button variant="danger" icon={ArrowRight} onClick={reviewAlerts}>Tinjau kejadian</Button></div>}

          {route.page === "groups" ? <GroupsPage groups={groups} user={user} onSelect={(id) => { data.selectGroup(id); navigation("group"); }} onCreate={() => setGroupForm({ group: null })} onEdit={(item) => setGroupForm({ group: item })} />
            : data.groupLoading && !group ? <div className="panel" aria-busy="true" aria-label="Memuat grup"><SigapLoader label="Memuat grup keluarga…" sublabel="Menyiapkan informasi kamera dan anggota grup." /></div>
            : !group ? (data.error ? null : noGroup)
            : <>
              {route.page === "dashboard" && <>
                <InlineError message={data.summaryError} onRetry={data.refreshEvents} />
                {/* Grid 12 kolom mengikuti halaman dasbor TailAdmin: kiri 7, kanan 5 */}
                <div className="grid grid-cols-12 gap-4 md:gap-6">
                  <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-7">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
                      <MetricCard icon={Camera} tone="brand" label="Kamera online" value={<>{online}<span className="text-lg font-medium text-gray-400"> / {cameras.length}</span></>} badge={cameras.length > 0 && (online === cameras.length ? <Pill tone="success">Semua aktif</Pill> : <Pill>{cameras.length - online} offline</Pill>)} />
                      <MetricCard icon={Bell} tone={data.alerts.length ? "danger" : "neutral"} label="Belum ditangani" value={data.summaryError ? "—" : data.alerts.length} loading={data.summaryLoading} badge={data.alerts.length > 0 && <Pill tone="danger">Perlu ditinjau</Pill>} />
                    </div>
                    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-normal text-gray-800">Kamera ruangan</h2><p className="mt-1 text-sm text-gray-500">{online} dari {cameras.length} kamera online</p></div><a className="btn btn-secondary" href="#/cameras">Lihat semua</a></div>
                      {cameraContent}
                    </section>
                  </div>
                  <div className="col-span-12 xl:col-span-5">
                    <MonitoringCard group={group} events={data.recentEvents} todayCount={data.todayEvents.length} alertCount={data.alerts.length} loading={data.summaryLoading} error={data.summaryError} />
                  </div>
                  <section className="col-span-12 overflow-hidden rounded-2xl border border-gray-200 bg-white pt-5 sm:pt-6 xl:col-span-7">
                    <div className="mb-4 flex items-start justify-between gap-3 px-5 sm:px-6"><div><h2 className="text-lg font-semibold tracking-normal text-gray-800">Kejadian terbaru</h2><p className="mt-1 text-sm text-gray-500">Lima kejadian terakhir di grup ini</p></div><a className="btn btn-secondary" href="#/events">Lihat semua</a></div>
                    <EventTable events={data.recentEvents.slice(0, 5)} loading={data.summaryLoading} error={data.summaryError} onRetry={data.refreshEvents} onOpen={openEvent} limit={data.limit} />
                  </section>
                  <div className="col-span-12 xl:col-span-5"><MembersCard group={group} /></div>
                </div>
              </>}
              {route.page === "group" && <GroupDetailPage group={group} user={user} onEdit={(item) => setGroupForm({ group: item })} onNavigate={navigation} onCreateCamera={() => setCameraForm(group.id)} />}
              {route.page === "cameras" && <section className="panel"><div className="section-header"><div><h2>{group.nama_grup}</h2><p>{online} dari {cameras.length} kamera online</p></div><span className="badge badge-neutral"><Camera />Kamera grup</span></div>{cameraContent}</section>}
              {route.page === "members" && <MembersPage group={group} user={user} onRemove={(id) => data.removeMember(id, group.id)} />}
              {route.page === "events" && <><EventFilters filters={data.filters} onChange={data.setFilters} /><section className="panel table-panel"><div className="section-header"><div><h2>Riwayat kejadian</h2><p>{group.nama_grup}</p></div>{data.eventsLoading && <span className="muted small" role="status">Memperbarui…</span>}</div><EventTable events={data.events} loading={data.eventsLoading} error={data.eventsError} onRetry={data.refreshEvents} onOpen={openEvent} limit={data.limit} filtered={filtered} /></section></>}
            </>}
        </>}
        <footer className="content-footer"><span>SIGAP · Hadir untuk keluarga.</span><span>Waktu ditampilkan dalam WIB · Pemantauan grup aktif</span></footer>
      </main>
    </div>
    {data.notice && <div className="toast" role={data.notice.type === "alert" ? "alert" : "status"}>{data.notice.type === "alert" ? <Bell size={20} /> : <CheckCircle2 size={20} />}<span>{data.notice.message}</span>{data.notice.type === "alert" && <Button variant="ghost" onClick={() => { data.refreshEvents(); navigation(`events/${data.notice.eventId}`); data.clearNotice(); }}>Tinjau</Button>}<button className="icon-button" aria-label="Tutup pemberitahuan" onClick={data.clearNotice}><X size={17} /></button></div>}
    {groupForm && <GroupFormDialog group={groupForm.group} onClose={() => setGroupForm(null)} onSubmit={async (payload) => { if (groupForm.group) await data.updateGroup(payload, groupForm.group.id); else { await data.createGroup(payload); navigation("group"); } }} />}
    {cameraForm && <CameraFormDialog onClose={() => setCameraForm(null)} onSubmit={(payload) => data.addCamera(payload, cameraForm)} />}
    {deleteCamera && <Modal title={`Hapus kamera ${deleteCamera.nama_ruangan}?`} description="Kamera dan riwayat kejadian terkait akan dihapus. Tindakan ini tidak dapat dibatalkan." onClose={() => { if (!deleteBusy) setDeleteCamera(null); }} footer={<><Button variant="secondary" disabled={deleteBusy} onClick={() => setDeleteCamera(null)}>Batal</Button><Button variant="secondary" icon={Trash2} loading={deleteBusy} onClick={confirmDeleteCamera}>Ya, hapus kamera</Button></>}><p>Pastikan kamera ini tidak lagi diperlukan untuk pemantauan grup.</p><InlineError message={deleteError} /></Modal>}
    {liveCamera && <LiveViewDialog key={liveCamera.id} camera={liveCamera} group={group} canManage={owner} onClose={() => setLiveId(null)} onSourceChange={() => data.refresh()} />}
    {route.eventId && <EventDetail key={route.eventId} eventId={route.eventId} initialEvent={detailEvent} group={group} user={user} onClose={() => navigation("events")} onUpdated={(event) => { setEventSeed(event); data.acceptEvent(event); data.refreshEvents(); }} />}
  </div>;
}
