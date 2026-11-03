import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, Copy, Home, Pencil, Phone, Plus, ShieldCheck, UserMinus, Users, Video } from "lucide-react";
import { Button, EmptyState, InlineError, Modal } from "../components/Ui";
import { errorMessage, formatDate, isOwner } from "../utils/format";

function initials(name) {
  return (name || "Anggota").replace(/[()]/g, "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function CopyValue({ value, label = "Salin", code = false }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { setCopied(false); setCopyError(""); }, [value]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    setCopyError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value || "");
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError("Belum dapat menyalin otomatis. Pilih dan salin teks di atas secara manual.");
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }
  return (
    <div className="copy-value">
      <input ref={inputRef} className={code ? "invite-code" : "copy-input"} value={value || ""} readOnly aria-label={code ? "Kode undangan grup" : "Nomor kontak darurat"} onFocus={(event) => event.target.select()} />
      <Button variant={code ? "primary" : "secondary"} icon={copied ? Check : Copy} onClick={copy} disabled={!value}>{copied ? "Tersalin" : label}</Button>
      <span className="sr-only" aria-live="polite">{copied ? "Berhasil disalin." : ""}</span>
      {copyError && <p className="field-hint" role="status">{copyError}</p>}
    </div>
  );
}

function InviteCodeCard({ group }) {
  return (
    <section className="panel invite-card">
      <h2>Undang keluarga</h2>
      <p className="muted">Bagikan kode berikut agar keluarga dapat bergabung ke {group.nama_grup} melalui aplikasi SIGAP.</p>
      <CopyValue code value={group.kode_undangan} label="Salin kode undangan" />
      <p className="invite-note"><ShieldCheck size={16} aria-hidden="true" /> Bagikan hanya kepada keluarga yang Anda percaya.</p>
    </section>
  );
}

