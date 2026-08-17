"""
Hand-frame photo capture.
Form a quadrilateral with the fingertips of both hands (thumb + index by
default); the camera captures the person inside that frame after a short
stable countdown.
"""

from __future__ import annotations

import argparse
import time
from collections import deque
from datetime import datetime
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# Landmark indices (MediaPipe Hands)
THUMB_TIP = 4
INDEX_TIP = 8
PINKY_TIP = 20

CORNER_MODES: dict[str, tuple[int, int]] = {
    "thumb-index": (THUMB_TIP, INDEX_TIP),
    "thumb-pinky": (THUMB_TIP, PINKY_TIP),
}
CORNER_LABELS: dict[int, str] = {THUMB_TIP: "T", INDEX_TIP: "I", PINKY_TIP: "P"}

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

# Tuning
MIN_AREA_RATIO = 0.04  # quad area vs frame area
MAX_AREA_RATIO = 0.85
MIN_SIDE_PX = 40
STABLE_FRAMES = 18
COUNTDOWN_SECONDS = 3
COOLDOWN_SECONDS = 2.5
WINDOW_NAME = "Hand Frame Capture"


def order_quad_points(points: np.ndarray) -> np.ndarray:
    """Order 4 points as TL, TR, BR, BL (clockwise from top-left)."""
    pts = np.asarray(points, dtype=np.float32)
    center = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - center[1], pts[:, 0] - center[0])
    ordered = pts[np.argsort(angles)]

    # Rotate so first point is top-left (smallest x+y among candidates)
    sums = ordered.sum(axis=1)
    start = int(np.argmin(sums))
    ordered = np.roll(ordered, -start, axis=0)

    # Ensure TL-TR-BR-BL winding (cross product of first two edges)
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
        side = np.linalg.norm(quad[i] - quad[(i + 1) % 4])
        if side < MIN_SIDE_PX:
            return False

    # Reject near-collinear quads (very flat)
    hull = cv2.convexHull(quad.astype(np.float32))
    if len(hull) < 4:
        return False
    return True


def warp_quad(frame: np.ndarray, quad: np.ndarray) -> np.ndarray:
    """Perspective-crop the region inside the hand frame to a rectangle."""
    tl, tr, br, bl = quad
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    out_w = max(int(max(width_a, width_b)), 64)
    out_h = max(int(max(height_a, height_b)), 64)

    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
    return cv2.warpPerspective(frame, matrix, (out_w, out_h))


def extract_frame_corners(
    result: vision.HandLandmarkerResult,
    width: int,
    height: int,
    corner_ids: tuple[int, int],
) -> tuple[np.ndarray, list[str]] | None:
    """Return the ordered quad built from `corner_ids` on both hands, plus labels."""
    if not result.hand_landmarks or len(result.hand_landmarks) < 2:
        return None

    tips: list[list[float]] = []
    labels: list[str] = []
    for hand in result.hand_landmarks[:2]:
        for idx in corner_ids:
            lm = hand[idx]
            tips.append([lm.x * width, lm.y * height])
            labels.append(CORNER_LABELS.get(idx, "?"))

    if len(tips) != 4:
        return None

    raw = np.array(tips, dtype=np.float32)
    quad = order_quad_points(raw)
    if not quad_is_valid(quad, width, height):
        return None
    return quad, match_labels(quad, raw, labels)


def match_labels(quad: np.ndarray, raw: np.ndarray, labels: list[str]) -> list[str]:
    """Map each ordered corner back to the landmark label it came from."""
    ordered: list[str] = []
    for point in quad:
        idx = int(np.argmin(np.linalg.norm(raw - point, axis=1)))
        ordered.append(labels[idx])
    return ordered


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
                cv2.FONT_HERSHEY_SIMPLEX, 0.32, (255, 255, 255), 1, cv2.LINE_AA
            )


