"""
Hand-frame photo capture.
Track one index fingertip (left or right hand). Hold still at each corner to
pin 4 points that form a quadrilateral, then countdown and save a 16:9 crop.
"""

from __future__ import annotations

import argparse
import time
from datetime import datetime
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

INDEX_TIP = 8

HAND_CONNECTIONS = (
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
)

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "hand_landmarker.task"
CAPTURE_DIR = ROOT / "captures"
FRAMES_DIR = ROOT / "frames"

# Artwork without an alpha channel is keyed by flood-filling the black backdrop
BLACK_KEY_THRESHOLD = 16
# Escape hatch for artwork whose designed black band merges into the backdrop:
# force the bottom strip opaque instead of keying it away
KEEP_BOTTOM_RATIO = 0.0

# Quad validation
MIN_AREA_RATIO = 0.03
MAX_AREA_RATIO = 0.90
MIN_SIDE_PX = 50

# Index-tip drawing
DWELL_SECONDS = 0.55          # hold still to pin a corner
MOVE_TOLERANCE_PX = 28        # max jitter while dwelling
MIN_CORNER_GAP_PX = 55        # next corner must be far enough from previous
COUNTDOWN_SECONDS = 7.0
COOLDOWN_SECONDS = 2.5
WINDOW_NAME = "Hand Frame Capture"

# Saved photo: landscape 16:9
OUTPUT_ASPECT_W = 16
OUTPUT_ASPECT_H = 9
OUTPUT_HEIGHT = 1080  # → 1920×1080


def order_quad_points(points: np.ndarray) -> np.ndarray:
    """Order 4 points as TL, TR, BR, BL (clockwise from top-left)."""
    pts = np.asarray(points, dtype=np.float32)
    center = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - center[1], pts[:, 0] - center[0])
    ordered = pts[np.argsort(angles)]

    sums = ordered.sum(axis=1)
    start = int(np.argmin(sums))
    ordered = np.roll(ordered, -start, axis=0)

    v1 = ordered[1] - ordered[0]
    v2 = ordered[2] - ordered[1]
    if v1[0] * v2[1] - v1[1] * v2[0] < 0:
        ordered = np.array([ordered[0], ordered[3], ordered[2], ordered[1]], dtype=np.float32)
    return ordered


def quad_is_valid(quad: np.ndarray, frame_w: int, frame_h: int) -> bool:
    area = abs(cv2.contourArea(quad.astype(np.float32)))
    frame_area = float(frame_w * frame_h)
    if area < MIN_AREA_RATIO * frame_area or area > MAX_AREA_RATIO * frame_area:
        return False

    for i in range(4):
        if np.linalg.norm(quad[i] - quad[(i + 1) % 4]) < MIN_SIDE_PX:
            return False

    hull = cv2.convexHull(quad.astype(np.float32))
    return len(hull) >= 4


