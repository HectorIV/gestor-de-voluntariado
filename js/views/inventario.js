import { store, productById, lowStockItems, productStatus, setFlag, setQty } from '../store.js';
import { esc, toast, openModal, field, grid, emptyState, statCard, formatNumber, confirmDialog, copyText, rerender } from '../ui.js';
import { SUGGESTED, suggestedByName } from '../sugerencias.js';

let search = '';
let categoryFilter = 'todas';

export function renderInventario(root) {
  // Conserva scroll y foco (importante en móvil: al tocar un campo no debe saltar al tope).
  rerender(() => drawInventario(root));
}

function drawInventario(root) {
  const { inventory, categories } = store.state;
  const low = lowStockItems();

  const q = search.trim().toLowerCase();
  const filtered = inventory.filter((p) => {
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q);
    const matchC = categoryFilter === 'todas' || p.category === categoryFilter;
    return matchQ && matchC;
  });

  root.innerHTML = `
    <div class="stats">
      ${statCard({ label: 'Productos', value: String(inventory.length), hint: 'en el inventario' })}
      ${statCard({ label: 'Stock bajo', value: String(low.length), hint: 'necesitan reposición', tone: low.length ? 'danger' : '' })}
      ${statCard({ label: 'Categorías', value: String(categories.length), hint: 'definidas' })}
    </div>

    <div class="toolbar">
      <input class="input input--search" id="invSearch" type="search" placeholder="🔍 Buscar producto…" value="${esc(search)}" />
      <select class="input input--filter" id="invFilter" aria-label="Filtrar por categoría">
        <option value="todas">Todas las categorías</option>
        ${categories.map((c) => `<option value="${esc(c)}" ${c === categoryFilter ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <button class="btn btn--secondary" id="addTypical">🧺 Lista típica</button>
      <div class="toolbar__copy">
        <a class="btn btn--ghost btn--sm" href="#/compras" title="Ir a la lista de compras">🛒 Compras</a>
        <button class="btn btn--ghost btn--sm" id="copyInv" title="Copiar todo el inventario como texto">📋 Copiar lista</button>
        <button class="btn btn--ghost btn--sm" id="copyMissing" title="Copiar solo lo que hay que comprar">🔴 Faltantes</button>
      </div>
      <button class="btn btn--primary" id="addProduct">＋ Añadir producto</button>
    </div>

    ${filtered.length === 0
      ? emptyState({
          icon: '📦',
          title: inventory.length ? 'Sin resultados' : 'El inventario está vacío',
          text: inventory.length
            ? 'Prueba con otra búsqueda o categoría.'
            : 'Añade comida, servilletas, guantes, cafeteras… o empieza con la lista de productos típicos de los desayunos.',
          action: inventory.length
            ? ''
            : `<div class="empty__actions">
                <button class="btn btn--secondary" id="addTypicalEmpty">🧺 Lista típica</button>
                <button class="btn btn--primary" id="addProductEmpty">＋ Añadir producto</button>
              </div>`,
        })
      : `<div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Categoría</th>
                <th scope="col" class="num">Cantidad</th>
                <th scope="col" class="num">Mínimo</th>
                <th scope="col">Estado</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(rowHtml).join('')}
            </tbody>
          </table>
        </div>`}
  `;

  const searchInput = root.querySelector('#invSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      search = e.target.value;
      renderInventario(root);
      const el = root.querySelector('#invSearch');
      el.focus({ preventScroll: true }); // sin mover la página (en móvil se notaba como un salto)
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  const filter = root.querySelector('#invFilter');
  if (filter) {
    filter.addEventListener('change', (e) => {
      categoryFilter = e.target.value;
      renderInventario(root);
    });
  }

  root.querySelector('#addProduct')?.addEventListener('click', () => openProductForm());
  root.querySelector('#addProductEmpty')?.addEventListener('click', () => openProductForm());
  root.querySelector('#addTypical')?.addEventListener('click', () => openTypicalList());
  root.querySelector('#addTypicalEmpty')?.addEventListener('click', () => openTypicalList());
  root.querySelector('#copyInv')?.addEventListener('click', () => copyText(inventoryText(false)));
  root.querySelector('#copyMissing')?.addEventListener('click', () => {
    const text = inventoryText(true);
    if (!text) return toast('No hay nada pendiente de comprar 🎉', 'ok');
    copyText(text, 'Lista de faltantes copiada ✅');
  });

  root.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openProductForm(btn.dataset.edit))
  );
  root.querySelectorAll('[data-delete]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = productById(btn.dataset.delete);
      if (!p) return;
      if (confirmDialog(`¿Eliminar "${p.name}" del inventario?`)) {
        store.update((s) => {
          s.inventory = s.inventory.filter((x) => x.id !== p.id);
        });
        toast('Producto eliminado');
        renderInventario(root);
      }
    })
  );
  root.querySelectorAll('[data-adjust]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.adjust);
      store.update((s) => {
        const p = s.inventory.find((x) => x.id === btn.dataset.id);
        if (p) setQty(p, Number(p.qty) + delta);
      });
      renderInventario(root);
    })
  );
  root.querySelectorAll('[data-flag]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = productById(btn.dataset.flag);
      if (!p) return;
      const next = productStatus(p) === 'falta' ? 'completo' : 'falta';
      store.update(() => setFlag(p, next));
      toast(next === 'completo' ? `"${p.name}": marcado como completo ✅` : `"${p.name}": marcado como falta ⚠️`);
      renderInventario(root);
    })
  );
  root.querySelectorAll('[data-unflag]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = productById(btn.dataset.unflag);
      if (!p) return;
      store.update(() => setFlag(p, null));
      toast(`"${p.name}": marca manual quitada`);
      renderInventario(root);
    })
  );
}

function rowHtml(p) {
  const missing = productStatus(p) === 'falta';
  const manual = p.flag === 'falta' || p.flag === 'completo';
  const badge = missing
    ? '<span class="badge badge--danger">Reponer</span>'
    : '<span class="badge badge--ok">Completo</span>';
  const toggle = `
    <button class="icon-btn" data-flag="${p.id}" title="${missing ? 'Marcar como completo' : 'Marcar como falta'}">${missing ? '✅' : '⚠️'}</button>`;
  const reset = manual
    ? `<button class="icon-btn" data-unflag="${p.id}" title="Quitar marca manual (volver al automático)">↩️</button>`
    : '';
  return `
    <tr class="${missing ? 'row-low' : ''}">
      <td>
        <div class="cell-title">${esc(p.name)}</div>
        ${p.notes ? `<div class="cell-sub">${esc(p.notes)}</div>` : ''}
      </td>
      <td><span class="tag">${esc(p.category)}</span></td>
      <td class="num">
        <div class="qty">
          <button class="qty__btn" data-adjust="-1" data-id="${p.id}" title="Restar 1">−</button>
          <strong>${formatNumber(p.qty)} <small>${esc(p.unit || 'u.')}</small></strong>
          <button class="qty__btn" data-adjust="1" data-id="${p.id}" title="Sumar 1">＋</button>
        </div>
      </td>
      <td class="num">${formatNumber(p.min || 0)}</td>
      <td>${badge}${manual ? '<div class="cell-sub">a mano</div>' : ''}</td>
      <td class="row-actions">
        ${toggle}${reset}
        <button class="icon-btn" data-edit="${p.id}" title="Editar">✏️</button>
        <button class="icon-btn" data-delete="${p.id}" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
}

