/* Collage para redes sociales: dibuja las fotos en un lienzo a medida
   (cuadrado 1080×1080 o vertical 1080×1920) y lo devuelve listo para
   descargar. Sin dependencias: canvas del navegador. */

export const PLANTILLAS = [
  { id: '2x2', label: 'Cuadrícula 2×2', cols: 2, rows: 2 },
  { id: '3x3', label: 'Cuadrícula 3×3', cols: 3, rows: 3 },
  { id: 'tira', label: 'Tira vertical', cols: 1, rows: 3 },
];

export const FORMATOS = [
  { id: 'cuadrado', label: 'Cuadrado · 1080 × 1080', w: 1080, h: 1080 },
  { id: 'vertical', label: 'Historia · 1080 × 1920', w: 1080, h: 1920 },
];

export function plantilla(id) {
  return PLANTILLAS.find((p) => p.id === id) || PLANTILLAS[0];
}

export function formato(id) {
  return FORMATOS.find((f) => f.id === id) || FORMATOS[0];
}

/** Rectángulos de cada celda (las que sobren quedan del color de fondo). */
export function celdas(plantillaId, formatoId, hueco = 10) {
  const p = plantilla(plantillaId);
  const f = formato(formatoId);
  const cw = (f.w - hueco * (p.cols + 1)) / p.cols;
  const ch = (f.h - hueco * (p.rows + 1)) / p.rows;
  const out = [];
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      out.push({ x: hueco + c * (cw + hueco), y: hueco + r * (ch + hueco), w: cw, h: ch });
    }
  }
  return { cells: out, width: f.w, height: f.h, max: p.cols * p.rows };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob === 'function') canvas.toBlob((b) => resolve(b), type, quality);
      else resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Encaja la imagen cubriendo la celda (recorta lo que sobra, sin dejar huecos). */
function drawCover(ctx, img, rect) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(rect.w / iw, rect.h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);
}

/**
 * Monta el collage. `blobs` son las fotos ya reducidas; si hay menos que
 * celdas, las que sobran quedan con el fondo. Devuelve { blob, canvas } o
 * null si el navegador no soporta canvas.
 */
export async function buildCollage(blobs, { plantilla: pId = '2x2', formato: fId = 'cuadrado', fondo = '#10201f', hueco = 10, calidad = 0.92 } = {}) {
  const c = celdas(pId, fId, hueco);
  const canvas = document.createElement('canvas');
  canvas.width = c.width;
  canvas.height = c.height;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fondo;

  const { decode } = await import('./photos.js');
  const cargadas = [];
  for (const blob of blobs.slice(0, c.cells.length)) {
    try {
      const r = await decode(blob);
      cargadas.push(r.img);
    } catch {
      cargadas.push(null); // una foto ilegible no rompe el collage
    }
  }
  cargadas.forEach((img, i) => {
    if (img) drawCover(ctx, img, c.cells[i]);
  });

  const blob = await toBlob(canvas, 'image/jpeg', calidad);
  if (!blob) return null;
  return { blob, canvas, width: c.width, height: c.height, cells: c.cells.length, used: cargadas.length };
}

/** Vista previa en miniatura (dataURL) para enseñar el collage antes de bajarlo. */
export function previewUrl(canvas) {
  try {
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch {
    return '';
  }
}

/** Descarga un blob con el nombre indicado. Devuelve false si no es posible. */
export function downloadBlob(blob, filename) {
  if (!blob || typeof URL.createObjectURL !== 'function') return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
