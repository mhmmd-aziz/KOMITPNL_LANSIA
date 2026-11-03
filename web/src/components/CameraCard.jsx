import { Camera, ChevronRight, Trash2, Video } from "lucide-react";
import { Button } from "./Ui";
import StatusBadge from "./StatusBadge";

export default function CameraCard({ camera, onOpen, onDelete, canManage = false }) {
  const online = camera.status === "online";
  return <article className="camera-card panel">
    <div className={`camera-media ${online ? "camera-media-ready" : "camera-media-offline"}`}>
      {online ? <><div className="camera-preview-symbol"><Camera size={38} strokeWidth={1.3} aria-hidden="true" /></div><span>Kamera siap dibuka</span><small>Mulai siaran untuk melihat kondisi terkini</small></> : <><img src="/assets/empty-kamera-offline.svg" alt="" /><span>Kamera belum terhubung</span></>}
      <span className="camera-id">CAM {String(camera.id).padStart(2, "0")}</span>
    </div>
    <div className="camera-footer">
      <div className="camera-title-row"><h3>{camera.nama_ruangan}</h3><StatusBadge status={camera.status} /></div>
      <Button variant="secondary" icon={Video} onClick={() => onOpen(camera)}>{online ? "Lihat langsung" : "Periksa koneksi"}<ChevronRight size={16} aria-hidden="true" /></Button>
      {canManage && onDelete && <Button variant="ghost" icon={Trash2} aria-label={`Hapus kamera ${camera.nama_ruangan}`} onClick={() => onDelete(camera)}>Hapus kamera</Button>}
    </div>
  </article>;
}