async function openProductForm(id) {
  const { categories } = store.state;
  const existing = id ? productById(id) : null;

  const body =
    grid(
      'form-grid',
      field({
        label: 'Nombre del producto',
        name: 'name',
        required: true,
        value: existing?.name || '',
        placeholder: 'Ej. Servilletas de papel',
        list: 'sugerenciasNombre',
      }) +
        field({ label: 'Categoría', name: 'category', type: 'select', value: existing?.category || categories[0], options: categories }) +
        field({ label: 'Cantidad actual', name: 'qty', type: 'number', min: 0, required: true, value: existing ? existing.qty : 0 }) +
        field({ label: 'Unidad', name: 'unit', placeholder: 'uds., paquetes, litros…', value: existing?.unit || 'uds.', hint: 'Cómo se cuenta' }) +
        field({ label: 'Cantidad mínima', name: 'min', type: 'number', min: 0, value: existing ? existing.min || 0 : 0, hint: 'Al llegar exactamente a este nivel ya cuenta como completo; por debajo se marca "Reponer"' }) +
        field({ label: 'Notas', name: 'notes', placeholder: 'Marca, tamaño, dónde se guarda…', value: existing?.notes || '' })
    ) +
    `<datalist id="sugerenciasNombre">${SUGGESTED.map((s) => `<option value="${esc(s.name)}"></option>`).join('')}</datalist>`;

  const saved = await openModal({
    title: existing ? 'Editar producto' : 'Añadir producto',
    body,
    onMount: (frm) => {
      if (existing) return;
      const nameInput = frm.querySelector('#f-name');
      const autofill = () => {
        const s = suggestedByName(nameInput.value);
        if (!s) return;
        if (s.category) frm.querySelector('#f-category').value = s.category;
        frm.querySelector('#f-unit').value = s.unit;
        frm.querySelector('#f-min').value = s.min;
      };
      nameInput.addEventListener('change', autofill);
    },
    onSubmit: (data) => {
      const name = (data.name || '').trim();
      if (!name) {
        toast('Escribe un nombre para el producto', 'error');
        return false;
      }
      store.update((s) => {
        if (existing) {
          const p = s.inventory.find((x) => x.id === existing.id);
          Object.assign(p, {
            name,
            category: data.category,
            unit: (data.unit || 'uds.').trim(),
            min: Math.max(0, Number(data.min) || 0),
            notes: (data.notes || '').trim(),
          });
          setQty(p, data.qty);
        } else {
          s.inventory.push({
            id: store.uid(),
            name,
            category: data.category,
            qty: Math.max(0, Number(data.qty) || 0),
            unit: (data.unit || 'uds.').trim(),
            min: Math.max(0, Number(data.min) || 0),
            notes: (data.notes || '').trim(),
            flag: null,
          });
        }
      });
      toast(existing ? 'Producto actualizado' : 'Producto añadido');
      return true;
    },
  });

  if (saved) renderInventario(document.getElementById('view'));
}

