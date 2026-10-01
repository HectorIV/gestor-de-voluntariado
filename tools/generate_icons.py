"""Genera los iconos de la PWA (se ejecuta una vez y no hace falta repetirlo).

    python tools/generate_icons.py

Salida: icons/icon-192.png, icons/icon-512.png, icons/icon-512-maskable.png,
        icons/apple-touch-icon.png, icons/favicon-64.png
"""
import os
from PIL import Image, ImageDraw

TEAL = (15, 118, 110, 255)      # color principal de la app
TEAL_DARK = (11, 93, 86, 255)
WHITE = (255, 255, 255, 255)
SS = 4                          # supersampling para bordes suaves

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def heart(draw, box, color):
    """Dibuja un corazón centrado dentro de `box` (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    w = x1 - x0
    h = y1 - y0
    cx = (x0 + x1) / 2
    r = w * 0.27
    top = y0 + h * 0.30
    lx, rx = cx - w * 0.24, cx + w * 0.24
    draw.ellipse([lx - r, top - r, lx + r, top + r], fill=color)
    draw.ellipse([rx - r, top - r, rx + r, top + r], fill=color)
    draw.polygon(
        [(cx - w * 0.50, top + h * 0.06), (cx + w * 0.50, top + h * 0.06), (cx, y1 - h * 0.08)],
        fill=color,
    )


def build(size, rounded, safe_zone=0.62):
    """icon cuadrado; rounded=True => esquinas redondeadas, False => a sangre (maskable)."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.20), fill=TEAL)
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.20), outline=TEAL_DARK, width=int(big * 0.02))
    else:
        d.rectangle([0, 0, big - 1, big - 1], fill=TEAL)

    pad = (1 - safe_zone) / 2
    box = (big * pad, big * pad, big * (1 - pad), big * (1 - pad))
    heart(d, box, WHITE)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("icon-192.png", 192, True, 0.66),
        ("icon-512.png", 512, True, 0.66),
        ("icon-512-maskable.png", 512, False, 0.60),
        ("apple-touch-icon.png", 180, False, 0.62),
        ("favicon-64.png", 64, True, 0.70),
    ]
    for name, size, rounded, safe in targets:
        build(size, rounded, safe).save(os.path.join(OUT, name))
        print("generado:", name)


if __name__ == "__main__":
    main()
