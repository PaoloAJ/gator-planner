"""Draws the extension icons (blue tile, white check, orange bar) without dependencies.

    python3 scripts/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

BLUE = (0, 33, 165)
ORANGE = (250, 70, 22)
WHITE = (255, 255, 255)
SS = 4  # supersampling per axis


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def color_at(x, y):
    """x, y in 0..1. Returns (r, g, b, a) or None for transparent."""
    r = 0.22
    cx, cy = min(max(x, r), 1 - r), min(max(y, r), 1 - r)
    if math.hypot(x - cx, y - cy) > r:
        return None
    w = 0.085
    if seg_dist(x, y, 0.26, 0.47, 0.43, 0.63) < w or seg_dist(x, y, 0.43, 0.63, 0.75, 0.30) < w:
        return WHITE
    if 0.24 <= x <= 0.76 and 0.76 <= y <= 0.84:
        return ORANGE
    return BLUE


def render(size, pad=0):
    """pad: transparent margin in pixels (the store wants 16 on the 128px icon)."""
    inner = size - 2 * pad
    rows = []
    n = SS * SS
    for j in range(size):
        row = bytearray([0])
        for i in range(size):
            acc = [0, 0, 0, 0]
            for sj in range(SS):
                for si in range(SS):
                    x = (i - pad + (si + 0.5) / SS) / inner
                    y = (j - pad + (sj + 0.5) / SS) / inner
                    c = color_at(x, y) if 0 <= x <= 1 and 0 <= y <= 1 else None
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 1
            a = acc[3]
            row += bytes([acc[0] // a, acc[1] // a, acc[2] // a, 255 * a // n] if a else [0, 0, 0, 0])
        rows.append(bytes(row))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
            + chunk(b"IEND", b""))


out = Path(__file__).resolve().parent.parent / "icons"
for size in (16, 32, 48, 128):
    (out / f"icon-{size}.png").write_bytes(render(size, pad=16 if size == 128 else 0))
    print("wrote", out / f"icon-{size}.png")
