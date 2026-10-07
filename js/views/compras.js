import { store, lowStockItems, isMissing, recurringItems, noteRecurring } from '../store.js';
import { esc, toast, openModal, field, grid, emptyState, statCard, formatNumber, copyText, rerender } from '../ui.js';

/* ---------- Helpers ---------- */

/** Nombre en minúsculas de lo que ya está en la lista, para no ofrecerlo otra vez. */
function listedNames(items) {
  return new Set(items.map((i) => String(i.name || '').trim().toLowerCase()));
}

function pendingItems() {
  return lowStockItems().map((p) => ({
    key: p.id,
    source: 'inventario',
    name: p.name,
    category: p.category || 'Otros',
    meta: `hay ${formatNumber(p.qty)} de ${formatNumber(p.min)} ${p.unit || 'u.'}`,
    bought: !!p.bought,
  }));
}

function manualItems() {
  return (store.state.shopping || []).map((it) => ({
    key: it.id,
    source: 'manual',
    name: it.name,
    category: it.category || 'Otros',
    meta: it.qty ? `comprar ${formatNumber(it.qty)}${it.unit ? ' ' + it.unit : ''}` : '',
    note: it.note || '',
    bought: !!it.bought,
  }));
}

function shoppingText() {
  const items = [...pendingItems(), ...manualItems()];
  if (!items.length) return '';
  const today = new Date().toLocaleDateString('es-ES');
  const lines = [`🛒 *LISTA DE COMPRAS · Desayunos Hospital del Niño* (${today})`];
  const categories = [...new Set(items.map((i) => i.category))];
  categories.forEach((c) => {
    lines.push('');
    lines.push(`*${c.toUpperCase()}*`);
    items
      .filter((i) => i.category === c)
      .forEach((i) => {
        const mark = i.bought ? '☑' : '☐';
        lines.push(`${mark} ${i.name}${i.meta ? ` — ${i.meta}` : ''}`);
      });
  });
  return lines.join('\n');
}

/* ---------- Vista ---------- */

let quickSearch = '';

export function renderCompras(root) {
  // Conserva scroll y foco (importante en móvil: al tocar un campo no debe saltar al tope).
  rerender(() => drawCompras(root));
}

