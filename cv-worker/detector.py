"""Logika pose estimation YOLOv8n-Pose, state machine deteksi jatuh, dan blur wajah."""

from dataclasses import dataclass
import math
import time
import cv2
import numpy as np
from ultralytics import YOLO

import config

STATE_NORMAL = "NORMAL"
STATE_SUSPECTED = "KEMUNGKINAN_JATUH"
STATE_CONFIRMED = "JATUH_TERKONFIRMASI"


@dataclass
class DetectionResult:
    """Hasil evaluasi satu frame untuk overlay dan pemicu pengiriman event."""

    state: str
    confidence: float
    should_send_event: bool
    timer_elapsed: float
    torso_angle_deg: float
    aspect_ratio: float
    hip_drop_speed: float
    in_ignore_zone: bool
    annotated_frame: np.ndarray
    blurred_snapshot: bytes | None = None


class FallDetector:
    """Detektor jatuh berbasis 17 keypoints YOLOv8n-Pose dan state machine 5 detik."""

    def __init__(self, model_path: str = config.MODEL_PATH) -> None:
        self.model = YOLO(model_path)
        cascade_cls = getattr(cv2, "CascadeClassifier", None)
        cascade_dir = getattr(getattr(cv2, "data", None), "haarcascades", "")
        if cascade_cls is not None and cascade_dir:
            self.face_cascade = cascade_cls(
                cascade_dir + "haarcascade_frontalface_default.xml"
            )
        else:
            self.face_cascade = None

        self.state: str = STATE_NORMAL
        self.suspected_since: float | None = None
        self.last_on_floor_time: float = 0.0
        self.last_event_sent_at: float = -1e9

        self.prev_hip_y: float | None = None
        self.prev_pose_time: float | None = None
        self.reference_height: float = 180.0
        self.recent_rapid_drop_until: float = 0.0

        self.ignore_zones_norm: list[list[tuple[float, float]]] = list(
            config.IGNORE_ZONES_NORMALIZED
        )
        self._last_result: DetectionResult | None = None

    def reset_state(self, clear_cooldown: bool = False) -> None:
        """Reset status detektor saat berganti sumber video simulasi."""
        self.state = STATE_NORMAL
        self.suspected_since = None
        self.last_on_floor_time = 0.0
        self.prev_hip_y = None
        self.prev_pose_time = None
        self.recent_rapid_drop_until = 0.0
        self._last_result = None
        if clear_cooldown:
            self.last_event_sent_at = -1e9

    def set_custom_ignore_zone(self, polygon_norm: list[tuple[float, float]]) -> None:
        """Atur poligon zona abaikan (kasur/sofa) dari interaksi pengguna."""
        if len(polygon_norm) >= 3:
            self.ignore_zones_norm = [polygon_norm]
        else:
            self.ignore_zones_norm = []

    def _is_in_ignore_zone(self, x_px: float, y_px: float, w: int, h: int) -> bool:
        """Periksa apakah titik tengah pinggul berada di dalam poligon kasur/sofa."""
        for poly_norm in self.ignore_zones_norm:
            pts = np.array(
                [[int(nx * w), int(ny * h)] for nx, ny in poly_norm], dtype=np.int32
            )
            if cv2.pointPolygonTest(pts, (float(x_px), float(y_px)), False) >= 0:
                return True
        return False

    def blur_faces(self, frame: np.ndarray, keypoints_xyc: np.ndarray | None = None) -> np.ndarray:
        """Buramkan wajah pada snapshot menggunakan keypoint kepala + Haar cascade (privasi)."""
        output = frame.copy()
        h, w = output.shape[:2]
        boxes: list[tuple[int, int, int, int]] = []

        # 1. Area kepala dari keypoint COCO (0: hidung, 1-2: mata, 3-4: telinga)
        if keypoints_xyc is not None and len(keypoints_xyc) >= 5:
            head_pts = [
                (float(kp[0]), float(kp[1]))
                for kp in keypoints_xyc[:5]
                if len(kp) >= 3 and float(kp[2]) >= 0.25 and kp[0] > 0 and kp[1] > 0
            ]
            if head_pts:
                xs = [p[0] for p in head_pts]
                ys = [p[1] for p in head_pts]
                cx = sum(xs) / len(xs)
                cy = sum(ys) / len(ys)
                spread = max(max(xs) - min(xs), max(ys) - min(ys), min(w, h) * 0.08)
                radius = int(spread * 1.35)
                boxes.append(
                    (
                        max(0, int(cx - radius)),
                        max(0, int(cy - radius)),
                        min(w, int(cx + radius)),
                        min(h, int(cy + radius)),
                    )
                )
            elif len(keypoints_xyc) >= 13:
                # Estimasi posisi kepala dari vektor pinggul -> bahu bila wajah membelakangi kamera
                sh = [keypoints_xyc[i][:2] for i in (5, 6) if keypoints_xyc[i][2] >= 0.25]
                hp = [keypoints_xyc[i][:2] for i in (11, 12) if keypoints_xyc[i][2] >= 0.25]
                if sh and hp:
                    sx = sum(float(p[0]) for p in sh) / len(sh)
                    sy = sum(float(p[1]) for p in sh) / len(sh)
                    hx = sum(float(p[0]) for p in hp) / len(hp)
                    hy = sum(float(p[1]) for p in hp) / len(hp)
                    cx = sx + 0.35 * (sx - hx)
                    cy = sy + 0.35 * (sy - hy)
                    radius = int(min(w, h) * 0.09)
                    boxes.append(
                        (
                            max(0, int(cx - radius)),
                            max(0, int(cy - radius)),
                            min(w, int(cx + radius)),
                            min(h, int(cy + radius)),
                        )
                    )

        # 2. Cadangan Haar Cascade jika tersedia di versi OpenCV yang terpasang
        if self.face_cascade is not None:
            gray = cv2.cvtColor(output, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=4)
            for fx, fy, fw, fh in faces:
                pad = int(fw * 0.2)
                boxes.append(
                    (max(0, fx - pad), max(0, fy - pad), min(w, fx + fw + pad), min(h, fy + fh + pad))
                )

        for x1, y1, x2, y2 in boxes:
            roi = output[y1:y2, x1:x2]
            if roi.size > 0:
                output[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (51, 51), 30)

        return output

    def _draw_ignore_zones(self, canvas: np.ndarray) -> None:
        """Gambar poligon semi-transparan untuk zona abaikan kasur/sofa."""
        if not self.ignore_zones_norm:
            return
        h, w = canvas.shape[:2]
        overlay = canvas.copy()
        for poly_norm in self.ignore_zones_norm:
            pts = np.array(
                [[int(nx * w), int(ny * h)] for nx, ny in poly_norm], dtype=np.int32
            )
            cv2.fillPoly(overlay, [pts], config.COLOR_IGNORE_ZONE)
            cv2.polylines(canvas, [pts], True, config.COLOR_IGNORE_ZONE, 2)
            if len(pts) > 0:
                cv2.putText(
                    canvas,
                    "ZONA ABAIKAN (KASUR/SOFA)",
                    (int(pts[0][0]) + 6, max(24, int(pts[0][1]) + 22)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (255, 255, 255),
                    2,
                )
        cv2.addWeighted(overlay, 0.22, canvas, 0.78, 0, canvas)

    def _draw_hud(
        self,
        canvas: np.ndarray,
        bbox: tuple[int, int, int, int] | None,
        keypoints_xyc: np.ndarray | None,
        torso_angle: float,
        aspect_ratio: float,
        timer_elapsed: float,
        fps: float,
    ) -> None:
        """Gambar kerangka tubuh, kotak deteksi, dan bar status sesuai colour.md."""
        self._draw_ignore_zones(canvas)

        color = config.COLOR_NORMAL
        if self.state == STATE_SUSPECTED:
            color = config.COLOR_SUSPECTED
        elif self.state == STATE_CONFIRMED:
            color = config.COLOR_CONFIRMED

        if bbox is not None:
            x1, y1, x2, y2 = bbox
            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 3)

        if keypoints_xyc is not None:
            skeleton_pairs = [
                (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
                (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
            ]
            for i, j in skeleton_pairs:
                if i < len(keypoints_xyc) and j < len(keypoints_xyc):
                    kp1, kp2 = keypoints_xyc[i], keypoints_xyc[j]
                    if kp1[2] >= config.KEYPOINT_CONF_THRESHOLD and kp2[2] >= config.KEYPOINT_CONF_THRESHOLD:
                        cv2.line(
                            canvas,
                            (int(kp1[0]), int(kp1[1])),
                            (int(kp2[0]), int(kp2[1])),
                            color,
                            2,
                        )
            for kp in keypoints_xyc:
                if kp[2] >= config.KEYPOINT_CONF_THRESHOLD:
                    cv2.circle(canvas, (int(kp[0]), int(kp[1])), 4, (255, 255, 255), -1)

        # Header status ringkas di bagian atas video
        h, w = canvas.shape[:2]
        cv2.rectangle(canvas, (0, 0), (w, 42), (15, 23, 42), -1)
        status_label = f"SIGAP | Status: {self.state}"
        if self.state == STATE_SUSPECTED:
            status_label += f" ({timer_elapsed:.1f}/{config.FALL_CONFIRM_SECONDS:.0f} dtk)"
        metrics_label = f"Sudut: {torso_angle:.0f} deg | Rasio W/H: {aspect_ratio:.2f} | {fps:.1f} FPS"

        cv2.circle(canvas, (20, 21), 8, color, -1)
        cv2.putText(
            canvas, status_label, (36, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2
        )
        cv2.putText(
            canvas,
            metrics_label,
            (max(36, w - 410), 27),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.50,
            (203, 213, 225),
            1,
        )

    def process_frame(self, frame: np.ndarray, fps: float = 0.0, run_inference: bool = True) -> DetectionResult:
        """Evaluasi satu frame; bila run_inference=False, gunakan hasil pose terakhir agar hemat CPU."""
        if not run_inference and self._last_result is not None:
            reused = frame.copy()
            self._draw_ignore_zones(reused)
            h, w = reused.shape[:2]
            cv2.rectangle(reused, (0, 0), (w, 42), (15, 23, 42), -1)
            dot_color = (
                config.COLOR_CONFIRMED
                if self.state == STATE_CONFIRMED
                else config.COLOR_SUSPECTED
                if self.state == STATE_SUSPECTED
                else config.COLOR_NORMAL
            )
            cv2.circle(reused, (20, 21), 8, dot_color, -1)
            cv2.putText(
                reused,
                f"SIGAP | Status: {self.state}",
                (36, 27),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.62,
                (255, 255, 255),
                2,
            )
            return DetectionResult(
                state=self.state,
                confidence=self._last_result.confidence,
                should_send_event=False,
                timer_elapsed=self._last_result.timer_elapsed,
                torso_angle_deg=self._last_result.torso_angle_deg,
                aspect_ratio=self._last_result.aspect_ratio,
                hip_drop_speed=self._last_result.hip_drop_speed,
                in_ignore_zone=self._last_result.in_ignore_zone,
                annotated_frame=reused,
            )

        now = time.monotonic()
        h, w = frame.shape[:2]
        results = self.model.predict(
            frame,
            imgsz=config.INPUT_IMAGE_SIZE,
            conf=config.PERSON_CONF_THRESHOLD,
            verbose=False,
        )

        bbox: tuple[int, int, int, int] | None = None
        keypoints_xyc: np.ndarray | None = None
        person_conf: float = 0.0
        torso_angle_deg: float = 0.0
        aspect_ratio: float = 0.0
        hip_drop_speed: float = 0.0
        in_ignore_zone: bool = False

        res = results[0] if results else None
        if res is not None and res.boxes is not None and len(res.boxes) > 0 and res.keypoints is not None:
            # Pilih orang dengan bounding box terbesar di ruangan
            boxes_xyxy = res.boxes.xyxy.cpu().numpy()
            confs = res.boxes.conf.cpu().numpy()
            kps_data = res.keypoints.data.cpu().numpy()

            areas = (boxes_xyxy[:, 2] - boxes_xyxy[:, 0]) * (boxes_xyxy[:, 3] - boxes_xyxy[:, 1])
            idx = int(np.argmax(areas))

            x1, y1, x2, y2 = [int(v) for v in boxes_xyxy[idx]]
            bbox = (x1, y1, x2, y2)
            person_conf = float(confs[idx])
            keypoints_xyc = kps_data[idx]

            box_w = max(1.0, float(x2 - x1))
            box_h = max(1.0, float(y2 - y1))
            aspect_ratio = box_w / box_h

            # Perbarui tinggi referensi saat orang dalam posisi berdiri tegak
            if aspect_ratio < 0.85 and box_h > h * 0.25:
                self.reference_height = 0.85 * self.reference_height + 0.15 * box_h

            # Ambil titik tengah bahu (5, 6) dan titik tengah pinggul (11, 12)
            sh_pts = [
                keypoints_xyc[i][:2]
                for i in (5, 6)
                if i < len(keypoints_xyc) and keypoints_xyc[i][2] >= config.KEYPOINT_CONF_THRESHOLD
            ]
            hip_pts = [
                keypoints_xyc[i][:2]
                for i in (11, 12)
                if i < len(keypoints_xyc) and keypoints_xyc[i][2] >= config.KEYPOINT_CONF_THRESHOLD
            ]

            if hip_pts:
                hip_x = float(np.mean([p[0] for p in hip_pts]))
                hip_y = float(np.mean([p[1] for p in hip_pts]))
            else:
                hip_x = (x1 + x2) / 2.0
                hip_y = (y1 + y2) / 2.0

            in_ignore_zone = self._is_in_ignore_zone(hip_x, hip_y, w, h)

            if sh_pts and hip_pts:
                sh_x = float(np.mean([p[0] for p in sh_pts]))
                sh_y = float(np.mean([p[1] for p in sh_pts]))
                dx = abs(sh_x - hip_x)
                dy = abs(hip_y - sh_y)
                torso_angle_deg = math.degrees(math.atan2(dx, max(1e-4, dy)))
            elif aspect_ratio > config.BBOX_ASPECT_RATIO_THRESHOLD:
                torso_angle_deg = 75.0

            # Hitung laju turun pinggul terhadap tinggi referensi per detik
            if self.prev_hip_y is not None and self.prev_pose_time is not None:
                dt = max(1e-3, now - self.prev_pose_time)
                if dt < 1.5:
                    delta_y = hip_y - self.prev_hip_y
                    hip_drop_speed = (delta_y / dt) / max(60.0, self.reference_height)
                    if hip_drop_speed > config.HIP_DROP_SPEED_RATIO:
                        self.recent_rapid_drop_until = now + 2.5

            self.prev_hip_y = hip_y
            self.prev_pose_time = now

            # Evaluasi kondisi jatuh vs duduk/berdiri
            is_horizontal = (
                torso_angle_deg > config.TORSO_ANGLE_DEG_THRESHOLD
                or aspect_ratio > config.BBOX_ASPECT_RATIO_THRESHOLD
            )
            is_strong_lying = (
                torso_angle_deg > config.TORSO_ANGLE_DEG_THRESHOLD
                and aspect_ratio > config.BBOX_ASPECT_RATIO_THRESHOLD
            )
            had_rapid_drop = now <= self.recent_rapid_drop_until
            is_upright_again = (
                torso_angle_deg < config.UPRIGHT_RECOVERY_ANGLE_DEG and aspect_ratio < 1.05
            )

            if in_ignore_zone or is_upright_again:
                self.state = STATE_NORMAL
                self.suspected_since = None
            elif is_horizontal and (had_rapid_drop or is_strong_lying or self.state != STATE_NORMAL):
                self.last_on_floor_time = now
                if self.state == STATE_NORMAL:
                    self.state = STATE_SUSPECTED
                    self.suspected_since = now
        else:
            # Jika orang hilang dari frame terlalu lama saat belum terkonfirmasi, kembalikan ke NORMAL
            if self.state != STATE_NORMAL and (now - self.last_on_floor_time) > config.FLOOR_GRACE_SECONDS:
                self.state = STATE_NORMAL
                self.suspected_since = None

        timer_elapsed = (now - self.suspected_since) if self.suspected_since else 0.0
        should_send_event = False
        blurred_bytes: bytes | None = None

        if self.state == STATE_SUSPECTED and timer_elapsed >= config.FALL_CONFIRM_SECONDS:
            self.state = STATE_CONFIRMED
            if (now - self.last_event_sent_at) >= config.EVENT_COOLDOWN_SECONDS:
                self.last_event_sent_at = now
                should_send_event = True
                clean_blurred = self.blur_faces(frame, keypoints_xyc)
                ok, buf = cv2.imencode(
                    ".jpg", clean_blurred, [int(cv2.IMWRITE_JPEG_QUALITY), 88]
                )
                if ok:
                    blurred_bytes = buf.tobytes()

        annotated = frame.copy()
        self._draw_hud(
            annotated,
            bbox,
            keypoints_xyc,
            torso_angle_deg,
            aspect_ratio,
            timer_elapsed,
            fps,
        )

        det_result = DetectionResult(
            state=self.state,
            confidence=max(0.75, person_conf) if should_send_event else person_conf,
            should_send_event=should_send_event,
            timer_elapsed=timer_elapsed,
            torso_angle_deg=torso_angle_deg,
            aspect_ratio=aspect_ratio,
            hip_drop_speed=hip_drop_speed,
            in_ignore_zone=in_ignore_zone,
            annotated_frame=annotated,
            blurred_snapshot=blurred_bytes,
        )
        self._last_result = det_result
        return det_result

