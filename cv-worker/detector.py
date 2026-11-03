"""Logika pose estimation YOLOv8n-Pose, pembeda duduk/rebahan lantai/kasur lantai, & blur wajah."""

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
    """Hasil evaluasi satu frame untuk overlay, telemetri web, dan pengiriman event."""

    state: str
    posture_label: str
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
    """
    Detektor jatuh 4-lapis anti-alarm palsu:
    1. Duduk di kursi / duduk lesehan di lantai -> punggung tegak (< 60 deg) -> AMAN.
    2. Kasur pendek / kasur lantai / sofa -> poligon Zona Abaikan -> AMAN.
    3. Rebahan sengaja pelan di lantai -> duduk tenang dulu lalu rebah lambat tanpa impak -> AMAN.
    4. Jatuh mendadak (impak turun cepat / rebah mendadak) + tidak bangkit >= 5 detik -> JATUH!
    """

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

        self.ignore_zones_norm: list[list[tuple[float, float]]] = list(
            config.IGNORE_ZONES_NORMALIZED
        )
        self.reset_state(clear_cooldown=True)

    def reset_state(self, clear_cooldown: bool = False) -> None:
        """Reset status detektor saat memulai video simulasi baru."""
        self.state: str = STATE_NORMAL
        self.posture_label: str = "Menunggu Deteksi"
        self.suspected_since: float | None = None
        self.last_on_floor_time: float = 0.0
        if clear_cooldown or not hasattr(self, "last_event_sent_at"):
            self.last_event_sent_at: float = -1e9

        self.prev_hip_y: float | None = None
        self.prev_torso_angle: float | None = None
        self.prev_pose_time: float | None = None
        self.reference_height: float = 180.0

        self.recent_fall_impact_until: float = 0.0
        self.calm_seated_since: float | None = None
        self.controlled_floor_rest: bool = False
        self._last_result: DetectionResult | None = None

    def set_ignore_zones(self, zones_norm: list[list[tuple[float, float]]]) -> None:
        """Perbarui daftar poligon zona abaikan (kasur lantai / dipan / sofa)."""
        self.ignore_zones_norm = [z for z in zones_norm if len(z) >= 3]

    def set_custom_ignore_zone(self, polygon_norm: list[tuple[float, float]]) -> None:
        """Atur satu poligon zona abaikan dari klik pengguna."""
        if len(polygon_norm) >= 3:
            self.ignore_zones_norm = [polygon_norm]
        else:
            self.ignore_zones_norm = []

    def _is_in_ignore_zone(
        self,
        check_points: list[tuple[float, float]],
        w: int,
        h: int,
    ) -> bool:
        """Periksa apakah pinggul / badan tengah / titik tengah tubuh masuk ke Area Aman."""
        for poly_norm in self.ignore_zones_norm:
            pts = np.array(
                [[int(nx * w), int(ny * h)] for nx, ny in poly_norm], dtype=np.int32
            )
            for x_px, y_px in check_points:
                if cv2.pointPolygonTest(pts, (float(x_px), float(y_px)), False) >= 0:
                    return True
        return False

    def blur_faces(self, frame: np.ndarray, keypoints_xyc: np.ndarray | None = None) -> np.ndarray:
        """Buramkan wajah pada snapshot menggunakan keypoint kepala + estimasi bahu."""
        output = frame.copy()
        h, w = output.shape[:2]
        boxes: list[tuple[int, int, int, int]] = []

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
        """Gambar poligon hijau semi-transparan untuk Area Aman (Sofa / Kasur Lantai)."""
        if not self.ignore_zones_norm:
            return
        h, w = canvas.shape[:2]
        overlay = canvas.copy()
        for idx, poly_norm in enumerate(self.ignore_zones_norm, start=1):
            pts = np.array(
                [[int(nx * w), int(ny * h)] for nx, ny in poly_norm], dtype=np.int32
            )
            cv2.fillPoly(overlay, [pts], config.COLOR_IGNORE_ZONE)
            cv2.polylines(canvas, [pts], True, config.COLOR_IGNORE_ZONE, 2)
            for px, py in pts:
                cv2.circle(canvas, (int(px), int(py)), 5, config.COLOR_IGNORE_ZONE, -1)
                cv2.circle(canvas, (int(px), int(py)), 6, (255, 255, 255), 1)
            if len(pts) > 0:
                lx = max(8, min(w - 190, int(np.min(pts[:, 0])) + 6))
                ly = max(62, int(np.min(pts[:, 1])) + 22)
                label = f"AREA AMAN #{idx}"
                cv2.putText(
                    canvas,
                    label,
                    (lx, ly),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.54,
                    (255, 255, 255),
                    2,
                )
        cv2.addWeighted(overlay, 0.24, canvas, 0.76, 0, canvas)

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
        """Gambar kerangka tubuh, kotak deteksi, dan label postur di atas video."""
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

        h, w = canvas.shape[:2]
        cv2.rectangle(canvas, (0, 0), (w, 46), (15, 23, 42), -1)
        status_label = f"{self.state} | {self.posture_label}"
        if self.state == STATE_SUSPECTED:
            status_label = f"KEMUNGKINAN JATUH ({timer_elapsed:.1f}/{config.FALL_CONFIRM_SECONDS:.0f} dtk)"

        metrics_label = f"Sudut: {torso_angle:.0f} deg | W/H: {aspect_ratio:.2f} | {fps:.0f} FPS"

        cv2.circle(canvas, (20, 23), 8, color, -1)
        cv2.putText(
            canvas, status_label, (36, 29), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2
        )
        cv2.putText(
            canvas,
            metrics_label,
            (max(36, w - 370), 29),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (203, 213, 225),
            1,
        )

    def process_frame(self, frame: np.ndarray, fps: float = 0.0, run_inference: bool = True) -> DetectionResult:
        """Evaluasi satu frame menggunakan aturan kinematika 4-lapis."""
        if not run_inference and self._last_result is not None:
            reused = frame.copy()
            self._draw_hud(
                reused,
                None,
                None,
                self._last_result.torso_angle_deg,
                self._last_result.aspect_ratio,
                self._last_result.timer_elapsed,
                fps,
            )
            return DetectionResult(
                state=self.state,
                posture_label=self.posture_label,
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
        angular_speed: float = 0.0
        in_ignore_zone: bool = False

        res = results[0] if results else None
        if res is not None and res.boxes is not None and len(res.boxes) > 0 and res.keypoints is not None:
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

            if aspect_ratio < 0.80 and box_h > h * 0.25:
                self.reference_height = 0.85 * self.reference_height + 0.15 * box_h

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

            bbox_cx = (x1 + x2) / 2.0
            bbox_cy = (y1 + y2) / 2.0
            if hip_pts:
                hip_x = float(np.mean([p[0] for p in hip_pts]))
                hip_y = float(np.mean([p[1] for p in hip_pts]))
            else:
                hip_x = bbox_cx
                hip_y = bbox_cy

            body_points = [(hip_x, hip_y), (bbox_cx, bbox_cy)]
            if sh_pts and hip_pts:
                sh_x = float(np.mean([p[0] for p in sh_pts]))
                sh_y = float(np.mean([p[1] for p in sh_pts]))
                body_points.append(((sh_x + hip_x) / 2.0, (sh_y + hip_y) / 2.0))
                dx = abs(sh_x - hip_x)
                dy = abs(hip_y - sh_y)
                torso_angle_deg = math.degrees(math.atan2(dx, max(1e-4, dy)))
            elif aspect_ratio > config.BBOX_ASPECT_RATIO_THRESHOLD:
                torso_angle_deg = 75.0

            in_ignore_zone = self._is_in_ignore_zone(body_points, w, h)

            # Hitung laju turun pinggul & kecepatan rebah sudut punggung
            if self.prev_hip_y is not None and self.prev_pose_time is not None:
                dt = max(1e-3, now - self.prev_pose_time)
                if dt < 1.5:
                    delta_y = hip_y - self.prev_hip_y
                    hip_drop_speed = (delta_y / dt) / max(60.0, self.reference_height)
                    if self.prev_torso_angle is not None:
                        angular_speed = (torso_angle_deg - self.prev_torso_angle) / dt

                    if (
                        hip_drop_speed > config.HIP_DROP_SPEED_RATIO
                        or angular_speed > config.ANGULAR_FALL_SPEED_DEG
                    ):
                        self.recent_fall_impact_until = now + 3.0
                        self.calm_seated_since = None
                        self.controlled_floor_rest = False

            is_first_observation = self.prev_pose_time is None
            self.prev_hip_y = hip_y
            self.prev_torso_angle = torso_angle_deg
            self.prev_pose_time = now

            is_horizontal = (
                torso_angle_deg > config.TORSO_ANGLE_DEG_THRESHOLD
                or aspect_ratio > config.BBOX_ASPECT_RATIO_THRESHOLD
            )
            is_upright = (
                torso_angle_deg <= config.UPRIGHT_RECOVERY_ANGLE_DEG and aspect_ratio <= 1.15
            )
            is_low_seated = is_upright and (
                hip_y > h * 0.56 or box_h < self.reference_height * 0.78
            )
            had_impact = (now <= self.recent_fall_impact_until) or is_first_observation
            is_floor_lesehan = (
                self.state == STATE_NORMAL
                and not is_horizontal
                and not had_impact
                and torso_angle_deg <= 55.0
                and aspect_ratio <= 1.20
                and (hip_y > h * 0.54 or box_h < self.reference_height * 0.80)
            )

            # Lapis 1: Di dalam Area Aman yang ditandai (Sofa / Kasur Lantai) -> selalu AMAN
            if in_ignore_zone:
                self.state = STATE_NORMAL
                self.suspected_since = None
                self.posture_label = (
                    "Istirahat di Area Aman (Aman)"
                    if is_horizontal
                    else "Di Dalam Area Aman (Aman)"
                )

            # Lapis 2: Punggung tegak atau duduk lesehan tenang -> AMAN
            elif is_upright or is_floor_lesehan:
                self.state = STATE_NORMAL
                self.suspected_since = None
                self.controlled_floor_rest = False
                if is_low_seated or is_floor_lesehan:
                    if not had_impact and self.calm_seated_since is None:
                        self.calm_seated_since = now
                    self.posture_label = "Duduk / Lesehan (Aman)"
                else:
                    self.calm_seated_since = None
                    self.posture_label = "Berdiri / Berjalan (Aman)"

            # Lapis 3 & 4: Posisi rebah horizontal di luar zona kasur
            elif is_horizontal:
                seated_calmly_before = (
                    self.state == STATE_NORMAL
                    and self.calm_seated_since is not None
                    and (now - self.calm_seated_since) >= config.CONTROLLED_SIT_SECONDS
                )
                if (seated_calmly_before and not had_impact) or (
                    self.state == STATE_NORMAL and self.controlled_floor_rest and not had_impact
                ):
                    # Lansia duduk lesehan tenang dulu lalu rebahan pelan tanpa impak jatuh
                    self.controlled_floor_rest = True
                    self.state = STATE_NORMAL
                    self.suspected_since = None
                    self.posture_label = "Rebahan Terkontrol di Lantai (Aman)"
                else:
                    self.calm_seated_since = None
                    self.controlled_floor_rest = False
                    self.last_on_floor_time = now
                    if self.state == STATE_NORMAL:
                        self.state = STATE_SUSPECTED
                        self.suspected_since = now
                    self.posture_label = (
                        "JATUH TERKONFIRMASI!"
                        if self.state == STATE_CONFIRMED
                        else "Terjatuh di Lantai (Konfirmasi...)"
                    )
            else:
                self.posture_label = "Membungkuk / Transisi"
        else:
            if self.state != STATE_NORMAL and (now - self.last_on_floor_time) > config.FLOOR_GRACE_SECONDS:
                self.state = STATE_NORMAL
                self.suspected_since = None
                self.posture_label = "Tidak Ada Orang di Frame"

        timer_elapsed = (now - self.suspected_since) if self.suspected_since else 0.0
        should_send_event = False
        blurred_bytes: bytes | None = None

        if self.state == STATE_SUSPECTED and timer_elapsed >= config.FALL_CONFIRM_SECONDS:
            self.state = STATE_CONFIRMED
            self.posture_label = "JATUH TERKONFIRMASI!"
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
            posture_label=self.posture_label,
            confidence=max(0.80, person_conf) if should_send_event else person_conf,
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
