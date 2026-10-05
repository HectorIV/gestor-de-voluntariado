/* Helpers de UI: escape, toasts, modales y utilidades de formulario. */

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer;
export function toast(message, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.dataset.type = type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

export function confirmDialog(message) {
  return window.confirm(message);
}

export function formatDate(iso) {
  if (!iso) return 'Sin fecha';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** 2026-10-01 → 01/10/2026 */
export function formatDateShort(iso) {
  if (!iso) return 'sin fecha';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Copia texto al portapapeles (con respaldo para contextos no seguros). */
export async function copyText(text, okMessage = 'Copiado al portapapeles ✅') {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  };

  try {
    let done = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        done = true;
      } catch {
        done = fallback();
      }
    } else {
      done = fallback();
    }
    if (!done) throw new Error('no se pudo copiar');
    toast(okMessage);
    return true;
  } catch (err) {
    console.error('No se pudo copiar:', err);
    toast('No se pudo copiar 😕 (prueba a seleccionar y copiar a mano)', 'error');
    return false;
  }
}

export function formatNumber(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return '0';
  return num.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

/* ---------- Modal ---------- */

const backdrop = () => document.getElementById('modalBackdrop');
const form = () => document.getElementById('modalForm');

let currentResolve = null;
let currentCleanup = null;

/**
 * Abre un modal con un formulario.
 * @param {{title:string, body:string, saveLabel?:string, onSubmit:(data:FormData, form:HTMLFormElement)=>boolean|void, onMount?:(form:HTMLFormElement)=>void}} options
 * @returns {Promise<boolean>} true si se guardó
 */
export function openModal({ title, body, saveLabel = 'Guardar', onSubmit, onMount }) {
  // Si ya había otro modal abierto, ciérralo antes de montar este: si no, los
  // listeners del anterior seguirían activos y el guardado se haría dos veces.
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
    const prev = currentResolve;
    currentResolve = null;
    if (prev) prev(false);
    backdrop().hidden = true;
    document.body.classList.remove('no-scroll');
  }

  const bd = backdrop();
  const frm = form();
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalSave').textContent = saveLabel;
  frm.innerHTML = body;
  bd.hidden = false;
  document.body.classList.add('no-scroll');
  if (typeof onMount === 'function') onMount(frm);

  const firstInput = frm.querySelector('input:not([type=hidden]), select, textarea');
  // preventScroll: al abrir no debe mover la página (en móvil se notaba como un salto).
  if (firstInput) setTimeout(() => firstInput.focus({ preventScroll: true }), 50);

  return new Promise((resolve) => {
    currentResolve = resolve;

    const close = (saved) => {
      bd.hidden = true;
      document.body.classList.remove('no-scroll');
      frm.innerHTML = '';
      cleanup();
      currentCleanup = null;
      if (currentResolve) currentResolve(saved);
      currentResolve = null;
    };

    function handleSubmit(event) {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(frm).entries());
      const result = onSubmit ? onSubmit(data, frm) : true;
      if (result !== false) close(true);
    }

    function handleBackdropClick(event) {
      if (event.target === bd) close(false);
    }

    function handleKey(event) {
      if (event.key === 'Escape') close(false);
    }

    function cleanup() {
      frm.removeEventListener('submit', handleSubmit);
      bd.removeEventListener('click', handleBackdropClick);
      document.removeEventListener('keydown', handleKey);
      document.getElementById('modalClose').onclick = null;
      document.getElementById('modalCancel').onclick = null;
    }

    currentCleanup = cleanup;
    frm.addEventListener('submit', handleSubmit);
    bd.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKey);
    document.getElementById('modalClose').onclick = () => close(false);
    document.getElementById('modalCancel').onclick = () => close(false);
  });
}

/* ---------- Formularios ---------- */

export function field({ label, name, type = 'text', value = '', required = false, placeholder = '', min, options, hint, className = '', list }) {
  let control;
  if (type === 'select') {
    const opts = (options || [])
      .map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const text = typeof o === 'string' ? o : o.label;
        const selected = String(val) === String(value) ? 'selected' : '';
        return `<option value="${esc(val)}" ${selected}>${esc(text)}</option>`;
      })
      .join('');
    control = `<select class="input" id="f-${name}" name="${name}">${opts}</select>`;
  } else if (type === 'textarea') {
    control = `<textarea class="input" id="f-${name}" name="${name}" rows="3" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  } else {
    const minAttr = min !== undefined && min !== null ? `min="${esc(min)}"` : '';
    const listAttr = list ? `list="${esc(list)}"` : '';
    control = `<input class="input" id="f-${name}" name="${name}" type="${type}" value="${esc(value)}"
      placeholder="${esc(placeholder)}" ${minAttr} ${listAttr} ${required ? 'required' : ''} />`;
  }

  return `
    <label class="field ${className}">
      <span class="field__label">${esc(label)}${required ? ' <b>*</b>' : ''}</span>
      ${control}
      ${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}
    </label>`;
}

export function grid(cssClass, inner) {
  return `<div class="${cssClass}">${inner}</div>`;
}

/* ---------- Redibujado sin molestar al usuario ---------- */

function captureFocus() {
  const el = document.activeElement;
  const view = document.getElementById('view');
  if (!el || !view || !view.contains(el)) return null; // el foco está fuera de la vista (nav, modal…)
  const info = { id: el.id || '', name: el.name || '', value: typeof el.value === 'string' ? el.value : '', caret: null };
  try {
    info.caret = typeof el.selectionStart === 'number' ? el.selectionStart : null;
  } catch {
    info.caret = null; // tipos de input sin selección (número, correo…)
  }
  return info;
}

function restoreFocus(info) {
  let el = info.id ? document.getElementById(info.id) : null;
  if (!el && info.name) {
    el = [...document.querySelectorAll('input, select, textarea')].find((x) => x.name === info.name && x.value === info.value) || null;
  }
  if (!el) return;
  el.focus({ preventScroll: true });
  if (info.caret != null && typeof el.setSelectionRange === 'function') {
    try {
      el.setSelectionRange(info.caret, info.caret);
    } catch {
      /* tipos sin soporte de cursor */
    }
  }
}

/**
 * Redibuja la vista sin pisar lo que está haciendo el usuario: conserva la
 * posición de scroll y el foco (y el cursor) del campo activo. Sin esto, en
 * móvil cada toque que actualizaba datos mandaba la página al principio y
 * cerraba el teclado.
 * @param {() => void} fn rutina que vuelve a pintar la vista
 */
export function rerender(fn) {
  const scrollY = window.scrollY;
  const focus = captureFocus();
  fn();
  if (focus) restoreFocus(focus);
  window.scrollTo({ top: scrollY });
}

export function emptyState({ icon = '✨', title, text, action = '' }) {
  return `
    <div class="empty">
      <div class="empty__icon">${icon}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${action}
    </div>`;
}

export function statCard({ label, value, hint = '', tone = '' }) {
  return `
    <div class="stat ${tone ? 'stat--' + tone : ''}">
      <span class="stat__label">${esc(label)}</span>
      <strong class="stat__value">${esc(value)}</strong>
      ${hint ? `<span class="stat__hint">${esc(hint)}</span>` : ''}
    </div>`;
}