def draw_ui(
    frame: np.ndarray,
    quad: np.ndarray | None,
    corner_labels: list[str] | None,
    status: str,
    countdown: int | None,
    flash: float,
    mode: str,
    result: vision.HandLandmarkerResult | None = None,
    show_landmarks: bool = False,
) -> np.ndarray:
    view = frame.copy()
    h, w = view.shape[:2]

    if show_landmarks and result is not None:
        draw_landmarks(view, result)

    # Soft vignette bar for text
    overlay = view.copy()
    cv2.rectangle(overlay, (0, 0), (w, 90), (20, 20, 20), -1)
    cv2.rectangle(overlay, (0, h - 50), (w, h), (20, 20, 20), -1)
    view = cv2.addWeighted(overlay, 0.55, view, 0.45, 0)

    finger_text = mode.replace("-", " + ") + " tips"
    title = "Hand Frame Capture"
    hint = f"Both hands: {finger_text} | Q: quit | SPACE: snap | M: fingers | D: debug"
    cv2.putText(view, title, (16, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
    cv2.putText(view, hint, (16, 68), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    cv2.putText(view, status, (16, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (240, 240, 240), 2)

    if quad is not None:
        pts = quad.astype(np.int32).reshape((-1, 1, 2))
        color = (80, 220, 120) if countdown is None else (40, 180, 255)
        cv2.polylines(view, [pts], True, color, 3, cv2.LINE_AA)
        for i, p in enumerate(quad.astype(np.int32)):
            cv2.circle(view, tuple(p), 8, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(view, tuple(p), 5, color, -1, cv2.LINE_AA)
            if corner_labels:
                cv2.putText(
                    view, corner_labels[i], (int(p[0]) + 12, int(p[1]) - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 3, cv2.LINE_AA
                )
                cv2.putText(
                    view, corner_labels[i], (int(p[0]) + 12, int(p[1]) - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA
                )

        # Semi-transparent fill
        fill = view.copy()
        cv2.fillPoly(fill, [pts], color)
        view = cv2.addWeighted(fill, 0.12, view, 0.88, 0)

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


def save_capture(image: np.ndarray, suffix: str = "") -> Path:
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    tag = f"_{suffix}" if suffix else ""
    path = CAPTURE_DIR / f"capture_{stamp}{tag}.jpg"
    cv2.imwrite(str(path), image)
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture a photo framed by your hands.")
    parser.add_argument(
        "--corners",
        choices=sorted(CORNER_MODES),
        default="thumb-index",
        help="Which fingertips form the frame corners (default: thumb-index).",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Start with the hand landmark overlay enabled.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    mode = args.corners
    show_landmarks = args.debug

    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    landmarker = create_landmarker()

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam. Check the camera and try again.")

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    stable_history: deque[np.ndarray] = deque(maxlen=STABLE_FRAMES)
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

            # Mirror for natural self-view
            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            # Timestamps must strictly increase for VIDEO mode
            frame_ts_ms = max(int((time.monotonic() - start_ts) * 1000), last_ts_ms + 1)
            last_ts_ms = frame_ts_ms
            result = landmarker.detect_for_video(mp_image, frame_ts_ms)

            corner_ids = CORNER_MODES[mode]
            found = extract_frame_corners(result, w, h, corner_ids)
            quad, corner_labels = found if found else (None, None)

            finger_text = mode.replace("-", " + ") + " tips"
            now = time.time()
            status = f"Raise both hands — {finger_text} make a frame"
            countdown_val: int | None = None

            if now - last_capture_at < COOLDOWN_SECONDS:
                status = "Captured! Wait a moment before next shot..."
                stable_history.clear()
                countdown_end = None
            elif quad is None:
                stable_history.clear()
                countdown_end = None
                n_hands = len(result.hand_landmarks) if result.hand_landmarks else 0
                if n_hands == 0:
                    status = "No hands detected — raise both hands in front of the camera"
                elif n_hands == 1:
                    status = "One hand detected — add the other hand"
                else:
                    status = f"Two hands found — open the frame ({finger_text})"
            else:
                stable_history.append(quad.copy())
                if len(stable_history) < STABLE_FRAMES:
                    status = f"Hold steady... {len(stable_history)}/{STABLE_FRAMES}"
                    countdown_end = None
                else:
                    # Average last quads for smoother corners
                    avg_quad = np.mean(np.stack(stable_history), axis=0).astype(np.float32)
                    smoothed = order_quad_points(avg_quad)
                    if corner_labels:
                        corner_labels = match_labels(smoothed, quad, corner_labels)
                    quad = smoothed

                    if countdown_end is None:
                        countdown_end = now + COUNTDOWN_SECONDS

                    remaining = countdown_end - now
                    if remaining <= 0:
                        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        cropped = warp_quad(frame, quad)
                        crop_path = CAPTURE_DIR / f"capture_{stamp}_crop.jpg"
                        full_path = CAPTURE_DIR / f"capture_{stamp}_full.jpg"
                        CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
                        cv2.imwrite(str(crop_path), cropped)
                        framed = frame.copy()
                        cv2.polylines(
                            framed,
                            [quad.astype(np.int32).reshape((-1, 1, 2))],
                            True,
                            (80, 220, 120),
                            3,
                        )
                        cv2.imwrite(str(full_path), framed)
                        last_saved = crop_path
                        last_capture_at = now
                        flash_until = now + 0.25
                        countdown_end = None
                        stable_history.clear()
                        status = f"Saved: {last_saved.name}"
                    else:
                        countdown_val = max(1, int(np.ceil(remaining)))
                        status = "Hold still — counting down"

            flash = max(0.0, (flash_until - now) / 0.25) if now < flash_until else 0.0
            if last_saved and now - last_capture_at < COOLDOWN_SECONDS:
                status = f"Saved: {last_saved.name}"

            view = draw_ui(
                frame,
                quad,
                corner_labels,
                status,
                countdown_val,
                flash,
                mode,
                result,
                show_landmarks,
            )
            cv2.imshow(WINDOW_NAME, view)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                break
            if key in (ord("m"), ord("M")):
                modes = sorted(CORNER_MODES)
                mode = modes[(modes.index(mode) + 1) % len(modes)]
                stable_history.clear()
                countdown_end = None
            if key in (ord("d"), ord("D")):
                show_landmarks = not show_landmarks
            if key == ord(" ") and quad is not None:
                last_saved = save_capture(warp_quad(frame, quad), suffix="crop")
                last_capture_at = now
                flash_until = now + 0.25
                countdown_end = None
                stable_history.clear()
    finally:
        cap.release()
        landmarker.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