function drawCompras(root) {
  const items = [...pendingItems(), ...manualItems()];
  const pending = items.filter((i) => !i.bought);
  const done = items.filter((i) => i.bought);

  const categories = [...new Set(items.map((i) => i.category))];

  root.innerHTML = `
    <div class="stats">
      ${statCard({ label: 'Por comprar', value: String(pending.length), hint: pending.length ? 'en la lista' : 'nada pendiente', tone: pending.length ? 'danger' : '' })}
      ${statCard({ label: 'Ya comprado', value: String(done.length), hint: 'tachados' })}
      ${statCard({ label: 'Total', value: String(items.length), hint: 'artículos' })}
    </div>

    <div class="toolbar">
      <button class="btn btn--secondary" id="addShop">＋ Añadir a la lista</button>
      <div class="toolbar__copy">
        <button class="btn btn--ghost btn--sm" id="checkAll" title="Marcar todo como comprado">✅ Marcar todo</button>
        <button class="btn btn--ghost btn--sm" id="clearBought" title="Quitar lo ya comprado de la lista">🧹 Limpiar comprados</button>
        <button class="btn btn--ghost btn--sm" id="copyShop" title="Copiar la lista como texto">📋 Copiar lista</button>
      </div>
      <a class="btn btn--primary" href="#/inventario">📦 Ver inventario</a>
    </div>

    ${quickAddPanel(items)}

    ${items.length === 0
      ? emptyState({
          icon: '🎉',
          title: 'Nada que comprar',
          text: 'No hay productos por debajo del mínimo. Cuando falte algo aparecerá aquí automáticamente; también puedes añadir artículos sueltos a la lista.',
          action: `<div class="empty__actions">
              <button class="btn btn--secondary" id="addShopEmpty">＋ Añadir a la lista</button>
              <a class="btn btn--primary" href="#/inventario">Ir al inventario</a>
            </div>`,
        })
      : categories
          .map((c) => {
            const group = items.filter((i) => i.category === c);
            return `
            <fieldset class="team-group shop-group">
              <legend>${esc(c)}</legend>
              ${group
                .map(
                  (i) => `
                <div class="shop-item ${i.bought ? 'is-bought' : ''}">
                  <label class="check">
                    <input type="checkbox" data-buy="${i.key}" data-source="${i.source}" ${i.bought ? 'checked' : ''} />
                    <span class="check__name">
                      ${esc(i.name)}
                      ${i.note ? `<div class="cell-sub">${esc(i.note)}</div>` : ''}
                    </span>
                    <span class="check__meta">${i.meta ? esc(i.meta) : ''}</span>
                  </label>
                  ${
                    i.source === 'manual'
                      ? `<button class="icon-btn" data-del-shop="${i.key}" title="Quitar de la lista">🗑️</button>`
                      : ''
                  }
                </div>`
                )
                .join('')}
            </fieldset>`;
          })
          .join('')}
  `;

  root.querySelectorAll('[data-buy]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const bought = cb.checked;
      store.update((s) => {
        if (cb.dataset.source === 'inventario') {
          const p = s.inventory.find((x) => x.id === cb.dataset.buy);
          if (p) p.bought = bought;
        } else {
          const it = (s.shopping || []).find((x) => x.id === cb.dataset.buy);
          if (it) it.bought = bought;
        }
      });
      renderCompras(root);
      const again = root.querySelector(`[data-buy="${cb.dataset.buy}"]`);
      if (again && document.activeElement !== again) again.focus({ preventScroll: true });
    })
  );

  root.querySelectorAll('[data-del-shop]').forEach((btn) =>
    btn.addEventListener('click', () => {
      store.update((s) => {
        s.shopping = (s.shopping || []).filter((x) => x.id !== btn.dataset.delShop);
      });
      toast('Quitado de la lista');
      renderCompras(root);
    })
  );

  root.querySelector('#addShop')?.addEventListener('click', () => openShopForm());
  root.querySelector('#addShopEmpty')?.addEventListener('click', () => openShopForm());

  root.querySelector('#checkAll')?.addEventListener('click', () => {
    if (!items.length) return toast('La lista está vacía', 'error');
    store.update((s) => {
      s.inventory.forEach((p) => {
        if (isMissing(p)) p.bought = true;
      });
      (s.shopping || []).forEach((it) => (it.bought = true));
    });
    toast('Todo marcado como comprado ✅');
    renderCompras(root);
  });

  root.querySelector('#clearBought')?.addEventListener('click', () => {
    if (!done.length) return toast('No hay nada comprado todavía', 'error');
    store.update((s) => {
      s.inventory.forEach((p) => (p.bought = false));
      s.shopping = (s.shopping || []).filter((it) => !it.bought);
    });
    toast('Comprados limpiados 🧹');
    renderCompras(root);
  });

  root.querySelector('#copyShop')?.addEventListener('click', () => {
    const text = shoppingText();
    if (!text) return toast('La lista está vacía 🎉', 'ok');
    copyText(text, 'Lista de compras copiada ✅');
  });

  /* Añadir rápido: filtro y productos de un toque */
  root.querySelector('#quickSearch')?.addEventListener('input', (e) => {
    quickSearch = e.target.value;
    renderCompras(root);
    const el = root.querySelector('#quickSearch');
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  });

  root.querySelectorAll('[data-quick]').forEach((btn) =>
    btn.addEventListener('click', () => addFromQuick(btn.dataset.quick, btn.dataset.id, items, root))
  );
}

/* ---------- Añadir rápido (inventario + recurrentes) ---------- */

function chipInventory(p) {
  return `<button type="button" class="chip" data-quick="inv" data-id="${p.id}" title="Añadir a la lista">
      <span class="chip__name">${esc(p.name)}</span>
      <span class="chip__meta">${formatNumber(p.qty)} / ${formatNumber(p.min)} ${esc(p.unit || 'u.')}</span>
    </button>`;
}

function chipRecurring(r) {
  const times = Number(r.times) || 1;
  const stock = Number(r.qty) ? `${formatNumber(r.qty)} ${esc(r.unit || 'u.')}` : '';
  return `<button type="button" class="chip" data-quick="rec" data-id="${r.id}" title="Añadir a la lista">
      <span class="chip__name">${esc(r.name)}</span>
      <span class="chip__meta">${stock ? `${stock} · ` : ''}×${formatNumber(times)}</span>
    </button>`;
}

