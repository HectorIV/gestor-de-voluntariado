/* Fotos y collage.

   Las fotos viven ligadas a su desayuno: se suben desde la tarjeta del
   desayuno o desde esta sección (eligiendo el desayuno). Aquí se ven en
   cuadrícula, se les pone pie (qué hizo cada equipo), se descargan una a una
   y se arma el collage para redes (2×2, 3×3 o tira) en 1080×1080 o
   1080×1920. */

import { store, upcomingEvents } from '../store.js';
import { esc, toast, openModal, emptyState, statCard, formatDate, confirmDialog, rerender, field, grid } from '../ui.js';
import { optimize, makeThumb, putPhoto, getPhoto, getPhotos, deletePhoto } from '../photos.js';
import { PLANTILLAS, FORMATOS, buildCollage, previewUrl, downloadBlob } from '../collage.js';

/* Estado de la vista (se mantiene al cambiar de sección y volver). */
let filtro = 'todas';
let plantillaId = '2x2';
let formatoId = 'cuadrado';
let colTitulo = true; // barra con el nombre y la fecha en la imagen
let vistaPrevia = null; // { dataUrl, blob }
const seleccion = new Set();
const urls = []; // object URLs de las miniaturas, para liberarlas al repintar

export function renderFotos(root) {
  rerender(() => drawFotos(root));
}

/* ---------- Datos ---------- */

/** La galería puede venirse con el desayuno ya elegido (#/fotos?ev=ID). */
function leerQuery() {
  const q = location.hash.split('?')[1];
  if (!q) return;
  const ev = new URLSearchParams(q).get('ev');
  if (ev) filtro = ev;
}

