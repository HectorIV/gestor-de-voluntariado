"""Genera los iconos de la PWA (se ejecuta una vez y no hace falta repetirlo).

    python tools/generate_icons.py

Salida: icons/icon-192.png, icons/icon-512.png, icons/icon-512-maskable.png,
        icons/apple-touch-icon.png, icons/favicon-64.png

El corazón se dibuja con la curva paramétrica clásica
    x = 16·sin³t ;  y = 13·cos t − 5·cos 2t − 2·cos 3t − cos 4t
sobre un degradado, con sombra suave y brillo, para que no quede como un
triángulo pegado a dos círculos.
"""
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

TEAL_TOP = (19, 145, 133, 255)      # degradado del fondo (arriba)
TEAL_BOTTOM = (9, 78, 72, 255)      # degradado del fondo (abajo)
TEAL_DARK = (7, 62, 57, 255)        # borde

# Corazón blanco con un degradado muy suave (arriba claro, abajo levemente verdoso)
HEART_TOP = (255, 255, 255, 255)
HEART_BOTTOM = (220, 244, 241, 255)

SS = 4                              # supersampling para bordes suaves
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


# ---------- formas ----------

def heart_polygon(n=900):
    """Puntos (x, y) del corazón normalizados a la caja 0..1 (centrado)."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x, y))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    w, h = max_x - min_x, max_y - min_y
    norm = []
    for x, y in pts:
        nx = (x - min_x) / w            # 0..1
        ny = 1 - (y - min_y) / h        # el eje y de la fórmula sube; en pantalla baja
        norm.append((nx, ny))
    return norm


def heart_mask(big, box, blur=0.0):
    """Máscara 'L' con el corazón relleno dentro de `box` (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    # proporción del corazón (≈1.1 de ancho por alto) para que no se deforme
    ratio = 32.0 / 29.0
    if bw / bh > ratio:
        new_w = bh * ratio
        x0 += (bw - new_w) / 2
        bw = new_w
    else:
        new_h = bw / ratio
        y0 += (bh - new_h) / 2
        bh = new_h

    m = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(m)
    d.polygon([(x0 + nx * bw, y0 + ny * bh) for nx, ny in heart_polygon()], fill=255)
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return m


def vertical_gradient(big, top, bottom):
    g = Image.linear_gradient("L").resize((big, big), Image.BILINEAR)
    return ImageOps.colorize(g, top[:3], bottom[:3]).convert("RGBA")


def shadowed(mask, big, offset, blur, alpha):
    """Sombbra: la máscara desplazada y desenfocada."""
    sh = Image.new("L", (big, big), 0)
    sh.paste(mask, (int(offset), int(offset)))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    sh = sh.point(lambda v: int(v * alpha / 255))
    return sh


# ---------- icono ----------

def build(size, rounded, safe_zone=0.66, heart_top=HEART_TOP, heart_bottom=HEART_BOTTOM):
    big = size * SS
    img = vertical_gradient(big, TEAL_TOP, TEAL_BOTTOM)

    # corazón
    pad = (1 - safe_zone) / 2
    box = (big * pad, big * pad, big * (1 - pad), big * (1 - pad))
    hm = heart_mask(big, box)

    # sombra bajo el corazón
    shade = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    shade.paste((0, 0, 0, 255), (0, 0), shadowed(hm, big, big * 0.012, big * 0.018, 110))
    img = Image.alpha_composite(img, shade)

    # cuerpo del corazón con degradado
    body = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    body.paste(vertical_gradient(big, heart_top, heart_bottom), (0, 0), hm)
    img = Image.alpha_composite(img, body)

    # brillo: reflejo redondeado sobre el lóbulo izquierdo (luz desde arriba-izquierda).
    # Con el corazón blanco casi no se nota; si algún día se cambia a un color
    # fuerte, el reflejo ya está colocado.
    bx0, by0, bx1, by1 = box
    bw, bh = bx1 - bx0, by1 - by0
    cx = (bx0 + bx1) / 2
    shine = Image.new("L", (big, big), 0)
    ImageDraw.Draw(shine).ellipse(
        [cx - bw * 0.34, by0 + bh * 0.14, cx - bw * 0.04, by0 + bh * 0.40], fill=90
    )
    shine = shine.filter(ImageFilter.GaussianBlur(big * 0.022))
    shine = ImageChops.multiply(shine, hm)
    gloss = Image.new("RGBA", (big, big), HEART_TOP)
    gloss.putalpha(shine)
    img = Image.alpha_composite(img, gloss)

    # esquinas
    if rounded:
        radius = int(big * 0.20)
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=255)
        frame = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        ImageDraw.Draw(frame).rounded_rectangle(
            [0, 0, big - 1, big - 1], radius=radius, outline=TEAL_DARK, width=int(big * 0.018)
        )
        img.putalpha(mask)          # recorta las esquinas
        img = Image.alpha_composite(img, frame)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)

    targets = [
        ("icon-192.png", 192, True, 0.66),
        ("icon-512.png", 512, True, 0.66),
        ("icon-512-maskable.png", 512, False, 0.60),
        ("apple-touch-icon.png", 180, False, 0.62),
        ("favicon-64.png", 64, True, 0.72),
    ]
    for name, size, rounded, safe in targets:
        build(size, rounded, safe).save(os.path.join(OUT, name))
        print("generado:", name)


if __name__ == "__main__":
    main()
