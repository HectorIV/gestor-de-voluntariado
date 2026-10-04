import { store, lowStockItems, isMissing } from '../store.js';
import { esc, toast, openModal, field, grid, emptyState, statCard, formatNumber, copyText } from '../ui.js';

/* ---------- Helpers ---------- */

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

export function renderCompras(root) {
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
      if (again && document.activeElement !== again) again.focus();
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
}

async function openShopForm() {
  const { categories } = store.state;
  const body = grid(
    'form-grid',
    field({ label: 'Artículo', name: 'name', required: true, placeholder: 'Ej. Hielo, carbón, pan…' }) +
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
        s.shopping.push({
          id: store.uid(),
          name,
          qty: Math.max(0, Number(data.qty) || 0),
          unit: (data.unit || '').trim(),
          category: data.category,
          note: (data.note || '').trim(),
          bought: false,
        });
      });
      toast('Añadido a la lista 🛒');
      return true;
    },
  });

  if (saved) renderCompras(document.getElementById('view'));
}
