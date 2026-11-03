"""Entrypoint utama CV Worker SIGAP (CCTV Virtual dari Video Simulasi / Webcam + MJPEG + Speaker)."""

import argparse
import logging
import os
from pathlib import Path
import threading
import time

# Simpan cache konfigurasi lokal agar bebas warning permission di Windows
_WORKER_DIR = Path(__file__).resolve().parent
(_WORKER_DIR / ".yolo_cfg").mkdir(parents=True, exist_ok=True)
(_WORKER_DIR / ".mpl_cfg").mkdir(parents=True, exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", str(_WORKER_DIR / ".yolo_cfg"))
os.environ.setdefault("MPLCONFIGDIR", str(_WORKER_DIR / ".mpl_cfg"))

import cv2  # noqa: E402
import requests  # noqa: E402

import config  # noqa: E402
from detector import STATE_CONFIRMED, STATE_SUSPECTED, FallDetector  # noqa: E402
from stream_server import frame_buffer, start_mjpeg_server  # noqa: E402
from voice_player import consume_pending_source, start_worker_ws_thread  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sigap.worker")


def post_fall_event_async(camera_id: int, confidence: float, snapshot_bytes: bytes) -> None:
    """Kirim event jatuh + snapshot wajah diblur ke Backend di background thread."""
    def _send() -> None:
        url = f"{config.BACKEND_URL}/events"
        headers = {"X-Worker-Key": config.WORKER_API_KEY}
        data = {
            "camera_id": str(camera_id),
            "confidence": f"{confidence:.3f}",
        }
        files = {
            "snapshot": ("snapshot.jpg", snapshot_bytes, "image/jpeg"),
        }
        try:
            resp = requests.post(url, headers=headers, data=data, files=files, timeout=8)
            if resp.ok:
                ev = resp.json()
                logger.info(
                    "EVENT JATUH TERKIRIM! event_id=%s | ruangan=%s",
                    ev.get("id"),
                    ev.get("camera_name"),
                )
            else:
                logger.error("Gagal kirim event (%s): %s", resp.status_code, resp.text)
        except Exception as exc:
            logger.error("Koneksi ke backend gagal saat kirim event: %s", exc)

    threading.Thread(target=_send, daemon=True).start()


def default_video_source() -> str:
    """Gunakan demo_duduk.mp4 secara default bila tersedia (mode tanpa CCTV fisik)."""
    duduk = config.BASE_DIR / "demo_duduk.mp4"
    if duduk.exists():
        return "demo_duduk.mp4"
    jatuh = config.BASE_DIR / "demo_jatuh.mp4"
    if jatuh.exists():
        return "demo_jatuh.mp4"
    return "0"


def resolve_source_path(source_arg: str) -> str | int:
    """Ubah string sumber menjadi indeks webcam atau path absolut file video."""
    clean = source_arg.strip()
    if clean.isdigit():
        return int(clean)
    candidate = Path(clean)
    if not candidate.is_absolute():
        in_worker = config.BASE_DIR / candidate
        if in_worker.exists():
            return str(in_worker)
    return str(candidate)


def open_capture(source_arg: str) -> tuple[cv2.VideoCapture, bool, float, str]:
    """Buka sumber kamera/video dan kembalikan (cap, is_file, target_fps, label)."""
    resolved = resolve_source_path(source_arg)
    is_file = not isinstance(resolved, int)
    cap = cv2.VideoCapture(resolved)
    if not is_file:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        target_fps = 24.0
        label = f"Webcam #{resolved}"
    else:
        vid_fps = cap.get(cv2.CAP_PROP_FPS)
        target_fps = vid_fps if vid_fps and 5.0 <= vid_fps <= 60.0 else 24.0
        label = Path(str(resolved)).name
    return cap, is_file, target_fps, label


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SIGAP CV Worker - CCTV Virtual & Deteksi Jatuh")
    parser.add_argument(
        "--source",
        default=default_video_source(),
        help="Sumber video: 'demo_duduk.mp4', 'demo_jatuh.mp4', atau '0' untuk webcam",
    )
    parser.add_argument(
        "--camera-id",
        type=int,
        default=config.CAMERA_ID,
        help="ID kamera di tabel cameras MySQL",
    )
    parser.add_argument(
        "--no-preview",
        action="store_true",
        help="Jalankan tanpa jendela preview OpenCV lokal",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config.CAMERA_ID = args.camera_id

    model_file = config.BASE_DIR / config.MODEL_PATH
    model_target = str(model_file) if model_file.exists() else config.MODEL_PATH
    logger.info("Memuat model pose %s...", model_target)
    detector = FallDetector(model_target)

    start_mjpeg_server(config.MJPEG_HOST, config.MJPEG_PORT)
    start_worker_ws_thread()

    current_source = args.source
    cap, is_video_file, target_fps, source_label = open_capture(current_source)
    if not cap.isOpened():
        raise RuntimeError(f"Tidak dapat membuka sumber video: {current_source}")

    window_name = "SIGAP CCTV Virtual [1: Normal | 2: Jatuh | z: Set Zona Sofa | r: Reset | q: Keluar]"
    zone_clicks: list[tuple[float, float]] = []
    drawing_zone = False
    frame_shape = [480, 640]

    def switch_to_source(new_src: str) -> None:
        nonlocal cap, is_video_file, target_fps, source_label, current_source, last_valid_frame, hold_until
        new_cap, new_is_file, new_fps, new_label = open_capture(new_src)
        if not new_cap.isOpened():
            logger.error("Sumber video '%s' tidak ditemukan / gagal dibuka!", new_src)
            return
        cap.release()
        cap = new_cap
        is_video_file = new_is_file
        target_fps = new_fps
        source_label = new_label
        current_source = new_src
        last_valid_frame = None
        hold_until = 0.0
        detector.reset_state(clear_cooldown=True)
        logger.info("Berhasil beralih ke sumber CCTV: %s", source_label)

    def on_mouse(event: int, x: int, y: int, _flags: int, _param) -> None:
        nonlocal drawing_zone
        if not drawing_zone:
            return
        if event == cv2.EVENT_LBUTTONDOWN:
            nx = max(0.0, min(1.0, x / max(1, frame_shape[1])))
            ny = max(0.0, min(1.0, y / max(1, frame_shape[0])))
            zone_clicks.append((nx, ny))
            if len(zone_clicks) == 4:
                detector.set_custom_ignore_zone(list(zone_clicks))
                zone_clicks.clear()
                drawing_zone = False
                logger.info("Zona abaikan (kasur/sofa) berhasil diaktifkan!")

    if not args.no_preview:
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(window_name, 960, 540)
        cv2.setMouseCallback(window_name, on_mouse)

    frame_count = 0
    fps = target_fps
    prev_tick = time.perf_counter()
    next_frame_deadline = time.perf_counter()
    last_valid_frame = None
    hold_until = 0.0

    logger.info(
        "CCTV Virtual aktif! Sumber=%s | camera_id=%s | Tekan '1' (Normal) atau '2' (Jatuh).",
        source_label,
        config.CAMERA_ID,
    )

    try:
        while True:
            # Cek apakah ada perintah ganti sumber dari Web Admin via WebSocket
            remote_src = consume_pending_source()
            if remote_src:
                switch_to_source(remote_src)

            now_clock = time.perf_counter()
            if is_video_file and hold_until > now_clock and last_valid_frame is not None:
                frame = last_valid_frame.copy()
                ok = True
            else:
                if hold_until > 0.0 and now_clock >= hold_until:
                    hold_until = 0.0
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    detector.reset_state(clear_cooldown=False)
                ok, frame = cap.read()

            if not ok:
                if is_video_file:
                    # Jika orang sedang tergeletak di akhir video, tahan frame terakhir sebentar
                    if (
                        last_valid_frame is not None
                        and detector.state in (STATE_SUSPECTED, STATE_CONFIRMED)
                        and hold_until == 0.0
                    ):
                        hold_until = time.perf_counter() + 3.0
                        continue
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    detector.reset_state(clear_cooldown=False)
                    continue
                time.sleep(0.05)
                continue

            last_valid_frame = frame
            frame_shape[0], frame_shape[1] = frame.shape[:2]
            frame_count += 1

            now_tick = time.perf_counter()
            dt = max(1e-4, now_tick - prev_tick)
            prev_tick = now_tick
            fps = 0.90 * fps + 0.10 * (1.0 / dt)

            run_infer = (frame_count % config.PROCESS_EVERY_N_FRAMES) == 0 or frame_count == 1
            result = detector.process_frame(frame, fps=fps, run_inference=run_infer)

            if result.should_send_event and result.blurred_snapshot:
                post_fall_event_async(
                    config.CAMERA_ID,
                    result.confidence,
                    result.blurred_snapshot,
                )

            display_frame = result.annotated_frame

            # Tampilkan petunjuk mode simulasi di pojok kiri bawah
            footer_text = f"Sumber: {source_label} | [1] Normal (Duduk)  [2] Simulasi Jatuh  [z] Zona Sofa"
            cv2.rectangle(
                display_frame,
                (0, display_frame.shape[0] - 32),
                (display_frame.shape[1], display_frame.shape[0]),
                (15, 23, 42),
                -1,
            )
            cv2.putText(
                display_frame,
                footer_text,
                (16, display_frame.shape[0] - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (226, 232, 240),
                1,
            )

            if drawing_zone:
                cv2.putText(
                    display_frame,
                    f"KLIK 4 SUDUT KASUR/SOFA ({len(zone_clicks)}/4)",
                    (20, display_frame.shape[0] - 46),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    config.COLOR_IGNORE_ZONE,
                    2,
                )

            frame_buffer.update(display_frame)

            if not args.no_preview:
                cv2.imshow(window_name, display_frame)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break
                if key == ord("1"):
                    switch_to_source("demo_duduk.mp4")
                elif key == ord("2"):
                    switch_to_source("demo_jatuh.mp4")
                elif key == ord("0"):
                    switch_to_source("0")
                elif key == ord("z"):
                    zone_clicks.clear()
                    drawing_zone = True
                    logger.info("Mode set Zona Abaikan: klik 4 sudut area kasur/sofa di layar.")
                elif key == ord("r"):
                    zone_clicks.clear()
                    drawing_zone = False
                    detector.set_custom_ignore_zone([])
                    logger.info("Zona abaikan direset.")

            # Jaga kecepatan pemutaran sesuai FPS asli video agar timer 5 detik akurat real-time
            if is_video_file:
                frame_interval = 1.0 / max(10.0, target_fps)
                next_frame_deadline += frame_interval
                sleep_dur = next_frame_deadline - time.perf_counter()
                if sleep_dur > 0:
                    time.sleep(sleep_dur)
                elif sleep_dur < -0.5:
                    next_frame_deadline = time.perf_counter()
    finally:
        cap.release()
        if not args.no_preview:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
