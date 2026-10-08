/* Collage para redes sociales: dibuja las fotos en un lienzo a medida
   (cuadrado 1080×1080 o vertical 1080×1920) y lo devuelve listo para
   descargar. Sin dependencias: canvas del navegador.

   Las celdas no son una rejilla fija: se calculan a partir del número de
   fotos, así no quedan huecos vacíos (con 1 foto ocupa todo, con 3 van
   dos arriba y una grande abajo, etc.). */

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

/**
 * Rectángulos de las celdas para `total` fotos (si no se indica, el máximo
 * de la plantilla). Se reparten en filas completas: nunca quedan casillas
 * sin foto, que era lo que hacía rara la imagen.
 */
export function celdas(plantillaId, formatoId, hueco = 16, total) {
  const p = plantilla(plantillaId);
  const f = formato(formatoId);
  const max = p.cols * p.rows;
  const n = Math.max(1, Math.min(max, Math.floor(Number(total) || max)));

  // Dos fotos en formato historia van apiladas (lado a lado quedan finitas).
  let cols = p.cols;
  if (n === 2 && f.h > f.w && cols > 1) cols = 1;

  const filas = [];
  let resto = n;
  while (resto > 0) {
    const enFila = Math.min(cols, resto);
    filas.push(enFila);
    resto -= enFila;
  }

  const rowH = (f.h - hueco * (filas.length + 1)) / filas.length;
  const cells = [];
  filas.forEach((count, r) => {
    const cw = (f.w - hueco * (count + 1)) / count;
    for (let c = 0; c < count; c++) {
      cells.push({ x: hueco + c * (cw + hueco), y: hueco + r * (rowH + hueco), w: cw, h: rowH });
    }
  });

  return { cells, width: f.w, height: f.h, max };
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

/** Ruta de rectángulo redondeado (roundRect si existe, si no a mano). */
function roundedPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Fondo: degradado verde profundo con un brillo suave arriba. */
function pintarFondo(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, '#15514a');
  g.addColorStop(1, '#08201f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const halo = ctx.createRadialGradient(w / 2, h * 0.16, 0, w / 2, h * 0.16, Math.max(w, h) * 0.8);
  halo.addColorStop(0, 'rgba(255, 255, 255, .12)');
  halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
}

/** Encaja la imagen cubriendo la celda (recorta lo que sobra, sin huecos). */
function drawCover(ctx, img, rect, radius) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  // sombra tenue detrás de la celda
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .38)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#000';
  roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.clip();
  const scale = Math.max(rect.w / iw, rect.h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);
  ctx.restore();
}

/** Barra inferior con el nombre del desayuno y la fecha. */
function pintarTitulo(ctx, w, h, titulo) {
  const principal = String((titulo && titulo.principal) || '').trim();
  const secundario = String((titulo && titulo.secundario) || '').trim();
  if (!principal && !secundario) return;

  const familia = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const margen = 72;
  const padding = 40;
  const avail = w - 2 * margen - 2 * padding;

  let size1 = 58;
  let size2 = 36;
  let w2 = 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `700 ${size1}px ${familia}`;
  let w1 = ctx.measureText(principal).width;
  if (w1 > avail) {
    size1 = Math.max(32, Math.floor((size1 * avail) / w1));
    ctx.font = `700 ${size1}px ${familia}`;
    w1 = ctx.measureText(principal).width;
  }

  if (secundario) {
    ctx.font = `500 ${size2}px ${familia}`;
    w2 = ctx.measureText(secundario).width;
    if (w2 > avail) {
      size2 = Math.max(24, Math.floor((size2 * avail) / w2));
      ctx.font = `500 ${size2}px ${familia}`;
      w2 = ctx.measureText(secundario).width;
    }
  }

  const line1 = principal ? size1 * 1.2 : 0;
  const line2 = secundario ? size2 * 1.25 : 0;
  const boxW = Math.min(avail, Math.max(principal ? w1 : 0, secundario ? w2 : 0)) + 2 * padding;
  const boxH = padding * 0.8 + line1 + (secundario && principal ? 12 : 0) + line2 + padding * 0.8;
  const bx = (w - boxW) / 2;
  const by = h - margen - boxH;

  roundedPath(ctx, bx, by, boxW, boxH, 34);
  ctx.fillStyle = 'rgba(6, 22, 21, .66)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, .16)';
  ctx.stroke();

  if (principal) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${size1}px ${familia}`;
    ctx.fillText(principal, w / 2, by + padding * 0.8 + size1 * 0.92);
  }
  if (secundario) {
    ctx.fillStyle = 'rgba(255, 255, 255, .86)';
    ctx.font = `500 ${size2}px ${familia}`;
    ctx.fillText(secundario, w / 2, by + padding * 0.8 + line1 + (principal ? 12 : 0) + size2 * 0.95);
  }
}

/**
 * Monta el collage. `blobs` son las fotos ya reducidas; se reparten en las
 * celdas sin dejar huecos. `titulo` ({ principal, secundario }) añade la
 * barra con el nombre y la fecha. Devuelve { blob, canvas } o null si el
 * navegador no soporta canvas.
 */
export async function buildCollage(blobs, { plantilla: pId = '2x2', formato: fId = 'cuadrado', hueco = 16, calidad = 0.93, titulo = null } = {}) {
  const lista = Array.isArray(blobs) ? blobs : [];
  const c = celdas(pId, fId, hueco, lista.length);
  const canvas = document.createElement('canvas');
  canvas.width = c.width;
  canvas.height = c.height;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;

  pintarFondo(ctx, c.width, c.height);

  const { decode } = await import('./photos.js');
  const cargadas = [];
  for (const blob of lista.slice(0, c.cells.length)) {
    try {
      const r = await decode(blob);
      cargadas.push(r.img);
    } catch {
      cargadas.push(null); // una foto ilegible no rompe el collage
    }
  }

  cargadas.forEach((img, i) => {
    const rect = c.cells[i];
    if (!rect) return;
    const radio = Math.round(Math.min(rect.w, rect.h) * 0.06);
    if (img) drawCover(ctx, img, rect, radio);
    else {
      // hueco de una foto ilegible: cuadro translúcido con marco
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, .08)';
      roundedPath(ctx, rect.x, rect.y, rect.w, rect.h, radio);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, .25)';
      ctx.stroke();
      ctx.restore();
    }
  });

  pintarTitulo(ctx, c.width, c.height, titulo);

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
