#!/usr/bin/env python3
"""Draw the Brick Twist app icons (no dependencies, no external assets).

Usage: python3 tools/make_icons.py
Writes icons/icon-192.png, icons/icon-512.png, icons/maskable-512.png and icons/apple-touch-icon.png.

The picture is the game itself: rows of bright bricks with one brick knocked loose and twisting, a glowing ball
and the paddle, on the game's dark background. Shapes are signed-distance functions rendered with analytic
anti-aliasing, so every size is drawn directly (no scaling blur).
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons')

BG_TOP = (0x1c, 0x22, 0x55)
BG_BOT = (0x05, 0x06, 0x0d)
BRICK_COLOURS = ['#ff5a64', '#ff9f43', '#ffd35a', '#2ee0a4', '#4fd8ff', '#5b8cff', '#a46bff', '#ff6bcb']
PADDLE = '#4fd8ff'


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Canvas:
    def __init__(self, size):
        self.n = size
        self.px = [[0.0, 0.0, 0.0] for _ in range(size * size)]
        for y in range(size):
            t = y / (size - 1)
            col = [BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t for i in range(3)]
            for x in range(size):
                self.px[y * size + x] = list(col)

    def blend(self, x, y, rgb, a):
        if a <= 0:
            return
        p = self.px[y * self.n + x]
        a = min(1.0, a)
        for i in range(3):
            p[i] += (rgb[i] - p[i]) * a

    # Fill a shape given by sdf(px, py) -> distance in pixels (negative inside), over a pixel bounding box.
    def fill(self, sdf, box, rgb, alpha=1.0, shade=None):
        x0, y0, x1, y1 = [int(math.floor(v)) for v in box]
        for y in range(max(0, y0 - 1), min(self.n, y1 + 2)):
            for x in range(max(0, x0 - 1), min(self.n, x1 + 2)):
                d = sdf(x + 0.5, y + 0.5)
                cov = 0.5 - d
                if cov <= 0:
                    continue
                c = rgb if shade is None else shade(x + 0.5, y + 0.5, rgb)
                self.blend(x, y, c, alpha * min(1.0, cov))

    def glow(self, cx, cy, r, rgb, alpha):
        for y in range(max(0, int(cy - r)), min(self.n, int(cy + r) + 1)):
            for x in range(max(0, int(cx - r)), min(self.n, int(cx + r) + 1)):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
                if d < 1:
                    self.blend(x, y, rgb, alpha * (1 - d) ** 2)

    def png(self, path):
        n = self.n
        raw = bytearray()
        for y in range(n):
            raw.append(0)
            for x in range(n):
                p = self.px[y * n + x]
                raw += bytes(max(0, min(255, int(round(v)))) for v in p)

        def chunk(tag, data):
            return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
        data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0)) +
                chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))
        with open(path, 'wb') as f:
            f.write(data)


def rrect_sdf(cx, cy, hw, hh, r, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)

    def f(x, y):
        dx, dy = x - cx, y - cy
        lx, ly = dx * c + dy * s, -dx * s + dy * c
        qx, qy = abs(lx) - hw + r, abs(ly) - hh + r
        return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
    ext = math.hypot(hw, hh) + 1
    return f, (cx - ext, cy - ext, cx + ext, cy + ext)


def circle_sdf(cx, cy, r):
    return (lambda x, y: math.hypot(x - cx, y - cy) - r), (cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1)


def lighten(rgb, k):
    return tuple(v + (255 - v) * k for v in rgb)


def draw(size, safe):
    """safe: the fraction of the icon the picture may use (1 = edge to edge), centred."""
    cv = Canvas(size)
    m = (1 - safe) / 2

    def X(u):
        return (m + u * safe) * size

    def L(u):
        return u * safe * size

    # soft light behind the bricks
    cv.glow(X(0.5), X(0.3), L(0.75), (60, 90, 200), 0.35)
    # three rows of four bricks; one in the middle row has come loose and is twisting down
    bw, bh, gap = 0.215, 0.105, 0.047
    loose = (1, 2)
    for row in range(3):
        for col in range(4):
            colour = hexrgb(BRICK_COLOURS[(row * 3 + col * 2) % len(BRICK_COLOURS)])
            cx = 0.5 + (col - 1.5) * (bw + gap)
            cy = 0.1 + row * (bh + 0.045)
            ang = 0.0
            if (row, col) == loose:  # knocked out of the gap, tumbling away to the right
                cx, cy, ang = 0.8, 0.585, 0.5
            sdf, box = rrect_sdf(X(cx), X(cy), L(bw / 2), L(bh / 2), L(0.028), ang)
            top = X(cy) - L(bh / 2)

            def shade(px, py, rgb, top=top):  # a lighter top edge, like the game's bricks
                k = max(0.0, 0.45 - (py - top) / L(bh) * 0.9)
                return lighten(rgb, k)
            cv.fill(sdf, box, colour, 1.0, shade)
    # the ball: trail, glow, ball
    bx, by, br = 0.53, 0.69, 0.058
    for i in range(4, 0, -1):
        t = i / 5
        sdf, box = circle_sdf(X(bx + 0.07 * t), X(by - 0.2 * t), L(br * (1 - 0.13 * i)))
        cv.fill(sdf, box, (150, 210, 255), 0.18 * (1 - t))
    cv.glow(X(bx), X(by), L(br * 3.2), (160, 220, 255), 0.55)
    sdf, box = circle_sdf(X(bx), X(by), L(br))
    cv.fill(sdf, box, (255, 255, 255))
    # the paddle, with a glow under it
    cv.glow(X(0.5), X(0.9), L(0.32), (79, 216, 255), 0.35)
    sdf, box = rrect_sdf(X(0.5), X(0.885), L(0.25), L(0.045), L(0.045))
    paddle_top = X(0.885) - L(0.045)
    cv.fill(sdf, box, hexrgb(PADDLE), 1.0,
            lambda px, py, rgb: lighten(rgb, max(0.0, 0.5 - (py - paddle_top) / L(0.09))))
    return cv


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('icon-192.png', 192, 0.86),
        ('icon-512.png', 512, 0.86),
        ('apple-touch-icon.png', 180, 0.8),   # iOS rounds the corners itself
        ('maskable-512.png', 512, 0.6),       # the picture stays inside the 80% safe circle
    ]
    for name, size, safe in jobs:
        draw(size, safe).png(os.path.join(OUT, name))
        print('make_icons: wrote icons/%s (%dx%d)' % (name, size, size))


if __name__ == '__main__':
    main()