def warp_quad(frame: np.ndarray, quad: np.ndarray) -> np.ndarray:
    """Perspective-crop the drawn frame into a fixed 16:9 photo."""
    out_h = OUTPUT_HEIGHT
    out_w = int(round(out_h * OUTPUT_ASPECT_W / OUTPUT_ASPECT_H))
    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
    return cv2.warpPerspective(
        frame,
        matrix,
        (out_w, out_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def build_overlay_alpha(art: np.ndarray, keep_bottom: float = KEEP_BOTTOM_RATIO) -> np.ndarray:
    """Return an 0..1 alpha mask for the decoration artwork.

    PNGs exported with transparency use their own alpha. Flat artwork is keyed
    instead: the largest connected black region becomes the photo window, which
    works whether that region is a full-bleed backdrop or a window cut into a
    border.
    Smaller black areas (logo interiors) stay opaque. `keep_bottom` keeps the
    bottom strip opaque for artwork whose black band touches the backdrop.
    """
    if art.shape[2] == 4:
        return art[:, :, 3].astype(np.float32) / 255.0

    dark = (art.max(axis=2) <= BLACK_KEY_THRESHOLD).astype(np.uint8)
    count, labels = cv2.connectedComponents(dark, connectivity=8)

    window = np.zeros(dark.shape, bool)
    if count > 1:
        areas = np.bincount(labels.ravel())
        areas[0] = 0
        window = labels == int(np.argmax(areas))

    alpha = 1.0 - window.astype(np.float32)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

    if keep_bottom > 0:
        band_top = int(round(alpha.shape[0] * (1.0 - keep_bottom)))
        alpha[band_top:, :] = 1.0
    return alpha


def load_frame_overlay(
    path: Path, size: tuple[int, int], keep_bottom: float = KEEP_BOTTOM_RATIO
) -> tuple[np.ndarray, np.ndarray]:
    """Load decoration artwork resized to `size` as (bgr, alpha 0..1)."""
    art = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if art is None:
        raise FileNotFoundError(f"Could not read frame artwork: {path}")
    if art.ndim == 2:
        art = cv2.cvtColor(art, cv2.COLOR_GRAY2BGR)

    alpha = build_overlay_alpha(art, keep_bottom)
    bgr = art[:, :, :3]

    bgr = cv2.resize(bgr, size, interpolation=cv2.INTER_AREA)
    alpha = cv2.resize(alpha, size, interpolation=cv2.INTER_AREA)
    return bgr, np.clip(alpha, 0.0, 1.0)[:, :, None]


def apply_frame(photo: np.ndarray, overlay: tuple[np.ndarray, np.ndarray] | None) -> np.ndarray:
    if overlay is None:
        return photo
    art, alpha = overlay
    blended = photo.astype(np.float32) * (1.0 - alpha) + art.astype(np.float32) * alpha
    return blended.astype(np.uint8)


def resolve_frame_path(choice: str | None) -> Path | None:
    if choice == "none":
        return None
    if choice:
        path = Path(choice)
        return path if path.is_absolute() else ROOT / path
    candidates = sorted(FRAMES_DIR.glob("*.png")) if FRAMES_DIR.exists() else []
    return candidates[0] if candidates else None


def list_frame_paths(initial: Path | None) -> list[Path]:
    """List selectable frame PNGs, preserving an explicit external frame."""
    paths = sorted(FRAMES_DIR.glob("*.png")) if FRAMES_DIR.exists() else []
    if initial is not None and initial not in paths:
        paths.insert(0, initial)
    return paths


def get_index_tip(
    result: vision.HandLandmarkerResult, width: int, height: int
) -> tuple[np.ndarray, str] | None:
    """Pick one index tip. Prefer the hand whose tip is highest (smallest y)."""
    if not result.hand_landmarks:
        return None

    candidates: list[tuple[np.ndarray, str, float]] = []
    for i, hand in enumerate(result.hand_landmarks):
        lm = hand[INDEX_TIP]
        tip = np.array([lm.x * width, lm.y * height], dtype=np.float32)
        label = "Hand"
        if result.handedness and i < len(result.handedness):
            cats = result.handedness[i]
            if cats:
                # Mirrored selfie view: MediaPipe label is for the raw image;
                # after flip, swap Left/Right for display clarity.
                raw = cats[0].category_name
                label = "Right" if raw == "Left" else "Left" if raw == "Right" else raw
        candidates.append((tip, label, float(tip[1])))

    tip, label, _ = min(candidates, key=lambda c: c[2])
    return tip, label


class QuadDrawer:
    """Pin 4 corners by dwelling the index tip; build a capture quad."""

    def __init__(self) -> None:
        self.corners: list[np.ndarray] = []
        self.trail: list[np.ndarray] = []
        self._dwell_anchor: np.ndarray | None = None
        self._dwell_start: float | None = None
        self.ready_quad: np.ndarray | None = None
        self.invalid_message: str | None = None

    def reset(self) -> None:
        self.corners.clear()
        self.trail.clear()
        self._dwell_anchor = None
        self._dwell_start = None
        self.ready_quad = None
        self.invalid_message = None

    def update(self, tip: np.ndarray | None, now: float, frame_w: int, frame_h: int) -> None:
        if self.ready_quad is not None:
            return

        if tip is None:
            self._dwell_anchor = None
            self._dwell_start = None
            return

        self.trail.append(tip.copy())
        if len(self.trail) > 120:
            self.trail = self.trail[-120:]

        if self._dwell_anchor is None:
            self._dwell_anchor = tip.copy()
            self._dwell_start = now
            return

        if np.linalg.norm(tip - self._dwell_anchor) > MOVE_TOLERANCE_PX:
            self._dwell_anchor = tip.copy()
            self._dwell_start = now
            return

        assert self._dwell_start is not None
        if now - self._dwell_start < DWELL_SECONDS:
            return

        pinned = self._dwell_anchor.copy()
        self._dwell_anchor = None
        self._dwell_start = None

        if self.corners and np.linalg.norm(pinned - self.corners[-1]) < MIN_CORNER_GAP_PX:
            return

        self.corners.append(pinned)
        self.invalid_message = None

        if len(self.corners) >= 4:
            raw = np.stack(self.corners[:4]).astype(np.float32)
            ordered = order_quad_points(raw)
            if quad_is_valid(ordered, frame_w, frame_h):
                self.ready_quad = ordered
            else:
                self.invalid_message = "Invalid frame — press R and redraw (need a clear quad)"
                self.corners.clear()
                self.trail.clear()

    @property
    def dwell_progress(self) -> float:
        if self._dwell_start is None or self.ready_quad is not None:
            return 0.0
        return min(1.0, (time.time() - self._dwell_start) / DWELL_SECONDS)


def draw_landmarks(view: np.ndarray, result: vision.HandLandmarkerResult) -> None:
    h, w = view.shape[:2]
    for hand in result.hand_landmarks:
        points = [(int(lm.x * w), int(lm.y * h)) for lm in hand]
        for a, b in HAND_CONNECTIONS:
            cv2.line(view, points[a], points[b], (200, 200, 200), 1, cv2.LINE_AA)
        for i, p in enumerate(points):
            cv2.circle(view, p, 3, (60, 160, 255), -1, cv2.LINE_AA)
            cv2.putText(
                view, str(i), (p[0] + 4, p[1] - 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.32, (255, 255, 255), 1, cv2.LINE_AA,
            )


def draw_ui(
    frame: np.ndarray,
    drawer: QuadDrawer,
    tip: np.ndarray | None,
    hand_label: str | None,
    status: str,
    countdown: int | None,
    flash: float,
    frame_name: str,
    result: vision.HandLandmarkerResult | None = None,
    show_landmarks: bool = False,
) -> np.ndarray:
    view = frame.copy()
    h, w = view.shape[:2]

    if show_landmarks and result is not None:
        draw_landmarks(view, result)

    # Trail
    if len(drawer.trail) >= 2:
        pts = np.array(drawer.trail, dtype=np.int32).reshape((-1, 1, 2))
        cv2.polylines(view, [pts], False, (180, 180, 180), 2, cv2.LINE_AA)

    # Pinned corners + open polygon
    for i, c in enumerate(drawer.corners):
        p = (int(c[0]), int(c[1]))
        cv2.circle(view, p, 10, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(view, p, 7, (80, 220, 120), -1, cv2.LINE_AA)
        cv2.putText(
            view, str(i + 1), (p[0] + 12, p[1] - 8),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 3, cv2.LINE_AA,
        )
        cv2.putText(
            view, str(i + 1), (p[0] + 12, p[1] - 8),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1, cv2.LINE_AA,
        )

    if len(drawer.corners) >= 2:
        poly = np.array(drawer.corners, dtype=np.int32).reshape((-1, 1, 2))
        closed = drawer.ready_quad is not None
        color = (40, 180, 255) if countdown else (80, 220, 120)
        cv2.polylines(view, [poly], closed, color, 3, cv2.LINE_AA)
        if tip is not None and not closed:
            last = drawer.corners[-1]
            cv2.line(
                view,
                (int(last[0]), int(last[1])),
                (int(tip[0]), int(tip[1])),
                (160, 160, 160),
                2,
                cv2.LINE_AA,
            )

    if drawer.ready_quad is not None:
        pts = drawer.ready_quad.astype(np.int32).reshape((-1, 1, 2))
        color = (40, 180, 255) if countdown else (80, 220, 120)
        fill = view.copy()
        cv2.fillPoly(fill, [pts], color)
        view = cv2.addWeighted(fill, 0.12, view, 0.88, 0)

    # Index cursor + dwell ring
    if tip is not None:
        p = (int(tip[0]), int(tip[1]))
        cv2.circle(view, p, 8, (0, 200, 255), -1, cv2.LINE_AA)
        progress = drawer.dwell_progress
        if progress > 0 and drawer.ready_quad is None:
            radius = 18 + int(10 * progress)
            cv2.ellipse(
                view, p, (radius, radius), 0, 0, int(360 * progress),
                (0, 255, 180), 3, cv2.LINE_AA,
            )

    # Text bars
    overlay = view.copy()
    cv2.rectangle(overlay, (0, 0), (w, 90), (20, 20, 20), -1)
    cv2.rectangle(overlay, (0, h - 50), (w, h), (20, 20, 20), -1)
    view = cv2.addWeighted(overlay, 0.55, view, 0.45, 0)

    title = "Index Frame Capture"
    hint = "Hold index tip: pin 4 corners | M: frame | R: reset | D: debug"
    cv2.putText(view, title, (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
    cv2.putText(view, hint, (16, 68), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (200, 200, 200), 1)
    frame_text = f"Frame: {frame_name}"
    frame_size = cv2.getTextSize(frame_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
    cv2.putText(
        view,
        frame_text,
        (w - frame_size[0] - 16, 36),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (200, 220, 255),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(view, status, (16, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (240, 240, 240), 2)

    if hand_label and tip is not None:
        cv2.putText(
            view, f"{hand_label} index",
            (int(tip[0]) + 14, int(tip[1]) + 24),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 1, cv2.LINE_AA,
        )

    if countdown is not None and countdown > 0:
        text = str(countdown)
        size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 4.5, 8)[0]
        x = (w - size[0]) // 2
        y = (h + size[1]) // 2
        cv2.putText(view, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 4.5, (0, 0, 0), 12)
        cv2.putText(view, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 4.5, (255, 255, 255), 6)

    if flash > 0:
        white = np.full_like(view, 255)
        view = cv2.addWeighted(white, flash, view, 1.0 - flash, 0)

    return view


def create_landmarker() -> vision.HandLandmarker:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Missing model: {MODEL_PATH}\n"
            "Download from:\n"
            "https://storage.googleapis.com/mediapipe-models/"
            "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        )

    options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.55,
        min_hand_presence_confidence=0.55,
        min_tracking_confidence=0.5,
    )
    return vision.HandLandmarker.create_from_options(options)


def save_capture(image: np.ndarray) -> Path:
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    path = CAPTURE_DIR / f"capture_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    cv2.imwrite(str(path), image)
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Draw a quadrilateral with your index fingertip, then capture a 16:9 photo."
    )
    parser.add_argument(
        "--frame",
        default=None,
        help="Decoration PNG to composite onto the photo, or 'none' (default: first file in frames/).",
    )
    parser.add_argument(
        "--keep-bottom",
        type=float,
        default=KEEP_BOTTOM_RATIO,
        metavar="RATIO",
        help=(
            "Fraction of the artwork height kept opaque at the bottom when the PNG "
            f"has no alpha channel (default: {KEEP_BOTTOM_RATIO}; 0 disables)."
        ),
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Start with the hand landmark overlay enabled.",
    )
    args = parser.parse_args()
    if not 0.0 <= args.keep_bottom < 1.0:
        parser.error("--keep-bottom must be in [0, 1)")
    return args


def main() -> None:
    args = parse_args()
    show_landmarks = args.debug

    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    landmarker = create_landmarker()
    drawer = QuadDrawer()

    out_h = OUTPUT_HEIGHT
    out_w = int(round(out_h * OUTPUT_ASPECT_W / OUTPUT_ASPECT_H))
    frame_path = resolve_frame_path(args.frame)
    frame_paths = list_frame_paths(frame_path)
    frame_index = frame_paths.index(frame_path) if frame_path in frame_paths else -1
    overlay = (
        load_frame_overlay(frame_path, (out_w, out_h), args.keep_bottom)
        if frame_path
        else None
    )
    if frame_path:
        print(f"Frame overlay: {frame_path.name} (keep-bottom {args.keep_bottom:.2f})")
    else:
        print("Frame overlay: none")

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam. Check the camera and try again.")

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    countdown_end: float | None = None
    last_capture_at = 0.0
    flash_until = 0.0
    last_saved: Path | None = None
    start_ts = time.monotonic()
    last_ts_ms = -1

    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            frame_ts_ms = max(int((time.monotonic() - start_ts) * 1000), last_ts_ms + 1)
            last_ts_ms = frame_ts_ms
            result = landmarker.detect_for_video(mp_image, frame_ts_ms)

            tip_info = get_index_tip(result, w, h)
            tip = tip_info[0] if tip_info else None
            hand_label = tip_info[1] if tip_info else None

            now = time.time()
            countdown_val: int | None = None
            in_cooldown = now - last_capture_at < COOLDOWN_SECONDS

            if in_cooldown:
                status = f"Saved: {last_saved.name}" if last_saved else "Captured!"
                countdown_end = None
            else:
                drawer.update(tip, now, w, h)

                if drawer.ready_quad is not None:
                    if countdown_end is None:
                        countdown_end = now + COUNTDOWN_SECONDS
                    remaining = countdown_end - now
                    if remaining <= 0:
                        photo = apply_frame(warp_quad(frame, drawer.ready_quad), overlay)
                        last_saved = save_capture(photo)
                        last_capture_at = now
                        flash_until = now + 0.25
                        countdown_end = None
                        drawer.reset()
                        status = f"Saved: {last_saved.name}"
                    else:
                        countdown_val = max(1, int(np.ceil(remaining)))
                        status = "Frame ready — counting down"
                elif drawer.invalid_message:
                    status = drawer.invalid_message
                elif tip is None:
                    status = "Show one index finger (left or right) to start drawing"
                else:
                    n = len(drawer.corners)
                    status = f"Pin corner {n + 1}/4 — hold index tip still ({hand_label or 'hand'})"

            flash = max(0.0, (flash_until - now) / 0.25) if now < flash_until else 0.0

            view = draw_ui(
                frame,
                drawer,
                tip,
                hand_label,
                status,
                countdown_val,
                flash,
                frame_path.name if frame_path else "none",
                result,
                show_landmarks,
            )
            cv2.imshow(WINDOW_NAME, view)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                break
            if key in (ord("r"), ord("R")):
                drawer.reset()
                countdown_end = None
            if key in (ord("d"), ord("D")):
                show_landmarks = not show_landmarks
            if key in (ord("m"), ord("M")) and frame_paths:
                frame_index = (frame_index + 1) % len(frame_paths)
                frame_path = frame_paths[frame_index]
                overlay = load_frame_overlay(
                    frame_path, (out_w, out_h), args.keep_bottom
                )
                print(f"Frame overlay: {frame_path.name}")
    finally:
        cap.release()
        landmarker.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
