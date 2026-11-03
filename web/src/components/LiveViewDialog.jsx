import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, RefreshCw, Video, WifiOff } from "lucide-react";
import api, { getCameraStreamUrl } from "../services/api";
import { Button, InlineError, Modal, SigapLoader } from "./Ui";

function errorText(error, fallback) {
  return typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback;
}

export default function LiveViewDialog({ camera, group, onClose, onSourceChange, canManage = false }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(camera.status === "offline" ? "offline" : "loading");
  const [demo, setDemo] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState(camera.sumber);
  const imageRef = useRef(null);
  const mountedRef = useRef(true);
  const attachStreamImage = useCallback((node) => {
    if (imageRef.current && imageRef.current !== node) imageRef.current.removeAttribute("src");
    imageRef.current = node;
  }, []);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { setSource(camera.sumber); }, [camera.sumber]);
  useEffect(() => {
    setState(camera.status === "offline" ? "offline" : "loading");
  }, [camera.id, camera.status]);

  useEffect(() => {
    if (state !== "loading") return undefined;
    // Multipart MJPEG load events vary by browser; check decoded dimensions.
    const check = setInterval(() => {
      if (imageRef.current?.naturalWidth > 0) setState("live");
    }, 200);
    const timeout = setTimeout(() => setState("error"), 10000);
    return () => { clearInterval(check); clearTimeout(timeout); };
  }, [state, attempt, camera.id]);

  function retry() { setAttempt((value) => value + 1); setState("loading"); setError(""); }

  async function switchSource(newSource) {
    setSwitching(true); setError("");
    try {
      const { data } = await api.post(`/cameras/${camera.id}/source`, { sumber: newSource });
      if (!mountedRef.current) return;
      setSource(data.sumber); onSourceChange?.(data); retry();
    } catch (err) {
      if (mountedRef.current) setError(errorText(err, "Sumber kamera belum berhasil diganti. Silakan coba lagi."));
    } finally { if (mountedRef.current) setSwitching(false); }
  }

  return <Modal title={camera.nama_ruangan} description={group?.nama_grup || "Tampilan kamera"} onClose={onClose} wide>
    <div className="live-toolbar"><span className={`badge badge-${state === "live" ? "success" : "neutral"}`}><Video size={14} aria-hidden="true" />{state === "live" ? "Langsung" : state === "loading" ? "Menghubungkan kamera" : "Siaran tidak tersedia"}</span><Button variant="ghost" icon={RefreshCw} onClick={retry} disabled={switching}>Segarkan</Button></div>
    <div className="media-frame live-frame" aria-busy={state === "loading"}>
      {(state === "loading" || state === "live") && <img key={`${camera.id}-${attempt}`} ref={attachStreamImage} src={`${getCameraStreamUrl(camera.id)}&view=${attempt}`} alt={`Siaran langsung ${camera.nama_ruangan}`} onLoad={() => setState("live")} onError={() => setState("error")} />}
      {state === "loading" && <div className="media-overlay" role="status"><SigapLoader size="sm" light label="Menghubungkan kamera…" sublabel={camera.nama_ruangan} /></div>}
      {(state === "offline" || state === "error") && <div className="media-placeholder"><WifiOff size={36} aria-hidden="true" /><h3>{state === "offline" ? "Kamera sedang offline" : "Siaran belum dapat ditampilkan"}</h3><p>Periksa koneksi kamera, lalu coba lagi.</p><Button variant="secondary" icon={RefreshCw} onClick={retry}>Coba lagi</Button></div>}
    </div>
    <p className="media-caption">Siaran terkini dari kamera. Tampilan ini tidak menyimpan rekaman video.</p>
    <InlineError message={error} />
    {canManage && <div className="demo-controls"><button type="button" className="text-button" aria-expanded={demo} onClick={() => setDemo(!demo)}><FlaskConical size={16} aria-hidden="true" />{demo ? "Tutup mode demo" : "Mode demo"}</button>{demo && <div className="demo-panel"><p className="muted">Simulasi dapat memicu peringatan ke grup demo. Gunakan hanya saat pengujian.</p><p className="muted">Sumber: <code>{source}</code></p><div className="button-row"><Button variant="secondary" loading={switching} onClick={() => switchSource("demo_duduk.mp4")}>Simulasi normal</Button><Button variant="secondary" disabled={switching} onClick={() => switchSource("demo_jatuh.mp4")}>Simulasi jatuh</Button></div></div>}</div>}
  </Modal>;
}
