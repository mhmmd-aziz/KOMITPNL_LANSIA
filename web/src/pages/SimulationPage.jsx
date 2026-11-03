import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Camera,
  Check,
  CheckCircle2,
  Crosshair,
  Film,
  Info,
  Loader2,
  Lock,
  Mic,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Square,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import api, {
  getSimulationStreamUrl,
  getSimulationVideoFileUrl,
} from "../services/api";

/**
 * Konversi rekaman browser (WebM/MP4/Opus) menjadi file WAV PCM 16-bit standar
 * dengan normalisasi volume otomatis agar 100% kompatibel & nyaring di semua HP Android/iOS.
 */
async function convertAudioBlobToWav(rawBlob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return { blob: rawBlob, ext: ".webm" };

  const ctx = new AudioCtx({ sampleRate: 24000 });
  try {
    const arrayBuf = await rawBlob.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arrayBuf);
    const channelData = audioBuf.getChannelData(0);
    const numSamples = channelData.length;
    const sampleRate = audioBuf.sampleRate || 24000;

    // Normalisasi penguatan suara mikrofon laptop agar terdengar jelas di speaker HP
    let peak = 0;
    for (let i = 0; i < numSamples; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;
    }
    const gain = peak > 0.008 && peak < 0.7 ? Math.min(4.0, 0.88 / peak) : 1.0;

    const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(wavBuffer);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format = 1
    view.setUint16(22, 1, true); // Mono = 1 channel
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // 16-bit
    writeStr(36, "data");
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i] * gain));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return {
      blob: new Blob([wavBuffer], { type: "audio/wav" }),
      ext: ".wav",
    };
  } catch {
    return { blob: rawBlob, ext: ".webm" };
  } finally {
    try {
      await ctx.close();
    } catch {
      // Abaikan
    }
  }
}

