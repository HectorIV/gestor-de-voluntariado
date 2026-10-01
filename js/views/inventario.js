import { store, productById, lowStockItems } from '../store.js';
import { esc, toast, openModal, field, grid, emptyState, statCard, formatNumber, confirmDialog } from '../ui.js';

let search = '';
let categoryFilter = 'todas';

export function renderInventario(root) {
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
      <button class="btn btn--primary" id="addProduct">＋ Añadir producto</button>
    </div>

    ${filtered.length === 0
      ? emptyState({
          icon: '📦',
          title: inventory.length ? 'Sin resultados' : 'El inventario está vacío',
          text: inventory.length
            ? 'Prueba con otra búsqueda o categoría.'
            : 'Añade comida, servilletas, guantes, cafeteras… todo lo que necesite el desayuno.',
          action: inventory.length ? '' : '<button class="btn btn--primary" id="addProductEmpty">＋ Añadir producto</button>',
        })
      : `<div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th class="num">Cantidad</th>
                <th class="num">Mínimo</th>
                <th>Estado</th>
                <th></th>
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
      el.focus();
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
        if (p) p.qty = Math.max(0, Number(p.qty) + delta);
      });
      renderInventario(root);
    })
  );
}

function rowHtml(p) {
  const lowStock = Number(p.qty) <= Number(p.min || 0);
  return `
    <tr class="${lowStock ? 'row-low' : ''}">
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
      <td>${lowStock ? '<span class="badge badge--danger">Reponer</span>' : '<span class="badge badge--ok">OK</span>'}</td>
      <td class="row-actions">
        <button class="icon-btn" data-edit="${p.id}" title="Editar">✏️</button>
        <button class="icon-btn" data-delete="${p.id}" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
}

async function openProductForm(id) {
  const { categories } = store.state;
  const existing = id ? productById(id) : null;

  const body = grid(
    'form-grid',
    field({ label: 'Nombre del producto', name: 'name', required: true, value: existing?.name || '', placeholder: 'Ej. Servilletas de papel' }) +
      field({ label: 'Categoría', name: 'category', type: 'select', value: existing?.category || categories[0], options: categories }) +
      field({ label: 'Cantidad actual', name: 'qty', type: 'number', min: 0, required: true, value: existing ? existing.qty : 0 }) +
      field({ label: 'Unidad', name: 'unit', placeholder: 'uds., paquetes, litros…', value: existing?.unit || 'uds.', hint: 'Cómo se cuenta' }) +
      field({ label: 'Cantidad mínima', name: 'min', type: 'number', min: 0, value: existing ? existing.min || 0 : 0, hint: 'Se marcará como "Reponer" al llegar a este nivel' }) +
      field({ label: 'Notas', name: 'notes', placeholder: 'Marca, tamaño, dónde se guarda…', value: existing?.notes || '' })
  );

  const saved = await openModal({
    title: existing ? 'Editar producto' : 'Añadir producto',
    body,
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
            qty: Math.max(0, Number(data.qty) || 0),
            unit: (data.unit || 'uds.').trim(),
            min: Math.max(0, Number(data.min) || 0),
            notes: (data.notes || '').trim(),
          });
        } else {
          s.inventory.push({
            id: store.uid(),
            name,
            category: data.category,
            qty: Math.max(0, Number(data.qty) || 0),
            unit: (data.unit || 'uds.').trim(),
            min: Math.max(0, Number(data.min) || 0),
            notes: (data.notes || '').trim(),
          });
        }
      });
      toast(existing ? 'Producto actualizado' : 'Producto añadido');
      return true;
    },
  });

  if (saved) renderInventario(document.getElementById('view'));
}

export function inventoryAsOptions(selectedId = '') {
  return store.state.inventory.map((p) => ({ value: p.id, label: `${p.name} (${formatNumber(p.qty)} ${p.unit || 'u.'})` }));
}
