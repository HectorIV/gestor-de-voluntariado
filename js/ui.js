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

export function formatNumber(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return '0';
  return num.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

/* ---------- Modal ---------- */

const backdrop = () => document.getElementById('modalBackdrop');
const form = () => document.getElementById('modalForm');

let currentResolve = null;

/**
 * Abre un modal con un formulario.
 * @param {{title:string, body:string, saveLabel?:string, onSubmit:(data:FormData, form:HTMLFormElement)=>boolean|void, onMount?:(form:HTMLFormElement)=>void}} options
 * @returns {Promise<boolean>} true si se guardó
 */
export function openModal({ title, body, saveLabel = 'Guardar', onSubmit, onMount }) {
  const bd = backdrop();
  const frm = form();
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalSave').textContent = saveLabel;
  frm.innerHTML = body;
  bd.hidden = false;
  document.body.classList.add('no-scroll');
  if (typeof onMount === 'function') onMount(frm);

  const firstInput = frm.querySelector('input:not([type=hidden]), select, textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 50);

  return new Promise((resolve) => {
    currentResolve = resolve;

    const close = (saved) => {
      bd.hidden = true;
      document.body.classList.remove('no-scroll');
      frm.innerHTML = '';
      cleanup();
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

    frm.addEventListener('submit', handleSubmit);
    bd.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKey);
    document.getElementById('modalClose').onclick = () => close(false);
    document.getElementById('modalCancel').onclick = () => close(false);
  });
}

/* ---------- Formularios ---------- */

export function field({ label, name, type = 'text', value = '', required = false, placeholder = '', min, options, hint, className = '' }) {
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
    control = `<input class="input" id="f-${name}" name="${name}" type="${type}" value="${esc(value)}"
      placeholder="${esc(placeholder)}" ${minAttr} ${required ? 'required' : ''} />`;
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