/** Tarjeta con lo que se puede añadir de un toque: productos del inventario y recurrentes. */
function quickAddPanel(items) {
  const { inventory } = store.state;
  const listed = listedNames(items);
  const q = quickSearch.trim().toLowerCase();
  const match = (name) => !q || String(name).toLowerCase().includes(q);

  const invChips = inventory.filter((p) => !listed.has(p.name.trim().toLowerCase()) && match(p.name));
  const inventoryNames = new Set(inventory.map((p) => p.name.trim().toLowerCase()));
  const recChips = recurringItems().filter(
    (r) =>
      !listed.has(String(r.name || '').trim().toLowerCase()) &&
      !inventoryNames.has(String(r.name || '').trim().toLowerCase()) &&
      match(r.name)
  );

  const nothing = q ? `Nada coincide con “${esc(quickSearch)}”.` : '';
  const invEmpty = nothing || 'Todo lo del inventario ya está en la lista 🎉';
  const recEmpty = nothing || 'Se van rellenando solos: añade artículos a mano y vuelven a aparecer aquí.';

  return `
    <div class="card quickadd">
      <div class="quickadd__head">
        <div>
          <h3>🔁 Añadir rápido</h3>
          <p class="muted">Toca un producto y entra en la lista con sus datos.</p>
        </div>
        <input class="input input--search" id="quickSearch" type="search" placeholder="🔍 Filtra productos…" value="${esc(
          quickSearch
        )}" />
      </div>

      <div class="quickadd__groups">
        <div class="quickadd__group">
          <span class="quickadd__label">Del inventario</span>
          <div class="chips">
            ${invChips.length ? invChips.map(chipInventory).join('') : `<p class="muted">${invEmpty}</p>`}
          </div>
        </div>

        <div class="quickadd__group">
          <span class="quickadd__label">Recurrentes</span>
          <div class="chips">
            ${recChips.length ? recChips.map(chipRecurring).join('') : `<p class="muted">${recEmpty}</p>`}
          </div>
        </div>
      </div>
    </div>`;
}

/** Añade a la lista un producto del inventario o uno recurrente, con un toque. */
function addFromQuick(kind, id, items, root) {
  let item;
  if (kind === 'inv') {
    const p = store.state.inventory.find((x) => x.id === id);
    if (!p) return;
    const falta = Math.max(0, Number(p.min || 0) - Number(p.qty || 0));
    item = {
      id: store.uid(),
      name: p.name,
      qty: falta || Number(p.min || 0) || 0, // lo que hace falta, o el mínimo si está completo
      unit: p.unit || '',
      category: p.category || 'Otros',
      note: 'del inventario',
      bought: false,
    };
  } else {
    const r = recurringItems().find((x) => x.id === id);
    if (!r) return;
    item = {
      id: store.uid(),
      name: r.name,
      qty: Math.max(0, Number(r.qty) || 0),
      unit: r.unit || '',
      category: r.category || 'Otros',
      note: '',
      bought: false,
    };
  }

  if (items.some((i) => String(i.name || '').trim().toLowerCase() === item.name.trim().toLowerCase())) {
    return toast('Ya está en la lista', 'error');
  }

  store.update((s) => {
    s.shopping = s.shopping || [];
    s.shopping.push(item);
    noteRecurring(s, item); // para que vuelva a salir en “Recurrentes”
  });
  toast(`${item.name} añadido a la lista 🛒`);
  renderCompras(root);
}

async function openShopForm() {
  const { categories, inventory } = store.state;

  // Nombres ya conocidos (recurrentes + inventario) para autocompletar mientras escribes
  const names = [...new Set([...recurringItems().map((r) => r.name), ...inventory.map((p) => p.name)])];
  const datalist = names.length
    ? `<datalist id="dl-shopNames">${names.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`
    : '';

  const body =
    datalist +
    grid(
      'form-grid',
      field({
        label: 'Artículo',
        name: 'name',
        required: true,
        placeholder: 'Ej. Hielo, carbón, pan…',
        list: names.length ? 'dl-shopNames' : '',
      }) +
        field({ label: 'Cantidad', name: 'qty', type: 'number', min: 0, placeholder: 'Opcional' }) +
        field({ label: 'Unidad', name: 'unit', placeholder: 'uds., paquetes, kilos…', value: 'uds.' }) +
        field({ label: 'Categoría', name: 'category', type: 'select', value: categories[0], options: categories }) +
        field({ label: 'Nota', name: 'note', placeholder: 'Marca, tienda, tamaño…' })
    );

  const saved = await openModal({
    title: 'Añadir a la lista de compras',
    body,
    saveLabel: 'Añadir',
    onSubmit: (data) => {
      const name = (data.name || '').trim();
      if (!name) {
        toast('Escribe un nombre para el artículo', 'error');
        return false;
      }
      store.update((s) => {
        s.shopping = s.shopping || [];
        const item = {
          id: store.uid(),
          name,
          qty: Math.max(0, Number(data.qty) || 0),
          unit: (data.unit || '').trim(),
          category: data.category,
          note: (data.note || '').trim(),
          bought: false,
        };
        s.shopping.push(item);
        noteRecurring(s, item); // queda en “Recurrentes” para añadirlo rápido la próxima vez
      });
      toast('Añadido a la lista 🛒');
      return true;
    },
  });

  if (saved) renderCompras(document.getElementById('view'));
}