function eventosOrdenados() {
  return [...store.state.events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function fotosVisibles() {
  const out = [];
  eventosOrdenados()
    .filter((ev) => filtro === 'todas' || ev.id === filtro)
    .forEach((ev) => (ev.photos || []).forEach((p) => out.push({ ev, p })));
  return out;
}

function buscarFoto(id) {
  for (const ev of store.state.events) {
    const i = (ev.photos || []).findIndex((p) => p.id === id);
    if (i >= 0) return { ev, index: i, foto: ev.photos[i] };
  }
  return null;
}

/* ---------- Pintar ---------- */

function drawFotos(root) {
  leerQuery();
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));

  const eventos = eventosOrdenados();
  const visibles = fotosVisibles();
  const conFotos = eventos.filter((ev) => (ev.photos || []).length).length;

  if (!eventos.length) {
    root.innerHTML = `
      <div class="stats">
        ${statCard({ label: 'Fotos', value: '0', hint: 'aún no hay desayunos' })}
      </div>
      ${emptyState({
        icon: '🖼',
        title: 'Primero crea un desayuno',
        text: 'Las fotos se guardan dentro de cada desayuno: crea uno en la sección Desayunos y sube sus fotos.',
        action: '<a class="btn btn--primary" href="#/desayunos">🥐 Ir a Desayunos</a>',
      })}`;
    return;
  }

  root.innerHTML = `
    <div class="stats">
      ${statCard({ label: 'Fotos', value: String(visibles.length), hint: filtro === 'todas' ? 'subidas' : 'en este desayuno' })}
      ${statCard({ label: 'Desayunos con fotos', value: String(conFotos), hint: `de ${eventos.length} en total` })}
      ${statCard({ label: 'Elegidas', value: String(seleccion.size), hint: 'para el collage', tone: seleccion.size ? 'primary' : '' })}
    </div>

    <div class="toolbar">
      <select class="input input--filter" id="fotoFiltro" aria-label="Filtrar por desayuno">
        <option value="todas" ${filtro === 'todas' ? 'selected' : ''}>Todos los desayunos</option>
        ${eventos
          .map((ev) => `<option value="${ev.id}" ${filtro === ev.id ? 'selected' : ''}>${esc(ev.title)} · ${formatDate(ev.date)}</option>`)
          .join('')}
      </select>
      <button class="btn btn--primary" id="fotoSubir">📤 Subir fotos</button>
      ${
        seleccion.size
          ? '<button class="btn btn--ghost btn--sm" id="fotoLimpiar">✕ Quitar selección</button>'
          : ''
      }
    </div>

    ${collagePanel(visibles)}

    ${
      visibles.length
        ? galeria(visibles)
        : emptyState({
            icon: '📷',
            title: 'Todavía no hay fotos aquí',
            text: 'Sube fotos del desayuno (con su pie: qué hizo cada equipo) y sácalas a la galería o al collage.',
            action: '<button class="btn btn--primary" id="fotoSubirVacio">📤 Subir fotos</button>',
          })
    }
  `;

  root.querySelector('#fotoFiltro')?.addEventListener('change', (e) => {
    filtro = e.target.value;
    location.hash = filtro === 'todas' ? '#/fotos' : `#/fotos?ev=${filtro}`;
    vistaPrevia = null;
    renderFotos(root);
  });
  root.querySelector('#fotoSubir')?.addEventListener('click', () => openUpload());
  root.querySelector('#fotoSubirVacio')?.addEventListener('click', () => openUpload());
  root.querySelector('#fotoLimpiar')?.addEventListener('click', () => {
    seleccion.clear();
    vistaPrevia = null;
    renderFotos(root);
  });

  // Selección para el collage y acciones de cada foto
  root.querySelectorAll('[data-select]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.select;
      if (seleccion.has(id)) seleccion.delete(id);
      else seleccion.add(id);
      vistaPrevia = null;
      renderFotos(root);
    })
  );
  root.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => descargarFoto(b.dataset.dl)));
  root.querySelectorAll('[data-cap]')?.forEach((b) => b.addEventListener('click', () => editarPie(b.dataset.cap, root)));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => borrarFoto(b.dataset.del, root)));

  // Panel del collage
  const selPlanta = root.querySelector('#colPlantilla');
  if (selPlanta) {
    selPlanta.value = plantillaId;
    selPlanta.addEventListener('change', (e) => {
      plantillaId = e.target.value;
      vistaPrevia = null;
      renderFotos(root);
    });
  }
  const selFormato = root.querySelector('#colFormato');
  if (selFormato) {
    selFormato.value = formatoId;
    selFormato.addEventListener('change', (e) => {
      formatoId = e.target.value;
      vistaPrevia = null;
      renderFotos(root);
    });
  }
  const chkTitulo = root.querySelector('#colTitulo');
  if (chkTitulo) {
    chkTitulo.addEventListener('change', (e) => {
      colTitulo = e.target.checked;
      if (vistaPrevia) {
        vistaPrevia = null; // el título cambia la imagen: se regenera al crearla
        renderFotos(root);
      }
    });
  }
  root.querySelector('#colBuild')?.addEventListener('click', () => crearCollage(visibles, root));
  root.querySelector('#colDownload')?.addEventListener('click', () => {
    if (!vistaPrevia?.blob) return;
    const fecha = new Date().toISOString().slice(0, 10);
    if (!downloadBlob(vistaPrevia.blob, `collage-${plantillaId}-${formatoId}-${fecha}.jpg`)) {
      toast('Tu navegador no permite descargar archivos', 'error');
      return;
    }
    toast('Collage descargado ✅');
  });

  pintarThumbs(root);
}

function galeria(visibles) {
  const porEv = new Map();
  visibles.forEach(({ ev, p }) => {
    if (!porEv.has(ev.id)) porEv.set(ev.id, { ev, fotos: [] });
    porEv.get(ev.id).fotos.push(p);
  });

  return `<div class="gallery-groups">
    ${[...porEv.values()]
      .map(
        ({ ev, fotos }) => `
      <section class="gallery-group">
        <h3 class="gallery-group__title">
          🥐 ${esc(ev.title)} <span class="muted">· ${formatDate(ev.date)}${ev.area ? ` · ${esc(ev.area)}` : ''}</span>
        </h3>
        <div class="gallery">
          ${fotos
            .map(
              (p) => `
            <figure class="photo ${seleccion.has(p.id) ? 'is-sel' : ''}">
              <div class="photo__img" data-thumb="${p.id}" role="img" aria-label="${esc(p.caption || 'Foto del desayuno')}"></div>
              <figcaption class="photo__cap" title="${esc(p.caption || '')}">${p.caption ? esc(p.caption) : '<span class="muted">Sin pie</span>'}</figcaption>
              <div class="photo__acts">
                <button class="icon-btn" data-select="${p.id}" title="${seleccion.has(p.id) ? 'Quitar del collage' : 'Elegir para el collage'}" aria-pressed="${seleccion.has(p.id)}">${seleccion.has(p.id) ? '☑' : '☐'}</button>
                <button class="icon-btn" data-dl="${p.id}" title="Descargar">⬇️</button>
                <button class="icon-btn" data-cap="${p.id}" title="Cambiar el pie">✏️</button>
                <button class="icon-btn" data-del="${p.id}" title="Eliminar">🗑️</button>
              </div>
            </figure>`
            )
            .join('')}
        </div>
      </section>`
      )
      .join('')}
  </div>`;
}

