#!/usr/bin/env python3
"""
Synthesise a match-like clip to exercise board_exposure.py end to end.

Renders a perimeter of static boards behind a pitch, with a camera that pans and
zooms, players that walk in front, and focus that drifts — so every measurement
the detector makes has something real to bite on. It is a test of the pipeline,
not of accuracy on real football.
"""
import os
import numpy as np
import cv2

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_DIR = os.path.join(OUT_DIR, "test_logos")
VIDEO = os.path.join(OUT_DIR, "test_match.mp4")

W, H = 1280, 720
FPS = 25
SECONDS = 40

SPONSORS = [
    ("enterprise",      (200,  60,  40), "ENTERPRISE"),
    ("ashmead-roofing", ( 40, 120, 200), "ASHMEAD"),
    ("basils-bakery",   ( 30, 150,  90), "BASIL'S"),
]


def make_logo(colour, text, w=420, h=120):
    """A wordmark with enough geometry that a feature detector has purchase."""
    img = np.full((h, w, 3), 245, np.uint8)
    cv2.rectangle(img, (0, 0), (w - 1, h - 1), colour, 6)
    cv2.rectangle(img, (14, 14), (86, h - 14), colour, -1)
    cv2.circle(img, (50, h // 2), 20, (245, 245, 245), -1)
    cv2.putText(img, text, (104, h // 2 + 16), cv2.FONT_HERSHEY_DUPLEX,
                1.5, colour, 3, cv2.LINE_AA)
    cv2.line(img, (104, h - 30), (w - 20, h - 30), colour, 4)
    for i in range(6):                      # ticks add corner features
        x = 120 + i * 46
        cv2.rectangle(img, (x, h - 24), (x + 22, h - 16), colour, -1)
    return img


def pitch_background():
    """Green with mown stripes and a touchline — texture the matcher must ignore."""
    bg = np.zeros((H * 2, W * 3, 3), np.uint8)
    for x in range(0, bg.shape[1], 90):
        shade = 70 if (x // 90) % 2 == 0 else 84
        bg[:, x:x + 90] = (30, shade, 40)
    cv2.line(bg, (0, int(bg.shape[0] * 0.62)), (bg.shape[1], int(bg.shape[0] * 0.62)),
             (230, 230, 230), 5)
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 4, bg.shape).astype(np.int16)
    return np.clip(bg.astype(np.int16) + noise, 0, 255).astype(np.uint8)


def main():
    os.makedirs(LOGO_DIR, exist_ok=True)
    logos = []
    for slug, colour, text in SPONSORS:
        img = make_logo(colour, text)
        cv2.imwrite(os.path.join(LOGO_DIR, f"{slug}.png"), img)
        logos.append(img)
    print(f"wrote {len(logos)} reference logos to {LOGO_DIR}")

    world = pitch_background()
    board_y = int(world.shape[0] * 0.40)
    board_h = 150
    # Lay the boards along the perimeter, repeating, as a real ground does.
    placements = []
    x = 120
    i = 0
    while x < world.shape[1] - 500:
        logo = logos[i % len(logos)]
        bw = 440
        resized = cv2.resize(logo, (bw, board_h))
        world[board_y:board_y + board_h, x:x + bw] = resized
        placements.append((SPONSORS[i % len(SPONSORS)][0], x))
        x += bw + 70
        i += 1
    print(f"placed {len(placements)} boards across the world image")

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    vw = cv2.VideoWriter(VIDEO, fourcc, FPS, (W, H))
    n = FPS * SECONDS
    rng = np.random.default_rng(3)

    for f in range(n):
        t = f / n
        # Camera: pan across the ground, with a slow zoom cycle.
        zoom = 1.0 + 0.35 * math_sin(t * 2.2)
        vw_w = int(W / zoom)
        vw_h = int(H / zoom)
        max_x = world.shape[1] - vw_w - 1
        cx = int((0.06 + 0.88 * t) * max_x)
        cy = int(board_y - vw_h * 0.32)
        cy = max(0, min(world.shape[0] - vw_h - 1, cy))

        crop = world[cy:cy + vw_h, cx:cx + vw_w]
        frame = cv2.resize(crop, (W, H), interpolation=cv2.INTER_LINEAR)

        # Focus drift — a couple of windows go soft, as a real camera does.
        if 0.28 < t < 0.36 or 0.66 < t < 0.71:
            frame = cv2.GaussianBlur(frame, (9, 9), 3.2)

        # Players crossing in front of the boards.
        for p in range(3):
            px = int((t * 2.4 + p * 0.37) % 1.0 * W)
            py = int(H * 0.36 + 40 * math_sin(t * 9 + p))
            cv2.rectangle(frame, (px, py), (px + 34, py + 120), (20, 20, 30), -1)
            cv2.circle(frame, (px + 17, py - 12), 15, (30, 30, 45), -1)

        # Floodlight falloff towards the edges.
        yy, xx = np.mgrid[0:H, 0:W]
        vign = 1.0 - 0.30 * (((xx - W / 2) / (W / 2)) ** 2 +
                             ((yy - H / 2) / (H / 2)) ** 2)
        frame = np.clip(frame * vign[..., None], 0, 255).astype(np.uint8)

        noise = rng.normal(0, 3, frame.shape).astype(np.int16)
        frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        vw.write(frame)

    vw.release()
    print(f"wrote {VIDEO} — {SECONDS}s, {W}x{H}, {FPS}fps")


def math_sin(x):
    return float(np.sin(x * np.pi))


if __name__ == "__main__":
    main()