export default function SimulationPage() {
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [cameraEntered, setCameraEntered] = useState(false);
  const [loadingCameras, setLoadingCameras] = useState(true);

  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState("");
  const [telemetry, setTelemetry] = useState(null);
  const [workerOnline, setWorkerOnline] = useState(false);

  // Mode tampilan kanan: "calibrate" (Frame ke-1 video asli) | "stream" (live pose AI MJPEG)
  const [previewMode, setPreviewMode] = useState("calibrate");
  const [videoRev, setVideoRev] = useState(() => Date.now());
  const [streamNonce, setStreamNonce] = useState(() => Date.now());
  const [videoReady, setVideoReady] = useState(false);

  // Poligon Area Aman tersimpan per (camera_id, video_name)
  const [savedZones, setSavedZones] = useState([]);
  const [drawingMode, setDrawingMode] = useState(false);
  const [draftPoints, setDraftPoints] = useState([]);
  const [zonesConfirmed, setZonesConfirmed] = useState(false);

  // Interkom 2 arah POV CCTV (Mikrofon Laptop <-> HP Keluarga)
  const [recordingMic, setRecordingMic] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [voiceItems, setVoiceItems] = useState([]);
  const mediaRecorderRef = useRef(null);
  const micChunksRef = useRef([]);
  const lastPlayedFamilyVoiceIdRef = useRef(null);
  const incomingAudioRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [runningAction, setRunningAction] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const mediaBoxRef = useRef(null);

  const activeCameraMeta = cameras.find(
    (c) => c.camera_id === selectedCameraId
  );

  // Muat daftar semua CCTV terdaftar saat masuk menu Lab Simulasi AI
  const fetchAvailableCameras = useCallback(async () => {
    setLoadingCameras(true);
    try {
      const { data } = await api.get("/simulations/videos");
      const camList = data.cameras || [];
      setCameras(camList);
      if (camList.length > 0 && selectedCameraId == null) {
        setSelectedCameraId(camList[0].camera_id);
      }
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail || "Gagal memuat daftar target CCTV."
      );
    } finally {
      setLoadingCameras(false);
    }
  }, [selectedCameraId]);

  useEffect(() => {
    fetchAvailableCameras();
  }, [fetchAvailableCameras]);

  const selectAndPrepareVideo = useCallback(
    async (videoName, camId, bustRev = Date.now()) => {
      if (!videoName || !camId) return;
      setSelectedVideo(videoName);
      setPreviewMode("calibrate");
      setVideoReady(false);
      setVideoRev(bustRev);
      setDraftPoints([]);
      setErrorMsg("");

      try {
        const { data } = await api.post("/simulations/prepare", {
          camera_id: camId,
          video_name: videoName,
        });
        const loaded = data.zones || [];
        setSavedZones(loaded);
        if (loaded.length > 0) {
          setZonesConfirmed(true);
          setDrawingMode(false);
        } else {
          setZonesConfirmed(false);
          setDrawingMode(true);
        }
      } catch (err) {
        setErrorMsg(
          err.response?.data?.detail || "Gagal memuat konfigurasi Area Aman video."
        );
      }
    },
    []
  );

  const enterSelectedCctv = useCallback(
    async (camId) => {
      setSelectedCameraId(camId);
      setCameraEntered(true);
      setErrorMsg("");
      setStatusMsg("");
      setVoiceItems([]);
      lastPlayedFamilyVoiceIdRef.current = null;

      try {
        const { data } = await api.get("/simulations/videos", {
          params: { camera_id: camId },
        });
        const list = data.videos || [];
        setVideos(list);
        const camObj = (data.cameras || []).find((c) => c.camera_id === camId);
        // Prioritaskan sumber video aktif kamera (mis. hasil upload dari HP keluarga)
        const preferred =
          list.find((v) => camObj && v.name === camObj.sumber) || list[0];
        if (preferred) {
          await selectAndPrepareVideo(preferred.name, camId, Date.now());
        } else {
          setSelectedVideo("");
          setSavedZones([]);
        }
      } catch (err) {
        setErrorMsg(
          err.response?.data?.detail || "Gagal membuka sesi CCTV target."
        );
      }
    },
    [selectAndPrepareVideo]
  );

  // Polling telemetri & pesan suara 2 arah HANYA saat sebuah CCTV sudah dimasuki
  useEffect(() => {
    if (!cameraEntered || !selectedCameraId) return;
    let active = true;

    async function pollTelemetryAndVoices() {
      try {
        const [telRes, voiceRes] = await Promise.all([
          api.get("/simulations/telemetry", {
            params: { camera_id: selectedCameraId },
          }),
          api.get(`/cameras/${selectedCameraId}/voices`),
        ]);
        if (!active) return;

        setWorkerOnline(Boolean(telRes.data.online));
        if (telRes.data.telemetry) {
          setTelemetry(telRes.data.telemetry);
        }

        const vList = voiceRes.data.items || [];
        setVoiceItems(vList);

        // Putar otomatis suara terbaru dari HP Keluarga di browser Laptop sebagai cadangan speaker CCTV
        const newestFromFamily = vList.find(
          (item) => item.direction === "family_to_cctv"
        );
        if (newestFromFamily) {
          if (lastPlayedFamilyVoiceIdRef.current === null) {
            lastPlayedFamilyVoiceIdRef.current = newestFromFamily.id;
          } else if (newestFromFamily.id > lastPlayedFamilyVoiceIdRef.current) {
            lastPlayedFamilyVoiceIdRef.current = newestFromFamily.id;
            if (incomingAudioRef.current) {
              incomingAudioRef.current.src = newestFromFamily.url;
              incomingAudioRef.current.play().catch(() => {});
            }
          }
        }
      } catch {
        // Abaikan jeda jaringan sesaat
      }
    }

    pollTelemetryAndVoices();
    const timer = setInterval(pollTelemetryAndVoices, 900);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [cameraEntered, selectedCameraId]);

  // Bersihkan mikrofon saat keluar halaman
  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  async function persistZones(nextZones, customMessage) {
    if (!selectedVideo || !selectedCameraId) return;
    setSavedZones(nextZones);
    setErrorMsg("");
    try {
      const { data } = await api.post("/simulations/zones", {
        camera_id: selectedCameraId,
        video_name: selectedVideo,
        zones: nextZones,
      });
      if (data.videos) setVideos(data.videos);
      setStatusMsg(customMessage || data.message);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail || "Gagal menyimpan Area Aman."
      );
    }
  }

  function handleOverlayClick(e) {
    if (
      previewMode !== "calibrate" ||
      !drawingMode ||
      !mediaBoxRef.current ||
      !selectedVideo ||
      !videoReady
    ) {
      return;
    }
    const rect = mediaBoxRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nx = Math.max(
      0,
      Math.min(1, Number(((e.clientX - rect.left) / rect.width).toFixed(4)))
    );
    const ny = Math.max(
      0,
      Math.min(1, Number(((e.clientY - rect.top) / rect.height).toFixed(4)))
    );

    const nextDraft = [...draftPoints, [nx, ny]];
    if (nextDraft.length === 4) {
      const updatedZones = [...savedZones, nextDraft];
      setDraftPoints([]);
      setDrawingMode(false);
      setZonesConfirmed(true);
      persistZones(
        updatedZones,
        `Area Aman #${updatedZones.length} tersimpan untuk Kamera #${selectedCameraId}! Klik "Mulai Analisis AI (Putar 1x)" pada Langkah 3.`
      );
    } else {
      setDraftPoints(nextDraft);
    }
  }

  async function handleRemoveSingleZone(idx) {
    setPreviewMode("calibrate");
    const nextZones = savedZones.filter((_, i) => i !== idx);
    if (nextZones.length === 0) setZonesConfirmed(false);
    await persistZones(nextZones, `Area Aman #${idx + 1} dihapus.`);
  }

  async function handleClearAllZones() {
    setPreviewMode("calibrate");
    setDrawingMode(true);
    setDraftPoints([]);
    setZonesConfirmed(false);
    await persistZones(
      [],
      "Area Aman direset. Silakan klik 4 titik baru pada gambar ruangan di kanan."
    );
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !selectedCameraId) return;
    setUploading(true);
    setErrorMsg("");
    setStatusMsg("");

    const formData = new FormData();
    formData.append("video", file);
    formData.append("camera_id", String(selectedCameraId));

    try {
      const { data } = await api.post("/simulations/upload", formData);
      setVideos(data.videos || []);
      setStatusMsg(data.message || "Video berhasil diunggah.");
      if (data.uploaded) {
        await selectAndPrepareVideo(data.uploaded, selectedCameraId, Date.now());
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal mengunggah video.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleStartAnalysis() {
    if (!selectedVideo || !selectedCameraId) return;
    setRunningAction(true);
    setDrawingMode(false);
    setDraftPoints([]);
    setErrorMsg("");
    setStatusMsg("");
    try {
      const { data } = await api.post("/simulations/run", {
        camera_id: selectedCameraId,
        video_name: selectedVideo,
        zones: savedZones,
        loop: false,
      });
      setStreamNonce(Date.now());
      setPreviewMode("stream");
      setStatusMsg(data.message);
    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail ||
          "Gagal memulai analisis AI. Silakan coba klik sekali lagi."
      );
    } finally {
      setRunningAction(false);
    }
  }

  async function handleStopAnalysis() {
    if (!selectedCameraId) return;
    setErrorMsg("");
    try {
      await api.post("/simulations/stop", { camera_id: selectedCameraId });
      setPreviewMode("calibrate");
      setStatusMsg("Analisis dihentikan. Kembali ke pratinjau kalibrasi Area Aman.");
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Gagal menghentikan analisis.");
    }
  }

  // Rekam suara dari Mikrofon Laptop (POV CCTV) -> konversi ke WAV 16-bit -> kirim ke HP Keluarga
  async function startLaptopCctvMic() {
    if (!selectedCameraId || recordingMic) return;
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      micChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          micChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = recorder.mimeType || "audio/webm";
        const rawBlob = new Blob(micChunksRef.current, { type: mime });
        if (rawBlob.size < 100) {
          setErrorMsg("Rekaman terlalu singkat. Silakan bicara minimal 1 detik lalu klik Kirim.");
          return;
        }

        setSendingVoice(true);
        try {
          const { blob: wavBlob, ext } = await convertAudioBlobToWav(rawBlob);
          const fd = new FormData();
          fd.append("audio", wavBlob, `pov_cctv${ext}`);
          const { data } = await api.post(
            `/cameras/${selectedCameraId}/cctv-voice`,
            fd
          );
          setStatusMsg(data.message);
          try {
            const vRes = await api.get(`/cameras/${selectedCameraId}/voices`);
            setVoiceItems(vRes.data?.items || []);
          } catch {
            // Abaikan
          }
        } catch (err) {
          setErrorMsg(
            err.response?.data?.detail ||
              "Gagal mengirim suara POV CCTV ke HP Keluarga."
          );
        } finally {
          setSendingVoice(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setRecordingMic(true);
    } catch {
      setErrorMsg(
        "Izin mikrofon browser belum diaktifkan. Klik ikon pengaturan di sebelah kiri URL browser untuk mengizinkan mikrofon Laptop."
      );
    }
  }

  function stopLaptopCctvMic() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setRecordingMic(false);
  }

  // =========================================================================
  // GERBANG PEMILIHAN TARGET CCTV (Agar Simulasi Tidak Masuk ke Semua Grup!)
  // =========================================================================
  if (!cameraEntered) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
            <Lock className="h-3.5 w-3.5 text-teal-700" />
            Isolasi Grup Ketat — Notifikasi &amp; Suara Hanya Masuk ke Pemilik CCTV Terpilih
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">
            Pilih Target CCTV yang Ingin Dimasuki di Lab Simulasi
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Pilih satu unit CCTV tujuan terlebih dahulu agar pengujian deteksi jatuh,
            kalibrasi <strong>Area Aman</strong>, serta <strong>Interkom Suara 2 Arah</strong>{" "}
            hanya terkirim ke grup keluarga pemilik CCTV tersebut (tidak masuk ke keluarga lain).
          </p>

          {loadingCameras ? (
            <div className="flex items-center gap-2 py-10 text-sm font-semibold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              Memuat daftar unit CCTV terdaftar...
            </div>
          ) : cameras.length === 0 ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Belum ada kamera keluarga terdaftar di database. Buat grup &amp; kamera dari
              aplikasi Mobile terlebih dahulu.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {cameras.map((cam) => (
                <div
                  key={cam.camera_id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-teal-600 hover:bg-teal-50/40"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-2.5 py-0.5 text-xs font-bold text-white">
                        <Camera className="h-3.5 w-3.5" />
                        CCTV #{cam.camera_id}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        Grup Keluarga #{cam.group_id}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-extrabold text-slate-900">
                      {cam.nama_ruangan}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-slate-600">
                      Grup: <strong>{cam.group_name}</strong> · Lansia:{" "}
                      <strong>{cam.nama_lansia}</strong>
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      Sumber aktif: {cam.sumber || "siaga"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => enterSelectedCctv(cam.camera_id)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-teal-800"
                  >
                    Masuk ke POV CCTV Ini &rarr;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isAnalysisRunning =
    Boolean(telemetry?.running) && previewMode === "stream";
  const canStartAnalysis =
    Boolean(selectedVideo) &&
    !drawingMode &&
    zonesConfirmed &&
    !isAnalysisRunning;

  return (
    <div className="space-y-6">
      {/* Elemen audio tersembunyi untuk memutar suara masuk dari HP Keluarga */}
      <audio ref={incomingAudioRef} className="hidden" />

      {/* Header Target CCTV Aktif + Tombol Ganti CCTV */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3 py-0.5 text-xs font-bold text-white">
                <Camera className="h-3.5 w-3.5" />
                Target Aktif: CCTV #{selectedCameraId}{" "}
                {activeCameraMeta
                  ? `— ${activeCameraMeta.nama_ruangan} (${activeCameraMeta.group_name})`
                  : ""}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Terkunci Khusus Grup Ini
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              POV CCTV Laptop: Area Aman, Simulasi AI, &amp; Interkom 2 Arah
            </h2>
            <p className="text-sm text-slate-600">
              Seluruh deteksi jatuh &amp; percakapan suara pada layar ini hanya terhubung ke
              HP anggota <strong>{activeCameraMeta?.group_name || "Grup Terpilih"}</strong>.
            </p>
          </div>

          <button
            type="button"
            disabled={isAnalysisRunning}
            onClick={() => setCameraEntered(false)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Ganti Target CCTV
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          {statusMsg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* KOLOM KIRI: LANGKAH 1, 2, 3, & INTERKOM POV CCTV */}
        <div className="space-y-4 lg:col-span-5">
          {/* LANGKAH 1: PILIH / UPLOAD VIDEO */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Langkah 1 — Pilih Simulasi / Video Ruangan
              </h3>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Mengunggah..." : "Unggah Video"}
                <input
                  type="file"
                  accept="video/*"
                  disabled={uploading || isAnalysisRunning}
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="space-y-2">
              {videos.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  Belum ada file video simulasi. Klik Upload Video di atas.
                </p>
              ) : (
                videos.map((v) => {
                  const isSelected = selectedVideo === v.name;
                  return (
                    <button
                      key={v.name}
                      type="button"
                      disabled={isAnalysisRunning}
                      onClick={() =>
                        selectAndPrepareVideo(
                          v.name,
                          selectedCameraId,
                          Date.now()
                        )
                      }
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? "border-teal-600 bg-teal-50/70 ring-1 ring-teal-600"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      } disabled:opacity-60`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Film
                            className={`h-4 w-4 shrink-0 ${
                              isSelected ? "text-teal-700" : "text-slate-400"
                            }`}
                          />
                          <span className="truncate text-sm font-bold text-slate-900">
                            {v.name}
                          </span>
                          {v.source_type === "milik_keluarga" && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                              <Smartphone className="h-2.5 w-2.5" />
                              POV Keluarga
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {v.size_mb} MB ·{" "}
                          {v.zones_count > 0
                            ? `${v.zones_count} Area Aman tersimpan`
                            : "Belum ada Area Aman"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold ${
                          isSelected
                            ? "bg-teal-700 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isSelected ? "Aktif" : "Pilih"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* LANGKAH 2: TANDAI & SIMPAN AREA AMAN */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-slate-900">
              Langkah 2 — Selesaikan Area Aman (4 Titik)
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Tersinkron otomatis dengan pengaturan Area Aman dari HP keluarga pada
              kamera ini. Klik <strong>4 sudut</strong> sofa/kasur di pratinjau kanan.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {!drawingMode ? (
                <button
                  type="button"
                  disabled={!selectedVideo || isAnalysisRunning}
                  onClick={() => {
                    setPreviewMode("calibrate");
                    setDrawingMode(true);
                    setDraftPoints([]);
                    setZonesConfirmed(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  <Crosshair className="h-4 w-4" />
                  {savedZones.length > 0
                    ? "+ Tambah Area Aman Lain"
                    : "+ Tandai Area Aman (4 Titik)"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDraftPoints((pts) => pts.slice(0, -1))}
                    disabled={draftPoints.length === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Batalkan Titik ({draftPoints.length}/4)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawingMode(false);
                      setDraftPoints([]);
                      if (savedZones.length > 0) setZonesConfirmed(true);
                    }}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                  >
                    Batal
                  </button>
                </>
              )}

              {savedZones.length > 0 && !drawingMode && (
                <button
                  type="button"
                  disabled={isAnalysisRunning}
                  onClick={handleClearAllZones}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus Semua
                </button>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {savedZones.length === 0 ? (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  Belum ada Area Aman ditandai pada video ini.
                  {selectedVideo && !zonesConfirmed && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDrawingMode(false);
                          setDraftPoints([]);
                          setZonesConfirmed(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-900"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Ruangan Tanpa Kasur/Sofa (Lanjut Tanpa Area Aman)
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                savedZones.map((_, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-emerald-900">
                      Area Aman #{idx + 1} (4 Titik Tersimpan)
                    </span>
                    <button
                      type="button"
                      disabled={isAnalysisRunning}
                      onClick={() => handleRemoveSingleZone(idx)}
                      className="text-xs font-bold text-red-600 hover:underline disabled:opacity-40"
                    >
                      Hapus
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* LANGKAH 3: MULAI ANALISIS AI */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-slate-900">
              Langkah 3 — Jalankan Analisis AI (Sekali Putar)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {zonesConfirmed
                ? `Siap! Jika jatuh terdeteksi, alarm hanya dikirim ke ${
                    activeCameraMeta?.group_name || "grup kamera ini"
                  }.`
                : "Selesaikan Area Aman pada Langkah 2 terlebih dahulu."}
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!canStartAnalysis || runningAction}
                onClick={handleStartAnalysis}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-extrabold text-white shadow-xs transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {runningAction ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menyiapkan Engine AI...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {isAnalysisRunning
                      ? "Analisis AI Sedang Berjalan..."
                      : previewMode === "stream"
                      ? "Putar Ulang Analisis AI (1x)"
                      : "Mulai Analisis AI (Putar 1x)"}
                  </>
                )}
              </button>

              {isAnalysisRunning && (
                <button
                  type="button"
                  onClick={handleStopAnalysis}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-3 text-xs font-extrabold text-white hover:bg-red-700"
                >
                  <Square className="h-3.5 w-3.5" />
                  Hentikan
                </button>
              )}
            </div>
          </div>

          {/* INTERKOM SUARA 2 ARAH: MIKROFON POV CCTV LAPTOP <-> HP KELUARGA */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-slate-900">
                Interkom 2 Arah POV CCTV (Laptop &harr; HP Keluarga)
              </h3>
              <Volume2 className="h-4 w-4 text-teal-700" />
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Laptop berperan sebagai <strong>POV CCTV di ruangan lansia</strong>:
              suara dari HP keluarga berbunyi di speaker Laptop, dan Anda bisa
              berbicara balik lewat mikrofon Laptop ke HP keluarga!
            </p>

            <div className="mt-3">
              {!recordingMic ? (
                <button
                  type="button"
                  disabled={sendingVoice}
                  onClick={startLaptopCctvMic}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-xs font-extrabold text-white transition hover:bg-teal-800 disabled:opacity-50"
                >
                  <Mic className="h-4 w-4" />
                  {sendingVoice
                    ? "Mengirim Suara ke HP Keluarga..."
                    : "Bicara dari Mikrofon POV CCTV (Kirim ke HP)"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopLaptopCctvMic}
                  className="flex w-full animate-pulse items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-xs font-extrabold text-white hover:bg-amber-700"
                >
                  <Square className="h-3.5 w-3.5" />
                  Sedang Merekam Mikrofon Laptop... Klik untuk Kirim ke HP
                </button>
              )}
            </div>

            {voiceItems.length > 0 && (
              <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {voiceItems.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span
                        className={`font-bold ${
                          item.direction === "cctv_to_family"
                            ? "text-teal-800"
                            : "text-amber-800"
                        }`}
                      >
                        {item.direction === "cctv_to_family"
                          ? "POV CCTV -> HP"
                          : `HP (${item.sender_name}) -> CCTV`}
                      </span>
                    </div>
                    <audio
                      controls
                      preload="none"
                      src={item.url}
                      className="h-7 w-36"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* KOLOM KANAN: WEB PREVIEW INSTAN + SVG OVERLAY 4 TITIK */}
        <div className="space-y-4 lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    workerOnline || videoReady
                      ? "bg-emerald-400"
                      : "bg-amber-400"
                  }`}
                />
                <span className="text-sm font-bold">
                  Pratinjau Ruangan &amp; Pose AI
                </span>
                {selectedVideo && (
                  <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-xs">
                    {selectedVideo}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {previewMode === "stream" && !isAnalysisRunning && (
                  <button
                    type="button"
                    onClick={() => setPreviewMode("calibrate")}
                    className="rounded-md bg-white/15 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/25"
                  >
                    Ubah Area Aman
                  </button>
                )}
                <span className="text-xs font-semibold text-teal-300">
                  {previewMode === "calibrate" && drawingMode
                    ? `Klik Sudut ke-${draftPoints.length + 1} dari 4 di Gambar`
                    : `${savedZones.length} Area Aman Aktif`}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center bg-slate-950">
              {!selectedVideo ? (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
                  <Film className="h-8 w-8 text-slate-500" />
                  <p className="text-sm font-semibold">
                    Pilih atau unggah file video di panel kiri untuk melihat ruangan.
                  </p>
                </div>
              ) : previewMode === "calibrate" ? (
                <div
                  ref={mediaBoxRef}
                  onClick={handleOverlayClick}
                  className={`relative w-full select-none ${
                    drawingMode && videoReady
                      ? "cursor-crosshair ring-4 ring-amber-400 ring-inset"
                      : ""
                  }`}
                >
                  {!videoReady && (
                    <div className="flex aspect-video w-full items-center justify-center gap-2 bg-slate-900 text-xs font-semibold text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin text-teal-400" />
                      Memuat gambar ruangan {selectedVideo}...
                    </div>
                  )}

                  <video
                    key={`${selectedCameraId}-${selectedVideo}-${videoRev}`}
                    src={getSimulationVideoFileUrl(
                      selectedVideo,
                      selectedCameraId,
                      videoRev
                    )}
                    muted
                    playsInline
                    preload="auto"
                    onLoadedMetadata={(e) => {
                      try {
                        e.currentTarget.currentTime = 0.08;
                      } catch {
                        // Abaikan
                      }
                    }}
                    onLoadedData={(e) => {
                      try {
                        e.currentTarget.pause();
                      } catch {
                        // Abaikan
                      }
                      setVideoReady(true);
                    }}
                    onSeeked={() => setVideoReady(true)}
                    className={`w-full bg-slate-950 ${
                      videoReady ? "block h-auto" : "hidden"
                    }`}
                  />

                  {videoReady && (
                    <svg
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    >
                      {savedZones.map((poly, idx) => {
                        const ptsStr = poly
                          .map(([x, y]) => `${x * 1000},${y * 1000}`)
                          .join(" ");
                        const xs = poly.map(([x]) => x * 1000);
                        const ys = poly.map(([, y]) => y * 1000);
                        const badgeX = Math.max(
                          10,
                          Math.min(840, Math.min(...xs))
                        );
                        const badgeY = Math.max(45, Math.min(...ys) - 32);
                        return (
                          <g key={`saved-${idx}`}>
                            <polygon
                              points={ptsStr}
                              fill="rgba(16, 185, 129, 0.25)"
                              stroke="#10B981"
                              strokeWidth="4"
                            />
                            {poly.map(([px, py], pIdx) => (
                              <g key={pIdx}>
                                <circle
                                  cx={px * 1000}
                                  cy={py * 1000}
                                  r="13"
                                  fill="#10B981"
                                  stroke="#FFFFFF"
                                  strokeWidth="2.5"
                                />
                                <text
                                  x={px * 1000}
                                  y={py * 1000 + 4.5}
                                  textAnchor="middle"
                                  fill="#FFFFFF"
                                  fontSize="13"
                                  fontWeight="900"
                                >
                                  {pIdx + 1}
                                </text>
                              </g>
                            ))}
                            <rect
                              x={badgeX}
                              y={badgeY}
                              width="150"
                              height="26"
                              rx="6"
                              fill="#047857"
                            />
                            <text
                              x={badgeX + 10}
                              y={badgeY + 18}
                              fill="#FFFFFF"
                              fontSize="14"
                              fontWeight="bold"
                            >
                              {`AREA AMAN #${idx + 1}`}
                            </text>
                          </g>
                        );
                      })}

                      {draftPoints.length > 0 && (
                        <g>
                          {draftPoints.length >= 2 && (
                            <polygon
                              points={draftPoints
                                .map(([x, y]) => `${x * 1000},${y * 1000}`)
                                .join(" ")}
                              fill="rgba(245, 158, 11, 0.20)"
                              stroke="#F59E0B"
                              strokeWidth="4"
                              strokeDasharray="10 6"
                            />
                          )}
                          {draftPoints.map(([px, py], idx) => (
                            <g key={`draft-${idx}`}>
                              <circle
                                cx={px * 1000}
                                cy={py * 1000}
                                r="14"
                                fill="#F59E0B"
                                stroke="#0F172A"
                                strokeWidth="3"
                              />
                              <text
                                x={px * 1000}
                                y={py * 1000 + 5}
                                textAnchor="middle"
                                fill="#0F172A"
                                fontSize="15"
                                fontWeight="900"
                              >
                                {idx + 1}
                              </text>
                            </g>
                          ))}
                        </g>
                      )}
                    </svg>
                  )}

                  {drawingMode && videoReady && (
                    <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-extrabold text-slate-950 shadow-md">
                      Klik 4 sudut mengelilingi Sofa / Kasur Lantai (
                      {draftPoints.length}/4 titik terpilih)
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative w-full">
                  <img
                    key={streamNonce}
                    src={getSimulationStreamUrl(selectedCameraId, streamNonce)}
                    alt="Live Analisis Pose AI"
                    draggable={false}
                    className="block h-auto min-h-[260px] w-full bg-slate-950"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-slate-200 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Progres Analisis Video (Sekali Putar)</span>
                <span>
                  {previewMode === "stream" && telemetry
                    ? `${telemetry.progress}%`
                    : "0%"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-200 ${
                    telemetry?.state === "JATUH_TERKONFIRMASI"
                      ? "bg-red-600"
                      : telemetry?.state === "KEMUNGKINAN_JATUH"
                      ? "bg-amber-500"
                      : "bg-teal-600"
                  }`}
                  style={{
                    width: `${
                      previewMode === "stream" ? telemetry?.progress || 0 : 0
                    }%`,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">
                    Status / Postur
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-slate-900">
                    {previewMode === "calibrate"
                      ? zonesConfirmed
                        ? `Siap Analisis (${savedZones.length} Area Aman)`
                        : "Menunggu 4 Titik Area Aman"
                      : telemetry?.posture || "Menganalisis..."}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">
                    Sudut Punggung
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {previewMode === "stream" && telemetry
                      ? `${telemetry.torso_angle}°`
                      : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">
                    Rasio Lebar/Tinggi
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {previewMode === "stream" && telemetry
                      ? telemetry.aspect_ratio
                      : "-"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">
                    Waktu Konfirmasi
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">
                    {previewMode === "stream" && telemetry
                      ? `${telemetry.timer_elapsed} / 5.0 dtk`
                      : "0.0 / 5.0 dtk"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4">
            <div className="mb-1.5 flex items-center gap-2 text-teal-900">
              <Info className="h-4 w-4 shrink-0" />
              <h4 className="text-xs font-extrabold tracking-wide uppercase">
                Isolasi Grup &amp; Sinkronisasi HP Keluarga
              </h4>
            </div>
            <p className="text-xs leading-relaxed text-teal-950">
              Jika keluarga mengunggah video ruangan atau menandai{" "}
              <strong>4 Titik Area Aman</strong> dari aplikasi HP mereka sendiri,
              pengaturan tersebut otomatis muncul di kamera ini. Alarm jatuh dan
              suara POV CCTV dari layar ini dijamin <strong>hanya masuk</strong> ke
              anggota grup <strong>{activeCameraMeta?.group_name || "terpilih"}</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