function collagePanel(visibles) {
  const celdas = { '2x2': 4, '3x3': 9, tira: 3 }[plantillaId] || 4;
  const elegidas = visibles.filter(({ p }) => seleccion.has(p.id)).length;
  const hint = elegidas
    ? `${elegidas} elegida${elegidas === 1 ? '' : 's'} · hasta ${celdas} por collage`
    : `Sin elegir: se usarán las ${Math.min(celdas, visibles.length)} primeras · la plantilla se rellena sola`;

  return `
  <div class="collage">
    <div class="collage__row">
      <label class="collage__field">
        <span>Plantilla</span>
        <select class="input" id="colPlantilla">
          ${PLANTILLAS.map((p) => `<option value="${p.id}" ${p.id === plantillaId ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
      </label>
      <label class="collage__field">
        <span>Tamaño</span>
        <select class="input" id="colFormato">
          ${FORMATOS.map((f) => `<option value="${f.id}" ${f.id === formatoId ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </label>
      <label class="check collage__check">
        <input type="checkbox" id="colTitulo" ${colTitulo ? 'checked' : ''} />
        <span class="check__name">Título con nombre y fecha</span>
      </label>
      <button class="btn btn--primary" id="colBuild" ${visibles.length ? '' : 'disabled'}>🖼 Crear collage</button>
      <span class="collage__hint muted">${hint}</span>
    </div>
    ${
      vistaPrevia
        ? `<div class="collage__preview">
        <img src="${vistaPrevia.dataUrl}" alt="Vista previa del collage" />
        <div class="collage__preview-acts">
          <a class="btn btn--ghost btn--sm" href="#/desayunos">🥐 Volver a desayunos</a>
          <button class="btn btn--primary" id="colDownload">⬇ Descargar collage</button>
        </div>
      </div>`
        : ''
    }
  </div>`;
}

/** Object URL o cadena vacía si el navegador no lo permite (modo prueba). */
function objectUrl(blob) {
  try {
    return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
  } catch {
    return '';
  }
}

/** Carga las miniaturas de las fotos visibles (IndexedDB). */
function pintarThumbs(root) {
  const celdas = [...root.querySelectorAll('[data-thumb]')];
  if (!celdas.length) return;
  getPhotos(celdas.map((el) => el.dataset.thumb)).then((map) => {
    celdas.forEach((el) => {
      const reg = map.get(el.dataset.thumb);
      const url = reg ? objectUrl(reg.thumb || reg.full) : '';
      if (!url) {
        el.classList.add('is-missing');
        el.textContent = '🖼';
        return;
      }
      urls.push(url);
      el.style.backgroundImage = `url("${url}")`;
      el.classList.add('is-ready');
    });
  });
}

/* ---------- Acciones ---------- */

async function descargarFoto(id) {
  const reg = await getPhoto(id);
  if (!reg?.full) {
    toast('Esa foto no está en este dispositivo', 'error');
    return;
  }
  const info = buscarFoto(id);
  const nombre = `${(info?.foto.caption || 'foto').replace(/[^\wáéíóúñ -]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'foto'}-${id.slice(-4)}.jpg`;
  if (!downloadBlob(reg.full, nombre)) {
    toast('Tu navegador no permite descargar archivos', 'error');
    return;
  }
  toast('Foto descargada ✅');
}

function editarPie(id, root) {
  const info = buscarFoto(id);
  if (!info) return;
  openModal({
    title: '✏️ Pie de la foto',
    body: `
      <p class="modal__intro">Escribe <strong>qué se ve o qué hizo el equipo</strong>; aparece en la galería y ayuda a ordenar el recuerdo.</p>
      ${grid('form-grid', field({ label: 'Pie de la foto', name: 'caption', value: info.foto.caption || '', placeholder: 'Ej. Equipo cocina preparando el café' }))}`,
    saveLabel: 'Guardar pie',
    onSubmit: (data) => {
      store.update((s) => {
        const ev = s.events.find((e) => e.id === info.ev.id);
        if (ev && ev.photos?.[info.index]) ev.photos[info.index].caption = (data.caption || '').trim();
      });
      toast('Pie guardado');
      return true;
    },
  });
}

function borrarFoto(id, root) {
  const info = buscarFoto(id);
  if (!info) return;
  if (!confirmDialog('¿Eliminar esta foto? No se puede deshacer.')) return;
  seleccion.delete(id);
  vistaPrevia = null;
  store.update((s) => {
    const ev = s.events.find((e) => e.id === info.ev.id);
    if (ev) ev.photos = (ev.photos || []).filter((p) => p.id !== id);
  });
  deletePhoto(id); // sin esperar: la tarjeta ya no la enseña
  toast('Foto eliminada');
  renderFotos(root);
}

async function crearCollage(visibles, root) {
  const elegidas = visibles.filter(({ p }) => seleccion.has(p.id));
  const celdas = { '2x2': 4, '3x3': 9, tira: 3 }[plantillaId] || 4;
  const usar = (elegidas.length ? elegidas : visibles).slice(0, celdas);
  if (!usar.length) {
    toast('Sube fotos antes de crear el collage', 'error');
    return;
  }

  const mapa = await getPhotos(usar.map(({ p }) => p.id));
  const blobs = usar.map(({ p }) => mapa.get(p.id)).filter(Boolean).map((r) => r.full);
  if (!blobs.length) {
    toast('Las fotos elegidas no están en este dispositivo', 'error');
    return;
  }

  toast('Montando el collage…');
  // Título: el nombre y la fecha del desayuno del que son las fotos
  const ev0 = usar[0].ev || {};
  const titulo = colTitulo
    ? {
        principal: ev0.title || 'Desayuno',
        secundario: [ev0.date ? formatDate(ev0.date) : '', ev0.place || ''].filter(Boolean).join(' · '),
      }
    : null;
  let res = null;
  try {
    res = await buildCollage(blobs, { plantilla: plantillaId, formato: formatoId, titulo });
  } catch (err) {
    console.warn('No se pudo montar el collage:', err);
  }
  if (!res) {
    toast('Este navegador no puede crear el collage', 'error');
    return;
  }
  vistaPrevia = { dataUrl: previewUrl(res.canvas), blob: res.blob };
  renderFotos(root);
  const f = FORMATOS.find((x) => x.id === formatoId) || FORMATOS[0];
  toast(`Collage listo · ${f.w}×${f.h} 🖼`);
}

/* ---------- Subir fotos ---------- */

/**
 * Modal de subida. `eventId` prefija el desayuno (desde su tarjeta);
 * si no viene, se elige en el propio modal.
 */
export function openUpload(eventId) {
  const eventos = eventosOrdenados();
  if (!eventos.length) {
    toast('Primero crea un desayuno para sus fotos', 'error');
    return;
  }
  const inicial = eventId || (filtro !== 'todas' ? filtro : upcomingEvents()[0]?.id || eventos[0].id);
  let filos = [];

  const body = `
    <p class="modal__intro">
      Las fotos se guardan <strong>dentro del desayuno</strong> (aquí y en el móvil siguen disponibles sin internet).
      Puedes añadir el pie de cada una ahora o después desde la galería.
    </p>
    ${grid(
      'form-grid',
      field({
        label: 'Desayuno',
        name: 'eventId',
        type: 'select',
        value: inicial,
        options: eventos.map((ev) => ({ value: ev.id, label: `${ev.title} · ${formatDate(ev.date)}` })),
      })
    )}
    <div class="photo-pick">
      <label class="photo-pick__label">
        📤 Elegir fotos
        <input type="file" id="fotoArchivo" accept="image/*" multiple />
      </label>
      <p class="muted">Se reducen a 1600 px para no ocupar de más; la calidad da para Instagram y Facebook.</p>
    </div>
    <div class="photo-rows" id="fotoFilas"></div>`;

  openModal({
    title: '📤 Subir fotos',
    body,
    saveLabel: 'Guardar fotos',
    onMount: (frm) => {
      const input = frm.querySelector('#fotoArchivo');
      const filas = frm.querySelector('#fotoFilas');
      const pintar = () => {
        filas.innerHTML = filos
          .map(
            (f, i) => `
          <div class="photo-row">
            <span class="photo-row__name" title="${esc(f.file.name)}">${esc(f.file.name)}</span>
            <input class="input" data-pie="${i}" value="${esc(f.caption)}" placeholder="¿Qué se ve? (opcional)" />
            <button type="button" class="icon-btn" data-quitar="${i}" title="Quitar">✕</button>
          </div>`
          )
          .join('');
        filas.querySelectorAll('[data-pie]').forEach((el) =>
          el.addEventListener('input', (e) => {
            filos[Number(el.dataset.pie)].caption = e.target.value;
          })
        );
        filas.querySelectorAll('[data-quitar]').forEach((b) =>
          b.addEventListener('click', () => {
            filos.splice(Number(b.dataset.quitar), 1);
            pintar();
          })
        );
      };
      input.addEventListener('change', () => {
        filos = [...input.files].map((file) => ({ file, caption: '' }));
        input.value = ''; // para poder volver a elegir lo mismo
        pintar();
      });
    },
    onSubmit: (data, frm) => {
      if (!filos.length) {
        toast('Elige al menos una foto', 'error');
        return false;
      }
      const destino = data.eventId || inicial;
      const lote = filos.slice();
      const pendientes = frm.querySelector('#fotoArchivo');
      if (pendientes) pendientes.value = '';
      toast(`Guardando ${lote.length} foto${lote.length > 1 ? 's' : ''}…`);
      guardarLote(destino, lote);
      return true;
    },
  });
}

/** Comprime y guarda un lote de fotos, y las apunta al desayuno. */
async function guardarLote(eventId, lote) {
  const nuevos = [];
  for (const f of lote) {
    try {
      const id = store.uid();
      const full = await optimize(f.file, { max: 1600, quality: 0.82 });
      const thumb = full.width ? await makeThumb(f.file) : { blob: full.blob };
      await putPhoto(id, { full: full.blob, thumb: thumb.blob || full.blob });
      nuevos.push({
        id,
        caption: (f.caption || '').trim(),
        w: full.width,
        h: full.height,
        size: full.blob?.size || 0,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('No se pudo guardar una foto:', err);
    }
  }
  if (nuevos.length) {
    store.update((s) => {
      const ev = s.events.find((e) => e.id === eventId);
      if (ev) ev.photos = [...(ev.photos || []), ...nuevos];
    });
  }
  toast(
    nuevos.length ? `${nuevos.length} foto${nuevos.length > 1 ? 's' : ''} guardada${nuevos.length > 1 ? 's' : ''} ✅` : 'No se pudo leer ninguna foto',
    nuevos.length ? 'ok' : 'error'
  );
}

/** Miniaturas + subida + enlace a la galería, para la tarjeta del desayuno. */
export function openPhotoManager(eventId) {
  const ev = store.state.events.find((e) => e.id === eventId);
  if (!ev) return;
  const fotos = ev.photos || [];

  openModal({
    title: `🖼 Fotos · ${ev.title}`,
    body: `
      <p class="modal__intro">
        Sube las fotos de este desayuno y ponles el pie de qué hizo cada equipo.
        Desde la galería armas el <strong>collage para redes</strong>.
      </p>
      <div class="photo-rows" id="gestorMini"></div>
      <div class="photo-pick">
        <button type="button" class="btn btn--secondary" id="gestorSubir">📤 Subir fotos</button>
        <a class="btn btn--ghost" href="#/fotos?ev=${ev.id}" id="gestorIr">🖼 Abrir galería y collage</a>
      </div>`,
    saveLabel: 'Listo',
    onMount: (frm) => {
      const box = frm.querySelector('#gestorMini');
      if (!fotos.length) {
        box.innerHTML = '<p class="muted">Todavía no hay fotos en este desayuno.</p>';
      } else {
        getPhotos(fotos.map((p) => p.id)).then((map) => {
          box.innerHTML = fotos
            .map((p) => {
              const reg = map.get(p.id);
            const url = reg ? objectUrl(reg.thumb || reg.full) : '';
              if (url) urls.push(url);
              return `
              <div class="photo-row photo-row--mini">
                <span class="photo-row__thumb ${url ? '' : 'is-missing'}" ${url ? `style="background-image:url('${url}')"` : ''}>${url ? '' : '🖼'}</span>
                <span class="photo-row__name">${p.caption ? esc(p.caption) : '<span class="muted">Sin pie</span>'}</span>
                <button type="button" class="icon-btn" data-abrir title="Descargar">⬇️</button>
              </div>`;
            })
            .join('');
          box.querySelectorAll('.photo-row--mini').forEach((row, i) => {
            row.querySelector('[data-abrir]')?.addEventListener('click', () => descargarFoto(fotos[i].id));
          });
        });
      }
      frm.querySelector('#gestorSubir')?.addEventListener('click', () => openUpload(eventId));
      // Al cerrar con “Ir a la galería” el modal se va solo (cambio de hash).
    },
    onSubmit: () => true,
  });
}