export function GroupsPage({ groups = [], user, onSelect, onCreate, onEdit }) {
  return (
    <>
      <div className="page-header">
        <div><h1>Grup keluarga</h1><p className="muted">Satu tempat untuk setiap keluarga yang Anda dampingi.</p></div>
        <Button icon={Plus} onClick={onCreate}>Buat grup</Button>
      </div>
      {!groups.length ? (
        <div className="panel"><EmptyState image="/assets/empty-belum-grup.svg" title="Mulai dari satu keluarga" description="Buat grup pemantauan pertama, tambahkan kamera, lalu undang anggota keluarga." action={<Button icon={Plus} onClick={onCreate}>Buat grup pertama</Button>} /></div>
      ) : (
        <div className="group-grid">
          {groups.map((group) => {
            const cameras = group.cameras || [];
            const owner = isOwner(user, group);
            return (
              <article className="panel group-card" key={group.id}>
                <div className="group-card-heading"><div className="group-card-icon"><Home size={24} aria-hidden="true" /></div><span className={`badge ${owner ? "badge-dark" : "badge-neutral"}`}>{owner ? "Dikelola Anda" : "Anggota grup"}</span></div>
                <h2>{group.nama_grup}</h2>
                <p className="muted">Mendampingi {group.nama_lansia}</p>
                <div className="group-card-stats"><span><Camera size={17} aria-hidden="true" /> {cameras.filter((camera) => camera.status === "online").length}/{cameras.length} kamera online</span><span><Users size={17} aria-hidden="true" /> {(group.members || []).length} anggota</span></div>
                <div className="group-card-footer"><Button variant="secondary" icon={ArrowRight} onClick={() => onSelect(group.id)}>Buka grup</Button>{owner && <button className="icon-button" type="button" aria-label={`Edit informasi ${group.nama_grup}`} onClick={() => onEdit(group)}><Pencil size={18} aria-hidden="true" /></button>}</div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

export function GroupDetailPage({ group, user, onEdit, onNavigate, onCreateCamera }) {
  if (!group) return null;
  const cameras = group.cameras || [];
  const owner = isOwner(user, group);
  return (
    <>
      <div className="page-header">
        <div><h1>{group.nama_grup}</h1><p className="muted">Terhubung untuk mendampingi {group.nama_lansia}.</p></div>
        {owner && <Button variant="secondary" icon={Pencil} onClick={() => onEdit(group)}>Edit informasi</Button>}
      </div>
      <div className="detail-grid">
        <section className="panel group-information">
          <div className="section-heading"><h2>Informasi grup</h2><Home size={21} aria-hidden="true" /></div>
          <dl className="info-list">
            <div><dt>Nama grup</dt><dd>{group.nama_grup}</dd></div>
            <div><dt>Nama lansia</dt><dd>{group.nama_lansia}</dd></div>
            <div><dt>Akses Anda</dt><dd>{owner ? "Admin grup" : "Anggota grup"}</dd></div>
          </dl>
          <div className="contact-block"><h3><Phone size={18} aria-hidden="true" /> Kontak darurat</h3><p className="muted">Nomor yang dapat dihubungi saat diperlukan.</p><CopyValue value={group.kontak_darurat} label="Salin nomor" /></div>
        </section>
        <InviteCodeCard group={group} />
      </div>
      <div className="shortcut-grid">
        <button type="button" className="panel shortcut-card" onClick={() => onNavigate("cameras")}><span className="group-card-icon"><Camera size={24} /></span><span><strong>{cameras.length} kamera terdaftar</strong><small>{cameras.filter((camera) => camera.status === "online").length} online · Kelola pemantauan ruangan</small></span><ArrowRight size={20} /></button>
        <button type="button" className="panel shortcut-card" onClick={() => onNavigate("members")}><span className="group-card-icon"><Users size={24} /></span><span><strong>{(group.members || []).length} anggota keluarga</strong><small>Lihat anggota dan akses grup</small></span><ArrowRight size={20} /></button>
      </div>
      {!cameras.length && owner && <div className="panel setup-prompt"><div><h2>Langkah berikutnya: tambahkan kamera</h2><p className="muted">Daftarkan kamera ruangan untuk mulai menyiapkan pemantauan.</p></div><Button icon={Plus} onClick={onCreateCamera}>Tambahkan kamera</Button></div>}
    </>
  );
}

export function MembersPage({ group, user, onRemove }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  useEffect(() => { setMemberToRemove(null); setInviteOpen(false); setError(""); setNotice(""); }, [group?.id]);
  if (!group) return null;
  const owner = isOwner(user, group);
  const members = group.members || [];

  async function confirmRemove() {
    if (!memberToRemove || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onRemove(memberToRemove.user_id);
      setNotice(`${memberToRemove.nama} telah dikeluarkan dari grup.`);
      setMemberToRemove(null);
    } catch (err) {
      setError(errorMessage(err, "Anggota belum dapat dikeluarkan. Silakan coba lagi."));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header"><div><h1>Anggota keluarga</h1><p className="muted">Orang-orang yang terhubung dalam pemantauan ini.</p></div><Button icon={Plus} onClick={() => setInviteOpen(true)}>Undang anggota</Button></div>
      {notice && <p className="alert alert-success" role="status"><Check size={18} aria-hidden="true" /> {notice}</p>}
      <section className="panel">
        <div className="section-heading"><h2>{members.length} anggota</h2><span className="muted">{owner ? "Anda mengelola grup ini" : "Akses anggota grup"}</span></div>
        {!members.length ? <EmptyState title="Belum ada anggota tercatat" description="Bagikan kode undangan untuk menghubungkan keluarga ke grup ini." action={<Button variant="secondary" onClick={() => setInviteOpen(true)}>Lihat kode undangan</Button>} /> : (
          <div className="table-wrap"><table className="data-table member-table"><caption className="sr-only">Anggota {group.nama_grup}</caption><thead><tr><th scope="col">Anggota</th><th scope="col">Peran</th><th scope="col">Bergabung</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead><tbody>
            {members.map((member) => {
              const groupAdmin = Number(member.user_id) === Number(group.admin_id);
              return <tr key={member.user_id}><td data-label="Anggota"><div className="member-name"><span className="avatar" aria-hidden="true">{initials(member.nama)}</span><span><strong>{member.nama}{Number(member.user_id) === Number(user.id) ? " (Anda)" : ""}</strong><small>{member.email}</small></span></div></td><td data-label="Peran"><span className={`badge ${groupAdmin ? "badge-dark" : "badge-neutral"}`}>{groupAdmin ? "Admin grup" : "Anggota"}</span></td><td data-label="Bergabung">{member.joined_at ? formatDate(member.joined_at) : "—"}</td><td>{owner && !groupAdmin && <Button variant="ghost" icon={UserMinus} aria-label={`Keluarkan ${member.nama} dari grup`} onClick={() => { setError(""); setMemberToRemove(member); }}>Keluarkan</Button>}</td></tr>;
            })}
          </tbody></table></div>
        )}
      </section>
      {inviteOpen && <Modal title="Undang anggota keluarga" onClose={() => setInviteOpen(false)}><InviteCodeCard group={group} /></Modal>}
      {memberToRemove && <Modal title={`Keluarkan ${memberToRemove.nama}?`} description={`Akses ${memberToRemove.nama} ke ${group.nama_grup} akan dicabut.`} onClose={() => { if (!busy) setMemberToRemove(null); }} footer={<><Button variant="secondary" onClick={() => setMemberToRemove(null)} disabled={busy}>Batal</Button><Button variant="secondary" icon={UserMinus} loading={busy} onClick={confirmRemove}>{busy ? "Memproses…" : "Ya, keluarkan anggota"}</Button></>}><p>Anggota yang dikeluarkan tidak lagi memiliki akses ke kamera dan kejadian grup ini.</p>{error && <InlineError message={error} />}</Modal>}
    </>
  );
}

export function GroupFormDialog({ group = null, onClose, onSubmit }) {
  const [values, setValues] = useState({ nama_grup: group?.nama_grup || "", nama_lansia: group?.nama_lansia || "", kontak_darurat: group?.kontak_darurat || "+62 895-6006-86367" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  function setField(key, value) { setValues((previous) => ({ ...previous, [key]: value })); }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
    if (payload.nama_grup.length < 2 || payload.nama_lansia.length < 2) { setError("Nama grup dan nama lansia harus berisi minimal 2 karakter."); return; }
    if (payload.kontak_darurat.length < 5) { setError("Isi nomor kontak darurat yang dapat dihubungi (minimal 5 karakter)."); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try { await onSubmit(payload); onClose(); }
    catch (err) { setError(errorMessage(err, "Grup belum dapat disimpan. Silakan coba lagi.")); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <Modal title={group ? "Edit informasi grup" : "Buat grup keluarga"} description={group ? "Perbarui informasi dan kontak untuk grup ini." : "Satu grup untuk satu rumah atau satu lansia yang Anda dampingi."} onClose={() => { if (!busy) onClose(); }} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Batal</Button><Button type="submit" form="group-form" loading={busy}>{busy ? "Menyimpan…" : group ? "Simpan perubahan" : "Buat grup"}</Button></>}>
      <form id="group-form" className="form-grid" onSubmit={submit} aria-busy={busy}>
        {error && <InlineError message={error} />}
        <div className="field"><label htmlFor="group-name">Nama grup</label><input id="group-name" value={values.nama_grup} onChange={(event) => setField("nama_grup", event.target.value)} placeholder="Contoh: Rumah Eyang Sri" required minLength={2} maxLength={120} disabled={busy} /></div>
        <div className="field"><label htmlFor="elder-name">Nama lansia</label><input id="elder-name" value={values.nama_lansia} onChange={(event) => setField("nama_lansia", event.target.value)} placeholder="Contoh: Eyang Sri" required minLength={2} maxLength={120} disabled={busy} /></div>
        <div className="field"><label htmlFor="emergency-contact">Nomor WhatsApp / kontak darurat</label><input id="emergency-contact" type="tel" value={values.kontak_darurat} onChange={(event) => setField("kontak_darurat", event.target.value)} placeholder="Contoh: +62 895-6006-86367" required minLength={5} maxLength={30} disabled={busy} aria-describedby="emergency-help" /><p id="emergency-help" className="field-hint">Nomor ini digunakan untuk panggilan &amp; kirim WhatsApp darurat beserta lokasi CCTV di aplikasi HP.</p></div>
      </form>
    </Modal>
  );
}

export function CameraFormDialog({ onClose, onSubmit }) {
  const [room, setRoom] = useState("");
  const [lokasiCctv, setLokasiCctv] = useState("Jl. Merdeka No. 88 (https://maps.google.com/?q=-6.200000,106.816666)");
  const [sourceType, setSourceType] = useState("webcam");
  const [videoSource, setVideoSource] = useState("demo_duduk.mp4");
  const [customSource, setCustomSource] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const source = (sourceType === "webcam" ? "0" : sourceType === "video" ? videoSource : customSource).trim();
    if (room.trim().length < 2) { setError("Nama ruangan harus berisi minimal 2 karakter."); return; }
    if (!source) { setError("Isi sumber kamera sebelum menyimpan."); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try { await onSubmit({ nama_ruangan: room.trim(), sumber: source, lokasi_cctv: lokasiCctv.trim() }); onClose(); }
    catch (err) { setError(errorMessage(err, "Kamera belum dapat didaftarkan. Silakan coba lagi.")); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <Modal title="Tambahkan kamera" description="Daftarkan kamera untuk ruangan yang akan dipantau." onClose={() => { if (!busy) onClose(); }} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Batal</Button><Button type="submit" form="camera-form" icon={Plus} loading={busy}>{busy ? "Menyimpan…" : "Daftarkan kamera"}</Button></>}>
      <form id="camera-form" className="form-grid" onSubmit={submit} aria-busy={busy}>
        {error && <InlineError message={error} />}
        <div className="field"><label htmlFor="camera-room">Nama ruangan</label><input id="camera-room" value={room} onChange={(event) => setRoom(event.target.value)} placeholder="Contoh: Ruang Tamu" required minLength={2} maxLength={100} disabled={busy} /></div>
        <div className="field"><label htmlFor="camera-location">Lokasi / Alamat CCTV (Google Maps)</label><input id="camera-location" value={lokasiCctv} onChange={(event) => setLokasiCctv(event.target.value)} placeholder="Contoh: Jl. Merdeka No. 88 (https://maps.google.com/?q=...)" maxLength={255} disabled={busy} /></div>
        <div className="field"><label htmlFor="camera-type">Sumber kamera</label><select id="camera-type" value={sourceType} onChange={(event) => setSourceType(event.target.value)} disabled={busy}><option value="webcam">Webcam laptop</option><option value="video">Video simulasi</option><option value="custom">Sumber lainnya (lanjutan)</option></select></div>
        {sourceType === "video" && <div className="field"><label htmlFor="camera-video">Video simulasi</label><select id="camera-video" value={videoSource} onChange={(event) => setVideoSource(event.target.value)} disabled={busy}><option value="demo_duduk.mp4">Skenario normal — duduk</option><option value="demo_jatuh.mp4">Skenario jatuh</option></select><p className="field-hint">Gunakan grup demo. Skenario jatuh dapat memicu peringatan kepada anggota grup.</p></div>}
        {sourceType === "custom" && <div className="field"><label htmlFor="camera-source">Alamat atau sumber video</label><input id="camera-source" value={customSource} onChange={(event) => setCustomSource(event.target.value)} maxLength={255} required disabled={busy} aria-describedby="source-help" /><p id="source-help" className="field-hint">Isi indeks webcam, nama berkas video, atau alamat stream sesuai konfigurasi perangkat.</p></div>}
        <p className="camera-setup-note"><Video size={18} aria-hidden="true" /> Setelah didaftarkan, kamera akan tampil online ketika perangkat pemantauan terhubung.</p>
      </form>
    </Modal>
  );
}
