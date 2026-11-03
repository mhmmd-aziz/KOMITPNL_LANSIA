import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, CircleMinus, Copy, ImageOff, MapPin, Phone, Video } from "lucide-react";
import api from "../services/api";
import { Button, InlineError, Modal, SigapLoader } from "./Ui";
import StatusBadge from "./StatusBadge";
import LiveViewDialog from "./LiveViewDialog";

const formatTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Waktu tidak tersedia" : `${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date)} WIB`;
};
const errorText = (error, fallback) => typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;

export default function EventDetail({ eventId, initialEvent, onClose, onUpdated, user, group }) {
  const [event, setEvent] = useState(initialEvent || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [snapshotError, setSnapshotError] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState(null);
  const [openingLive, setOpeningLive] = useState(false);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const updatedRef = useRef(onUpdated);
  const eventRef = useRef(event);
  updatedRef.current = onUpdated;
  eventRef.current = event;

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; requestRef.current += 1; }; }, []);
  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const { data } = await api.get(`/events/${eventId}`);
      if (mountedRef.current && request === requestRef.current) setEvent(data);
    } catch (err) {
      if (mountedRef.current && request === requestRef.current) {
        if ([403, 404].includes(err.response?.status)) setEvent(null);
        setError(errorText(err, "Detail kejadian belum dapat dimuat. Silakan coba lagi."));
      }
    } finally { if (mountedRef.current && request === requestRef.current) setLoading(false); }
  }, [eventId]);

  useEffect(() => {
    setEvent(initialEvent?.id === eventId ? initialEvent : null);
    setSnapshotError(false); setConfirm(null); setNotice(""); setCopied(false);
    load();
  }, [eventId, load]);

  useEffect(() => {
    if (initialEvent?.id !== eventId) return;
    const current = eventRef.current;
    if (current && (current.status !== initialEvent.status || current.handled_by !== initialEvent.handled_by)) {
      requestRef.current += 1;
      setLoading(false);
      setConfirm(null);
      setNotice("Status kejadian telah diperbarui oleh anggota grup.");
    }
    setEvent(initialEvent);
  }, [initialEvent, eventId]);

  async function copyNumber() {
    try { await navigator.clipboard.writeText(event.kontak_darurat); setCopied(true); }
    catch { setNotice("Nomor belum dapat disalin otomatis. Pilih nomor kontak dan salin secara manual."); }
  }

  async function updateStatus() {
    const desired = confirm;
    if (!desired || saving) return;
    const expected = event;
    setSaving(true); setError("");
    try {
      const { data: latest } = await api.get(`/events/${eventId}`);
      if (!mountedRef.current) return;
      const observed = eventRef.current;
      if (latest.status !== expected.status || latest.handled_by !== expected.handled_by || observed?.status !== expected.status || observed?.handled_by !== expected.handled_by) {
        const current = observed?.status !== expected.status || observed?.handled_by !== expected.handled_by ? observed : latest;
        setEvent(current); setConfirm(null);
        setNotice("Status kejadian sudah berubah. Tinjau informasi terbaru sebelum melanjutkan.");
        updatedRef.current?.(current);
        return;
      }
      const { data } = await api.patch(`/events/${eventId}`, { status: desired });
      if (!mountedRef.current) return;
      setEvent(data); setConfirm(null);
      setNotice(desired === "ditangani" ? "Kejadian berhasil ditandai sudah ditangani." : "Kejadian berhasil ditandai sebagai alarm palsu.");
      updatedRef.current?.(data);
    } catch (err) { if (mountedRef.current) setError(errorText(err, "Status belum berhasil disimpan. Silakan coba lagi.")); }
    finally { if (mountedRef.current) setSaving(false); }
  }

  async function openLive() {
    setOpeningLive(true); setError("");
    try {
      const eventGroup = group?.id === event.group_id ? group : (await api.get(`/groups/${event.group_id}`)).data;
      const camera = eventGroup.cameras.find((item) => item.id === event.camera_id);
      if (!camera) throw new Error("missing-camera");
      if (mountedRef.current) setLive({ camera, group: eventGroup });
    } catch (err) { if (mountedRef.current) setError(errorText(err, "Kamera kejadian belum dapat dibuka. Silakan coba lagi.")); }
    finally { if (mountedRef.current) setOpeningLive(false); }
  }

  return <>
    <Modal title={`Detail kejadian #${eventId}`} description="Tinjau kondisi dan koordinasikan tindak lanjut." onClose={saving ? () => {} : onClose} wide>
      <InlineError message={error} onRetry={!event && !loading ? load : undefined} />
      {notice && <div className="alert alert-info" role="status"><CheckCircle2 size={18} aria-hidden="true" /><span>{notice}</span></div>}
      {loading && !event && <SigapLoader size="sm" label="Memuat detail kejadian…" sublabel="Mengambil snapshot dan status penanganan." />}
      {event && <div className="event-detail-grid">
        <div className="event-detail-media">
          <div className="section-label">Snapshot kejadian</div>
          <div className="media-frame snapshot-frame">{snapshotError || !event.snapshot_url ? <div className="media-placeholder"><ImageOff size={32} aria-hidden="true" /><p>Snapshot tidak tersedia.</p></div> : <img src={event.snapshot_url} onError={() => setSnapshotError(true)} alt={`Snapshot ${event.camera_name}, ${formatTime(event.waktu)}`} />}</div>
          <p className="media-caption">Gambar saat kejadian terdeteksi, bukan siaran terkini.</p>
          <Button icon={Video} variant="secondary" loading={openingLive} onClick={openLive}>Lihat kamera langsung</Button>
        </div>
        <div className="detail-facts">
          <StatusBadge status={event.status} />
          <div><h3 className="detail-person">{event.nama_lansia}</h3><p className="muted">{event.nama_grup}</p></div>
          <div className="detail-meta"><p><MapPin size={17} aria-hidden="true" />{event.camera_name}</p><p><CalendarDays size={17} aria-hidden="true" />{formatTime(event.waktu)}</p></div>
          {event.handled_by_name && <p className="handled-note"><CheckCircle2 size={17} aria-hidden="true" />Ditindaklanjuti oleh {event.handled_by_name}</p>}
          <div className="contact-block"><span className="section-label">Kontak darurat</span><strong className="contact-number">{event.kontak_darurat || "Kontak belum tersedia"}</strong>{event.kontak_darurat && <><a className="btn btn-danger" href={`tel:${event.kontak_darurat.replace(/[^+\d]/g, "")}`}><Phone size={18} aria-hidden="true" />Hubungi kontak darurat</a><Button variant="ghost" icon={copied ? Check : Copy} onClick={copyNumber}>{copied ? "Nomor tersalin" : "Salin nomor"}</Button></>}<small className="muted">Panggilan dibuka melalui aplikasi telepon di perangkat Anda.</small></div>
          {event.status === "baru" && <div className="event-actions"><Button variant="success" icon={CheckCircle2} onClick={() => setConfirm("ditangani")} disabled={saving || loading}>Sudah ditangani</Button><Button variant="secondary" icon={CircleMinus} onClick={() => setConfirm("alarm_palsu")} disabled={saving || loading}>Tandai alarm palsu</Button></div>}
          {["ditangani", "alarm_palsu"].includes(event.status) && <details className="event-status-correction">
            <summary className="text-button">Koreksi status</summary>
            <p className="muted">Gunakan jika hasil peninjauan berubah. Nama penanggap akan diperbarui ke akun Anda.</p>
            <div className="event-actions">{event.status === "alarm_palsu" ? <Button variant="secondary" icon={CheckCircle2} onClick={() => setConfirm("ditangani")} disabled={saving || loading}>Ubah menjadi sudah ditangani</Button> : <Button variant="secondary" icon={CircleMinus} onClick={() => setConfirm("alarm_palsu")} disabled={saving || loading}>Ubah menjadi alarm palsu</Button>}</div>
          </details>}
        </div>
      </div>}
    </Modal>
    {confirm && <Modal title={confirm === "ditangani" ? "Tandai sudah ditangani?" : "Tandai sebagai alarm palsu?"} onClose={saving ? () => {} : () => setConfirm(null)} footer={<><Button variant="secondary" disabled={saving} onClick={() => setConfirm(null)}>Batal</Button><Button variant={confirm === "ditangani" ? "success" : "primary"} loading={saving} onClick={updateStatus}>{saving ? "Menyimpan…" : confirm === "ditangani" ? "Ya, sudah ditangani" : "Ya, alarm palsu"}</Button></>}>
      <p>{confirm === "ditangani" ? "Status kejadian akan diperbarui untuk anggota grup. Pastikan kondisi sudah ditindaklanjuti." : "Kejadian tetap tersimpan dalam riwayat dengan status alarm palsu."}</p>
      {error && <InlineError message={error} />}
      <p className="confirmation-context"><AlertTriangle size={18} aria-hidden="true" />{event?.nama_lansia} · {event?.camera_name}</p>
    </Modal>}
    {live && <LiveViewDialog camera={group?.id === live.group.id ? group.cameras.find((camera) => camera.id === live.camera.id) || live.camera : live.camera} group={live.group} canManage={Number(user?.id) === Number(live.group.admin_id)} onClose={() => setLive(null)} />}
  </>;
}