/* ---------- Copiar como texto (WhatsApp, etc.) ---------- */

function inventoryText(onlyMissing) {
  const { inventory, categories } = store.state;
  const today = new Date().toLocaleDateString('es-ES');
  const lines = [];

  if (onlyMissing) {
    const low = lowStockItems();
    if (!low.length) return '';
    lines.push(`🔴 *FALTAN COMPRAR* (${today})`);
    low.forEach((p) => {
      lines.push(`• ${p.name}: hay ${formatNumber(p.qty)} de ${formatNumber(p.min)} ${p.unit || 'u.'}`);
    });
    return lines.join('\n');
  }

  lines.push(`📦 *INVENTARIO · Desayunos Hospital del Niño* (${today})`);
  categories.forEach((c) => {
    const items = inventory.filter((p) => p.category === c);
    if (!items.length) return;
    lines.push('');
    lines.push(`*${c.toUpperCase()}*`);
    items.forEach((p) => {
      const falta = productStatus(p) === 'falta' ? '  ⚠️ reponer' : '';
      lines.push(`• ${p.name}: ${formatNumber(p.qty)} ${p.unit || 'u.'}${falta}`);
    });
  });
  return lines.join('\n');
}

/* ---------- Lista típica (alta masiva de productos habituales) ---------- */

async function openTypicalList() {
  const { inventory, categories } = store.state;
  const lower = new Set(inventory.map((p) => p.name.trim().toLowerCase()));
  const groups = categories.filter((c) => SUGGESTED.some((s) => s.category === c));

  const body = `
    <p class="modal__intro">
      Marca lo que quieras añadir: jugo, café, té, pan de molde, queso, mantequilla, jamón, galletas,
      ziplos, servilletas y el resto de lo habitual. Los que ya tienes en el inventario aparecen
      como <strong>ya está</strong>. Se guardan con cantidad <strong>0</strong> y su mínimo sugerido,
      así los verás en “Reponer” hasta que anotes lo que tengas.
    </p>
    <div class="modal__quick">
      <button type="button" class="btn btn--ghost btn--sm" data-check="all">Marcar todas</button>
      <button type="button" class="btn btn--ghost btn--sm" data-check="none">Ninguna</button>
      <span class="modal__count" id="sugCount"></span>
    </div>
    ${groups
      .map((c) => {
        const items = SUGGESTED.filter((s) => s.category === c);
        return `
        <fieldset class="team-group">
          <legend>${esc(c)}</legend>
          ${items
            .map((s) => {
              const exists = lower.has(s.name.trim().toLowerCase());
              return `
              <label class="check ${exists ? 'is-off' : ''}">
                <input type="checkbox" name="sug" value="${esc(s.name)}" ${exists ? 'disabled' : 'checked'} />
                <span class="check__name">${esc(s.name)}</span>
                <span class="check__meta">${exists ? '<span class="tag">ya está</span>' : `mín. ${formatNumber(s.min)} ${esc(s.unit)}`}</span>
              </label>`;
            })
            .join('')}
        </fieldset>`;
      })
      .join('')}`;

  const saved = await openModal({
    title: 'Lista típica de productos',
    body,
    saveLabel: 'Añadir seleccionados',
    onMount: (frm) => {
      const counter = frm.querySelector('#sugCount');
      const refresh = () => {
        const n = frm.querySelectorAll('input[name=sug]:checked').length;
        counter.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
      };
      frm.addEventListener('change', refresh);
      frm.querySelectorAll('[data-check]').forEach((b) =>
        b.addEventListener('click', () => {
          const check = b.dataset.check === 'all';
          frm.querySelectorAll('input[name=sug]:not(:disabled)').forEach((i) => {
            i.checked = check;
          });
          refresh();
        })
      );
      refresh();
    },
    onSubmit: (data, frm) => {
      const names = [...frm.querySelectorAll('input[name=sug]:checked')].map((i) => i.value);
      if (!names.length) {
        toast('Marca al menos un producto', 'error');
        return false;
      }
      store.update((s) => {
        names.forEach((name) => {
          const sug = suggestedByName(name);
          if (!sug) return;
          s.inventory.push({
            id: store.uid(),
            name: sug.name,
            category: sug.category,
            qty: 0,
            unit: sug.unit,
            min: sug.min,
            notes: '',
          });
        });
      });
      toast(`${names.length} producto${names.length === 1 ? '' : 's'} añadido${names.length === 1 ? '' : 's'}`);
      return true;
    },
  });

  if (saved) renderInventario(document.getElementById('view'));
}

export function inventoryAsOptions(selectedId = '') {
  return store.state.inventory.map((p) => ({ value: p.id, label: `${p.name} (${formatNumber(p.qty)} ${p.unit || 'u.'})` }));
}
