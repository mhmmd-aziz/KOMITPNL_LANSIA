"""Entrypoint CV Worker SIGAP: Headless Web Preview, Kalibrasi Area Aman, & Simulasi 1x Putar."""

import argparse
import logging
import os
from pathlib import Path
import threading
import time

_WORKER_DIR = Path(__file__).resolve().parent
(_WORKER_DIR / ".yolo_cfg").mkdir(parents=True, exist_ok=True)
(_WORKER_DIR / ".mpl_cfg").mkdir(parents=True, exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", str(_WORKER_DIR / ".yolo_cfg"))
os.environ.setdefault("MPLCONFIGDIR", str(_WORKER_DIR / ".mpl_cfg"))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import requests  # noqa: E402

import config  # noqa: E402
from detector import STATE_CONFIRMED, STATE_SUSPECTED, FallDetector  # noqa: E402
from stream_server import frame_buffer, start_mjpeg_server  # noqa: E402
from voice_player import (  # noqa: E402
    consume_worker_command,
    publish_telemetry,
    start_worker_ws_thread,
)

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


def make_standby_frame(title: str, subtitle: str) -> np.ndarray:
    """Buat tampilan layar siaga (ketika belum ada video yang dipilih di Web)."""
    canvas = np.full((720, 1280, 3), (15, 23, 42), dtype=np.uint8)
    cv2.putText(canvas, title, (80, 320), cv2.FONT_HERSHEY_SIMPLEX, 1.15, (255, 255, 255), 2)
    cv2.putText(canvas, subtitle, (80, 370), cv2.FONT_HERSHEY_SIMPLEX, 0.68, (148, 163, 184), 2)
    cv2.putText(
        canvas,
        "1. Pilih Video -> 2. Tandai 4 Titik Area Aman -> 3. Mulai Analisis AI",
        (80, 420),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (94, 234, 212),
        2,
    )
    return canvas


def render_prepare_frame(
    raw_frame: np.ndarray,
    detector: FallDetector,
    video_name: str,
) -> np.ndarray:
    """Gambar frame ke-1 ruangan yang bersih untuk kalibrasi 4 titik Area Aman di Web Preview."""
    canvas = raw_frame.copy()
    h, w = canvas.shape[:2]
    cv2.rectangle(canvas, (0, 0), (w, 46), (15, 23, 42), -1)
    zone_count = len(detector.ignore_zones_norm)
    status_txt = (
        f"SIAP ANALISIS ({zone_count} Area Aman Tersimpan) | {video_name}"
        if zone_count > 0
        else f"LANGKAH 2: Tandai Area Aman di Layar Web | {video_name}"
    )
    dot_col = config.COLOR_NORMAL if zone_count > 0 else (11, 158, 245)
    cv2.circle(canvas, (20, 23), 8, dot_col, -1)
    cv2.putText(
        canvas,
        status_txt,
        (36, 29),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.58,
        (255, 255, 255),
        2,
    )
    return canvas


def resolve_video_path(source_arg: str) -> str | int:
    """Cari file video di cv-worker/simulations/ atau cv-worker/ atau indeks webcam."""
    clean = source_arg.strip()
    if clean.isdigit():
        return int(clean)
    cand = Path(clean)
    if cand.is_absolute() and cand.exists():
        return str(cand)
    in_sim = config.SIMULATIONS_DIR / cand.name
    if in_sim.exists():
        return str(in_sim)
    in_root = config.BASE_DIR / cand.name
    if in_root.exists():
        return str(in_root)
    return str(cand)


def parse_zones_payload(raw_zones) -> list[list[tuple[float, float]]]:
    """Konversi JSON list poligon ke list tuple ternormalisasi."""
    if not raw_zones:
        return []
    return [
        [(float(pt[0]), float(pt[1])) for pt in poly]
        for poly in raw_zones
        if isinstance(poly, list) and len(poly) >= 3
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SIGAP CV Worker (Web Preview Headless)")
    parser.add_argument(
        "--source",
        default="idle",
        help="'idle' (menunggu pilihan video dari Web), path file video, atau '0' (webcam)",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Ulangi video terus-menerus (default: False / putar 1 kali)",
    )
    parser.add_argument(
        "--camera-id",
        type=int,
        default=config.CAMERA_ID,
        help="ID kamera di tabel cameras MySQL",
    )
    parser.add_argument(
        "--show-window",
        action="store_true",
        help="Tampilkan jendela popup OpenCV desktop (default: MATI, semua lewat Web Preview)",
    )
    parser.add_argument(
        "--no-preview",
        action="store_true",
        help="Alias kompatibilitas untuk mode tanpa jendela desktop",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config.CAMERA_ID = args.camera_id
    show_desktop_window = bool(args.show_window and not args.no_preview)

    model_file = config.BASE_DIR / config.MODEL_PATH
    model_target = str(model_file) if model_file.exists() else config.MODEL_PATH
    logger.info("Memuat model pose %s...", model_target)
    detector = FallDetector(model_target)

    start_mjpeg_server(config.MJPEG_HOST, config.MJPEG_PORT)
    start_worker_ws_thread()

    cap: cv2.VideoCapture | None = None
    is_video_file = False
    loop_video = args.loop
    target_fps = 24.0
    total_frames = 0
    current_frame_idx = 0
    source_label = "IDLE"
    mode_state = "idle"  # "idle" | "prepare" | "running" | "finished"
    active_camera_id = config.CAMERA_ID
    preview_raw_frame: np.ndarray | None = None
    last_annotated_frame: np.ndarray | None = None
    hold_end_until = 0.0
    ever_confirmed_in_run = False

    def prepare_video_preview(src_name: str, zones_raw=None) -> None:
        """Muat frame pertama video tanpa menjalankan analisis agar user bisa menandai Area Aman."""
        nonlocal cap, source_label, mode_state, preview_raw_frame, last_annotated_frame
        nonlocal hold_end_until, ever_confirmed_in_run

        if cap is not None:
            cap.release()
            cap = None

        if zones_raw is not None:
            detector.set_ignore_zones(parse_zones_payload(zones_raw))

        resolved = resolve_video_path(src_name)
        if isinstance(resolved, int):
            return
        tmp_cap = cv2.VideoCapture(resolved)
        if not tmp_cap.isOpened():
            logger.error("Gagal memuat pratinjau video: %s", src_name)
            return
        ok, first_frame = tmp_cap.read()
        tmp_cap.release()
        if not ok or first_frame is None:
            logger.error("Gagal membaca frame pertama video: %s", src_name)
            return

        source_label = Path(str(resolved)).name
        preview_raw_frame = first_frame
        last_annotated_frame = None
        hold_end_until = 0.0
        ever_confirmed_in_run = False
        mode_state = "prepare"
        detector.reset_state(clear_cooldown=True)
        frame_buffer.update(render_prepare_frame(preview_raw_frame, detector, source_label))
        logger.info(
            "Frame pratinjau '%s' dimuat ke Web (%s Area Aman aktif).",
            source_label,
            len(detector.ignore_zones_norm),
        )

    def start_source(src_name: str, loop_flag: bool = False, zones_raw=None) -> None:
        nonlocal cap, is_video_file, loop_video, target_fps, total_frames
        nonlocal current_frame_idx, source_label, mode_state, preview_raw_frame
        nonlocal last_annotated_frame, hold_end_until, ever_confirmed_in_run

        if cap is not None:
            cap.release()
            cap = None

        if zones_raw is not None:
            detector.set_ignore_zones(parse_zones_payload(zones_raw))

        if src_name.lower() in ("idle", "stop", "none", ""):
            hold_end_until = 0.0
            detector.reset_state(clear_cooldown=True)
            if preview_raw_frame is not None and source_label != "IDLE":
                mode_state = "prepare"
                last_annotated_frame = None
                frame_buffer.update(
                    render_prepare_frame(preview_raw_frame, detector, source_label)
                )
            else:
                source_label = "IDLE"
                mode_state = "idle"
                last_annotated_frame = None
            return

        resolved = resolve_video_path(src_name)
        is_video_file = not isinstance(resolved, int)
        new_cap = cv2.VideoCapture(resolved)
        if not new_cap.isOpened():
            logger.error("Gagal membuka sumber video: %s", src_name)
            mode_state = "idle"
            return

        if not is_video_file:
            new_cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            new_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            target_fps = 24.0
            total_frames = 0
            source_label = f"Webcam #{resolved}"
        else:
            vid_fps = new_cap.get(cv2.CAP_PROP_FPS)
            target_fps = vid_fps if vid_fps and 5.0 <= vid_fps <= 60.0 else 24.0
            total_frames = max(1, int(new_cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0))
            source_label = Path(str(resolved)).name

        cap = new_cap
        loop_video = loop_flag
        current_frame_idx = 0
        hold_end_until = 0.0
        ever_confirmed_in_run = False
        mode_state = "running"
        detector.reset_state(clear_cooldown=True)
        logger.info(
            "Memulai analisis AI pada '%s' (%s Area Aman aktif, putar 1x=%s)",
            source_label,
            len(detector.ignore_zones_norm),
            not loop_flag,
        )

    if args.source.lower() != "idle":
        start_source(args.source, loop_flag=args.loop)

    window_name = "SIGAP CV Worker"
    if show_desktop_window:
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(window_name, 960, 540)

    fps = 24.0
    prev_tick = time.perf_counter()
    next_frame_deadline = time.perf_counter()
    raw_last_frame: np.ndarray | None = None

    logger.info("CV Worker aktif (mode Web Preview tanpa popup window desktop).")

    try:
        while True:
            while True:
                cmd = consume_worker_command()
                if cmd is None:
                    break
                if cmd.get("target_camera_id"):
                    try:
                        active_camera_id = int(cmd["target_camera_id"])
                    except (TypeError, ValueError):
                        pass
                ctype = cmd.get("type")
                if ctype == "simulation.prepare":
                    vid = str(cmd.get("video_name") or "")
                    if vid:
                        prepare_video_preview(vid, zones_raw=cmd.get("zones"))
                elif ctype in ("simulation.run", "source.switch"):
                    vid = str(cmd.get("video_name") or cmd.get("source") or "")
                    start_source(
                        vid,
                        loop_flag=bool(cmd.get("loop", False)),
                        zones_raw=cmd.get("zones"),
                    )
                    next_frame_deadline = time.perf_counter()
                elif ctype == "simulation.stop":
                    start_source("idle")
                elif ctype == "simulation.zones":
                    parsed_zones = parse_zones_payload(cmd.get("zones") or [])
                    detector.set_ignore_zones(parsed_zones)
                    logger.info("Area Aman diperbarui (%s poligon aktif).", len(parsed_zones))
                    if cap is None and preview_raw_frame is not None:
                        mode_state = "prepare"
                        last_annotated_frame = None
                        frame_buffer.update(
                            render_prepare_frame(preview_raw_frame, detector, source_label)
                        )

            # Mode tidak sedang memutar analisis (idle / prepare / finished)
            if cap is None:
                if mode_state == "finished" and last_annotated_frame is not None:
                    display_frame = last_annotated_frame
                    posture_txt = (
                        "Simulasi Selesai - JATUH TERDETEKSI"
                        if ever_confirmed_in_run
                        else "Simulasi Selesai - AMAN"
                    )
                    progress_val = 100
                elif preview_raw_frame is not None:
                    display_frame = render_prepare_frame(
                        preview_raw_frame, detector, source_label
                    )
                    posture_txt = (
                        f"Siap Analisis ({len(detector.ignore_zones_norm)} Area Aman)"
                        if detector.ignore_zones_norm
                        else "Menunggu Kalibrasi Area Aman"
                    )
                    progress_val = 0
                else:
                    display_frame = make_standby_frame(
                        "SIGAP AI SANDBOX SIAGA",
                        "Pilih atau unggah video di panel kiri untuk memuat pratinjau ruangan.",
                    )
                    posture_txt = "Pilih Video Terlebih Dahulu"
                    progress_val = 0

                frame_buffer.update(display_frame)
                publish_telemetry(
                    {
                        "type": "simulation.telemetry",
                        "camera_id": active_camera_id,
                        "mode": mode_state,
                        "running": False,
                        "source": source_label,
                        "zones_count": len(detector.ignore_zones_norm),
                        "progress": progress_val,
                        "state": (
                            "JATUH_TERKONFIRMASI"
                            if (mode_state == "finished" and ever_confirmed_in_run)
                            else "NORMAL"
                        ),
                        "posture": posture_txt,
                        "torso_angle": 0.0,
                        "aspect_ratio": 0.0,
                        "timer_elapsed": 0.0,
                    }
                )
                if show_desktop_window:
                    cv2.imshow(window_name, display_frame)
                    if (cv2.waitKey(40) & 0xFF) in (ord("q"), 27):
                        break
                else:
                    time.sleep(0.08)
                continue

            now_clock = time.perf_counter()
            if is_video_file and hold_end_until > now_clock and raw_last_frame is not None:
                frame = raw_last_frame.copy()
                ok = True
            else:
                if hold_end_until > 0.0 and now_clock >= hold_end_until:
                    ok = False
                    frame = None
                else:
                    ok, frame = cap.read()

            if not ok or frame is None:
                if is_video_file:
                    if (
                        raw_last_frame is not None
                        and detector.state == STATE_SUSPECTED
                        and hold_end_until == 0.0
                    ):
                        hold_end_until = time.perf_counter() + 3.5
                        continue

                    if loop_video:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        current_frame_idx = 0
                        hold_end_until = 0.0
                        detector.reset_state(clear_cooldown=False)
                        continue

                    cap.release()
                    cap = None
                    mode_state = "finished"
                    if last_annotated_frame is not None:
                        fin = last_annotated_frame.copy()
                        verdict = (
                            "ANALISIS SELESAI: JATUH TERKONFIRMASI (FCM TERKIRIM)"
                            if ever_confirmed_in_run
                            else "ANALISIS SELESAI: KONDISI AMAN (TIDAK ADA ALARM)"
                        )
                        banner_col = (
                            config.COLOR_CONFIRMED
                            if ever_confirmed_in_run
                            else config.COLOR_NORMAL
                        )
                        cv2.rectangle(
                            fin,
                            (0, fin.shape[0] - 48),
                            (fin.shape[1], fin.shape[0]),
                            banner_col,
                            -1,
                        )
                        cv2.putText(
                            fin,
                            verdict,
                            (20, fin.shape[0] - 16),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.65,
                            (255, 255, 255),
                            2,
                        )
                        last_annotated_frame = fin
                        frame_buffer.update(fin)
                    logger.info("Analisis '%s' selesai diputar 1 kali.", source_label)
                    continue

                time.sleep(0.05)
                continue

            if current_frame_idx == 0:
                preview_raw_frame = frame.copy()

            raw_last_frame = frame
            current_frame_idx += 1

            now_tick = time.perf_counter()
            dt = max(1e-4, now_tick - prev_tick)
            prev_tick = now_tick
            fps = 0.90 * fps + 0.10 * (1.0 / dt)

            run_infer = (current_frame_idx % config.PROCESS_EVERY_N_FRAMES) == 0 or current_frame_idx == 1
            result = detector.process_frame(frame, fps=fps, run_inference=run_infer)

            if result.state == STATE_CONFIRMED:
                ever_confirmed_in_run = True

            if result.should_send_event and result.blurred_snapshot:
                post_fall_event_async(
                    active_camera_id,
                    result.confidence,
                    result.blurred_snapshot,
                )

            display_frame = result.annotated_frame
            progress_pct = (
                min(100, int((current_frame_idx / max(1, total_frames)) * 100))
                if is_video_file and total_frames > 0
                else 0
            )

            if is_video_file:
                bar_y = display_frame.shape[0] - 6
                cv2.rectangle(
                    display_frame,
                    (0, bar_y),
                    (int(display_frame.shape[1] * (progress_pct / 100.0)), display_frame.shape[0]),
                    (20, 184, 166),
                    -1,
                )

            last_annotated_frame = display_frame
            frame_buffer.update(display_frame)

            publish_telemetry(
                {
                    "type": "simulation.telemetry",
                    "camera_id": active_camera_id,
                    "mode": "running",
                    "running": True,
                    "source": source_label,
                    "zones_count": len(detector.ignore_zones_norm),
                    "progress": progress_pct,
                    "state": result.state,
                    "posture": result.posture_label,
                    "torso_angle": round(result.torso_angle_deg, 1),
                    "aspect_ratio": round(result.aspect_ratio, 2),
                    "timer_elapsed": round(result.timer_elapsed, 1),
                }
            )

            if show_desktop_window:
                cv2.imshow(window_name, display_frame)
                if (cv2.waitKey(1) & 0xFF) in (ord("q"), 27):
                    break

            if is_video_file:
                frame_interval = 1.0 / max(10.0, target_fps)
                next_frame_deadline += frame_interval
                sleep_dur = next_frame_deadline - time.perf_counter()
                if sleep_dur > 0:
                    time.sleep(sleep_dur)
                elif sleep_dur < -0.5:
                    next_frame_deadline = time.perf_counter()
    finally:
        if cap is not None:
            cap.release()
        if show_desktop_window:
            cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
