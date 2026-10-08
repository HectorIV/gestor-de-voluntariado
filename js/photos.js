/* Fotos de los desayunos.

   Los bytes de las imágenes van a IndexedDB (localStorage no da abasto para
   fotos) y junto al desayuno solo se guarda lo ligero: pie de foto, fecha y
   tamaño, para pintar la tarjeta sin tener que leer la base. Si el navegador
   no permite IndexedDB (modo privado, datos bloqueados) las fotos se guardan
   en memoria: la app sigue funcionando aunque esas fotos no sobrevivan al
   recargar la página. */

const DB_NAME = 'voluntariado-fotos';
const STORE = 'fotos';

let dbPromise = null;
const memoria = new Map();

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let resuelto = false;
    const fin = (valor) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      resolve(valor);
    };
    // Por si el navegador deja la petición colgada (base bloqueada por otra pestaña).
    const temporizador = setTimeout(() => {
      console.warn('IndexedDB no respondió; se usará memoria para las fotos.');
      fin(null);
    }, 4000);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => fin(req.result);
      req.onerror = () => {
        console.warn('IndexedDB no disponible:', req.error);
        fin(null);
      };
      req.onblocked = () => fin(null);
    } catch (err) {
      console.warn('IndexedDB no disponible:', err);
      fin(null);
    }
  });
  return dbPromise;
}

/** Ejecuta una operación sobre la tienda; devuelve null si no hay base. */
function run(mode, fn) {
  return openDb().then(
    (d) =>
      new Promise((resolve) => {
        if (!d) return resolve(null);
        try {
          const tx = d.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch (err) {
          console.warn('No se pudo usar el almacén de fotos:', err);
          resolve(null);
        }
      })
  );
}

/* ---------- Guardar / leer / borrar ---------- */

/** Guarda los dos tamaños de una foto: `full` para descargar, `thumb` para la cuadrícula. */
export async function putPhoto(id, { full, thumb }) {
  const registro = { id, full, thumb };
  memoria.set(id, registro);
  await run('readwrite', (s) => s.put(registro));
  return registro;
}

/** Devuelve { full, thumb } o null. */
export async function getPhoto(id) {
  if (memoria.has(id)) return memoria.get(id);
  const reg = await run('readonly', (s) => s.get(id));
  if (reg) memoria.set(id, reg);
  return reg || null;
}

/** Devuelve un Map id → { full, thumb } con solo las pedidas. */
export async function getPhotos(ids = []) {
  const out = new Map();
  await Promise.all(
    ids.map(async (id) => {
      const reg = await getPhoto(id);
      if (reg) out.set(id, reg);
    })
  );
  return out;
}

export async function deletePhoto(id) {
  memoria.delete(id);
  await run('readwrite', (s) => s.delete(id));
}

export async function deletePhotos(ids = []) {
  await Promise.all(ids.map((id) => deletePhoto(id)));
}

/* ---------- Imagen: decodificar, reducir, miniatura ---------- */

/** Lee un archivo de imagen y devuelve { img, width, height }. */
export function decode(file) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') return reject(new Error('sin Image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (fn) => {
      URL.revokeObjectURL(url);
      fn();
    };
    // Por si el navegador no dispara los eventos (o tarda en imágenes grandes).
    const timer = setTimeout(() => done(() => reject(new Error('tiempo agotado al leer la imagen'))), 15000);
    img.onload = () => {
      clearTimeout(timer);
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      done(() => (width && height ? resolve({ img, width, height }) : reject(new Error('imagen vacía'))));
    };
    img.onerror = () => {
      clearTimeout(timer);
      done(() => reject(new Error('no se pudo leer la imagen')));
    };
    img.src = url;
  });
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

/**
 * Reduce la foto al lado largo indicado y la pasa a JPEG.
 * Si el navegador no puede decodificarla, se queda con el archivo original:
 * así nunca se pierde la foto.
 */
export async function optimize(file, { max = 1600, quality = 0.82 } = {}) {
  let src;
  try {
    src = await decode(file);
  } catch {
    return { blob: file, width: 0, height: 0 };
  }
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return { blob: file, width: src.width, height: src.height };

  ctx.drawImage(src.img, 0, 0, width, height);
  const blob = await toBlob(canvas, 'image/jpeg', quality);
  return { blob: blob || file, width, height };
}

/** Miniatura para la cuadrícula (barata de cargar). */
export function makeThumb(file) {
  return optimize(file, { max: 480, quality: 0.7 });
}
