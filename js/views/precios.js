/* Precios y presupuesto.

   Aquí se guarda a cuánto está cada producto (normalmente en El Machetazo)
   para poder estimar si un desayuno se pasa del presupuesto. Los precios se
   cruzan con el inventario por nombre parecido, así que no hay que elegir
   el producto de una lista: se escribe y ya.

   Tres formas de precio:
     - Por unidad: "Leche 1L" → $1.25 por litro
     - Por peso:   "Manzanas" → $2.50 por kg
     - Por tramos: "Manzanas" → 1kg $2.50 · 5kg $2.20 · 10kg $2.00
   Con tramos, al calcular se usa el precio de la cantidad más alta que se
   alcance (necesitas 7 kg → precio de 5 kg).
*/

import { store } from '../store.js';
import { esc, toast, openModal, field, grid, emptyState, statCard, formatDate, confirmDialog, rerender } from '../ui.js';
import {
  normalize,
  findPrice,
  estimateEvent,
  desviacionMedia,
  savePrice,
  deletePrice,
  pricesToCsv,
  estimateText,
  stores,
} from '../prices.js';
import { downloadBlob } from '../collage.js';

const UNITS = ['u', 'kg', 'g', 'L', 'ml', 'lb', 'paquete', 'docena', 'caja', 'bolsa'];

let search = '';
let editingId = null;
/* Vista de captura: resultados pendientes de guardar. */
let capturaPendiente = [];

export function renderPrecios(root) {
  rerender(() => drawPrecios(root));
}

/* ---------- Pintar ---------- */

function drawPrecios(root) {
  const { prices, inventory, events } = store.state;
  const inventario = inventory;

  const filtered = search
    ? prices.filter((p) => {
        const needle = normalize(search);
        return normalize(p.productName).includes(needle) || normalize(p.store).includes(needle);
      })
    : prices;

  const conPrecio = prices.length;
  const conDesglose = prices.filter((p) => p.priceType === 'tiered').length;

  const proximos = events
    .filter((e) => e.status !== 'realizado' && e.status !== 'cancelado' && (e.items || []).length)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  root.innerHTML = `
    <div class="stats">
      ${statCard({ label: 'Con precio', value: String(conPrecio), hint: conPrecio ? 'de tu lista' : 'aún ninguno', tone: conPrecio ? 'primary' : '' })}
      ${statCard({ label: 'Por tramos', value: String(conDesglose), hint: conDesglose ? 'precio por cantidad' : 'ninguno todavía' })}
      ${statCard({ label: 'Productos', value: String(inventario.length), hint: 'en el inventario' })}
      ${statCard({ label: 'Desayunos', value: String(proximos.length), hint: 'por presupuestar' })}
    </div>

    <div class="toolbar">
      <input class="input input--search" id="precioBuscar" type="search" placeholder="🔍 Buscar precio…" value="${esc(search)}" />
      <button class="btn btn--primary" id="addPrecio">＋ Añadir precio</button>
      <button class="btn btn--ghost" id="capturarPrecios">📥 Capturar varios</button>
      <button class="btn btn--ghost" id="exportarCsv" ${conPrecio ? '' : 'disabled'}>📤 Exportar CSV</button>
    </div>

    ${alertaDesviacion()}

    ${
      proximos.length
        ? `<div class="panel">
            <div class="panel__head">
              <div>
                <h2>Presupuesto por desayuno</h2>
                <p>Estimación en vivo con los precios guardados</p>
              </div>
              <a class="btn btn--ghost btn--sm" href="#/desayunos">🥐 Ir a desayunos</a>
            </div>
            ${proximos
              .slice(0, 6)
              .map((ev) => budgetBlock(ev))
              .join('')}
          </div>`
        : ''
    }

    ${
      filtered.length
        ? `<div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Precio</th>
                  <th scope="col">Tienda</th>
                  <th scope="col">Desde</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(priceRow).join('')}
              </tbody>
            </table>
          </div>`
        : emptyState({
            icon: '💲',
            title: search ? 'Sin resultados' : 'Todavía no hay precios',
            text: search
              ? 'Prueba con otro nombre.'
              : 'Añade el precio de un producto y la app estimará sola si un desayuno cabe en el presupuesto.',
            action: search ? '' : '<button class="btn btn--primary" id="addPrecioVacio">＋ Añadir precio</button>',
          })
    }
  `;

  root.querySelector('#precioBuscar')?.addEventListener('input', (e) => {
    search = e.target.value;
    renderPrecios(root);
    const el = root.querySelector('#precioBuscar');
    el.focus({ preventScroll: true });
    el.setSelectionRange(search.length, search.length);
  });
  root.querySelector('#addPrecio')?.addEventListener('click', () => openPriceForm(null));
  root.querySelector('#addPrecioVacio')?.addEventListener('click', () => openPriceForm(null));
  root.querySelector('#capturarPrecios')?.addEventListener('click', () => openCapture());
  root.querySelector('#exportarCsv')?.addEventListener('click', () => exportCsv());

  root.querySelectorAll('[data-edit-price]').forEach((b) =>
    b.addEventListener('click', () => openPriceForm(b.dataset.editPrice))
  );
  root.querySelectorAll('[data-del-price]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = store.state.prices.find((x) => x.id === b.dataset.delPrice);
      if (!p) return;
      if (!confirmDialog(`¿Quitar el precio de "${p.productName}"?`)) return;
      store.update((s) => {
        s.prices = deletePrice(s.prices, p.id);
      });
      toast('Precio eliminado');
      renderPrecios(root);
    })
  );
  root.querySelectorAll('[data-hist]').forEach((b) =>
    b.addEventListener('click', () => openHistory(b.dataset.hist))
  );
}

/* ---------- Piezas ---------- */

/**
 * Aviso cuando la media de gasto se separa de la media de presupuesto.
 * Se repite aquí (además de en Gráficas) porque es donde se está trabajando.
 */
function alertaDesviacion() {
  const d = desviacionMedia(store.state.events, store.state.prices, store.state.inventory);
  if (d.nivel === 'vacio' || d.nivel === 'ok') return '';
  const icono = d.arriba ? '📈' : '📉';
  const titulo = d.arriba ? 'Gastas más de lo presupuestado' : 'Gastas menos de lo presupuestado';
  return `
    <div class="alerta alerta--${d.nivel}" role="status">
      <span class="alerta__icon">${icono}</span>
      <div>
        <strong>${titulo}</strong>
        <p>${esc(d.mensaje)}</p>
        <a class="btn btn--ghost btn--sm" href="#/graficas">📊 Ver en gráficas</a>
      </div>
    </div>`;
}

/** Resumen de presupuesto de un desayuno (cálculo en vivo). */
function budgetBlock(ev) {
  const est = estimateEvent(ev, store.state.prices, store.state.inventory);
  const budget = Math.max(0, Number(ev.budget) || 0);
  const diff = budget - est.total;
  const pct = budget ? Math.min(100, Math.round((est.total / budget) * 100)) : 0;

  let tone = 'ok';
  let frase = `Te sobran $${diff.toFixed(2)}`;
  if (!budget) {
    tone = 'muted';
    frase = 'Sin presupuesto puesto';
  } else if (diff < 0) {
    tone = 'danger';
    frase = `Te faltan $${(-diff).toFixed(2)}`;
  } else if (pct >= 90) {
    tone = 'warn';
    frase = `Muy justo: sobran $${diff.toFixed(2)}`;
  }

  return `
    <div class="budget budget--${tone}">
      <div class="budget__head">
        <div>
          <strong>${esc(ev.title)}</strong>
          <span class="cell-sub">${formatDate(ev.date)} · ${est.items} producto${est.items === 1 ? '' : 's'}</span>
        </div>
        <span class="badge badge--${tone === 'danger' ? 'danger' : tone === 'warn' ? 'warn' : tone === 'muted' ? 'muted' : 'ok'}">${frase}</span>
      </div>
      ${
        budget
          ? `<div class="budget__bar">
              <div class="budget__fill" style="width:${pct}%"></div>
            </div>
            <div class="budget__nums">
              <span>Estimado <strong>$${est.total.toFixed(2)}</strong></span>
              <span>Presupuesto <strong>$${budget.toFixed(2)}</strong></span>
            </div>`
          : ''
      }
      ${
        est.missing.length
          ? `<p class="budget__missing">❓ Sin precio: ${est.missing.map(esc).join(', ')}</p>`
          : ''
      }
    </div>`;
}

function priceRow(p) {
  const tipo = p.priceType === 'tiered' ? 'Por tramos' : p.priceType === 'weight' ? 'Por peso' : 'Por unidad';
  const precio = p.priceType === 'tiered'
    ? p.tiers?.length
      ? `${p.tiers.length} tramo${p.tiers.length === 1 ? '' : 's'}`
      : '—'
    : `$${Number(p.price || 0).toFixed(2)}`;

  return `
    <tr>
      <td data-label="Producto">
        <div class="cell-title">${esc(p.productName)}</div>
        <span class="cell-sub">${tipo}${p.unit && p.unit !== 'u' ? ` · por ${esc(p.unit)}` : ''}${p.notes ? ` · ${esc(p.notes)}` : ''}</span>
      </td>
      <td data-label="Precio"><strong>${precio}</strong></td>
      <td data-label="Tienda">${esc(p.store || '—')}</td>
      <td data-label="Desde">
        ${p.date ? formatDate(p.date) : '—'}
        ${p.history?.length ? `<span class="cell-sub">${p.history.length} cambio${p.history.length === 1 ? '' : 's'}</span>` : ''}
      </td>
      <td class="row-actions">
        ${p.history?.length ? `<button class="icon-btn" data-hist="${p.id}" title="Ver historial">📈</button>` : ''}
        <button class="icon-btn" data-edit-price="${p.id}" title="Editar">✏️</button>
        <button class="icon-btn" data-del-price="${p.id}" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
}

/* ---------- Formulario de precio ---------- */

async function openPriceForm(id) {
  const existing = id ? store.state.prices.find((p) => p.id === id) : null;
  editingId = id || null;

  const { inventory } = store.state;
  const names = inventory.map((p) => p.name);
  const tierRows = existing?.tiers?.length ? existing.tiers.map((t) => ({ ...t })) : [{ qty: 1, price: 0 }];

  const body = `
    ${grid(
      'form-grid',
      field({ label: 'Producto', name: 'productName', required: true, value: existing?.productName || '', placeholder: 'Ej. Manzanas', list: 'preciosInventario' }) +
        field({
          label: 'Tipo de precio',
          name: 'priceType',
          type: 'select',
          value: existing?.priceType || 'unit',
          options: [
            { value: 'unit', label: 'Por unidad' },
            { value: 'weight', label: 'Por peso (kg, L…)' },
            { value: 'tiered', label: 'Por tramos (varía por cantidad)' },
          ],
        }) +
        field({ label: 'Precio', name: 'price', type: 'number', min: 0, step: 'any', placeholder: '0.00', value: existing?.price ?? '' }) +
        field({
          label: 'Unidad',
          name: 'unit',
          type: 'select',
          value: existing?.unit || 'u',
          options: UNITS.map((u) => ({ value: u, label: u })),
        }) +
        field({ label: 'Tienda', name: 'store', value: existing?.store || 'El Machetazo', list: 'preciosTiendas' }) +
        field({ label: 'Fecha', name: 'date', type: 'date', value: existing?.date || new Date().toISOString().slice(0, 10) })
    )}
    <datalist id="preciosInventario">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <datalist id="preciosTiendas">${stores().map((s) => `<option value="${esc(s)}">`).join('')}</datalist>

    <div class="subform" id="tiersBox">
      <div class="subform__head">
        <h4>Tramos <span class="muted">(solo si el precio varía por cantidad)</span></h4>
        <button type="button" class="btn btn--secondary btn--sm" id="addTier">＋ Añadir tramo</button>
      </div>
      <div id="tierRows" class="item-rows"></div>
    </div>

    ${field({ label: 'Notas', name: 'notes', type: 'textarea', value: existing?.notes || '', placeholder: 'Ej. presentación de 24 unidades, oferta del mes…' })}
  `;

  const saved = await openModal({
    title: existing ? 'Editar precio' : 'Añadir precio',
    body,
    saveLabel: 'Guardar precio',
    onMount: (frm) => {
      const typeSel = frm.querySelector('#f-priceType');
      const priceField = frm.querySelector('#f-price');
      const tiersBox = frm.querySelector('#tiersBox');
      const rows = frm.querySelector('#tierRows');

      const sync = () => {
        const tiered = typeSel.value === 'tiered';
        tiersBox.hidden = !tiered;
        priceField.closest('.field').style.display = tiered ? 'none' : '';
        if (tiered) priceField.removeAttribute('required');
        else priceField.setAttribute('required', '');
      };

      const drawTiers = () => {
        rows.innerHTML = tierRows
          .map(
            (t, i) => `
          <div class="item-row item-row--tier" data-i="${i}">
            <label class="sr-only" for="tierQty${i}">Cantidad mínima del tramo</label>
            <input class="input input--num" id="tierQty${i}" type="number" min="0" step="any" data-tier="qty" value="${esc(t.qty)}" placeholder="Desde cantidad" />
            <label class="sr-only" for="tierPrecio${i}">Precio por unidad en este tramo</label>
            <input class="input input--num" id="tierPrecio${i}" type="number" min="0" step="any" data-tier="price" value="${esc(t.price)}" placeholder="Precio por unidad" />
            <button type="button" class="icon-btn" data-remove-tier="${i}" title="Quitar tramo">🗑️</button>
          </div>`
          )
          .join('');
        rows.querySelectorAll('[data-tier]').forEach((el) =>
          el.addEventListener('input', () => {
            const i = Number(el.closest('.item-row').dataset.i);
            tierRows[i][el.dataset.tier] = el.dataset.tier === 'qty' ? Math.max(0, Number(el.value) || 0) : Math.max(0, Number(el.value) || 0);
          })
        );
        rows.querySelectorAll('[data-remove-tier]').forEach((b) =>
          b.addEventListener('click', () => {
            if (tierRows.length <= 1) return;
            tierRows.splice(Number(b.dataset.removeTier), 1);
            drawTiers();
          })
        );
      };

      typeSel.addEventListener('change', sync);
      frm.querySelector('#addTier')?.addEventListener('click', () => {
        tierRows.push({ qty: 0, price: 0 });
        drawTiers();
      });

      drawTiers();
      sync();
    },
    onSubmit: (data, frm) => {
      const productName = (data.productName || '').trim();
      if (!productName) {
        toast('Ponle nombre al producto', 'error');
        return false;
      }
      const priceType = data.priceType || 'unit';
      if (priceType !== 'tiered' && !(Number(data.price) > 0)) {
        toast('Ponle un precio', 'error');
        return false;
      }

      const tiers = [...frm.querySelectorAll('#tierRows .item-row')].map((row) => ({
        qty: Number(row.querySelector('[data-tier=qty]').value) || 0,
        price: Number(row.querySelector('[data-tier=price]').value) || 0,
      }));

      store.update((s) => {
        s.prices = savePrice(s.prices, {
          id: existing?.id,
          productName,
          priceType,
          price: Number(data.price) || 0,
          unit: data.unit || 'u',
          store: (data.store || '').trim(),
          date: data.date || new Date().toISOString().slice(0, 10),
          notes: (data.notes || '').trim(),
          tiers,
        });
      });
      toast(existing ? 'Precio actualizado' : 'Precio guardado ✅');
      return true;
    },
  });

  if (saved) renderPrecios(document.getElementById('view'));
}

/* ---------- Historial ---------- */

async function openHistory(id) {
  const p = store.state.prices.find((x) => x.id === id);
  if (!p) return;
  const hist = [...(p.history || [])].reverse();
  const first = hist.length ? hist[hist.length - 1].price : p.price;
  const last = p.priceType === 'tiered' ? null : Number(p.price || 0);
  const cambio = first && last ? last - first : null;

  const body = `
    <p class="modal__intro">
      Historial de <strong>${esc(p.productName)}</strong>${
        cambio != null && cambio !== 0
          ? ` · ${cambio > 0 ? '📈 ha subido' : '📉 ha bajado'} <strong>$${Math.abs(cambio).toFixed(2)}</strong> desde el primer registro`
          : ' · se ha mantenido estable'
      }
    </p>
    <ul class="list">
      <li><strong>Actual:</strong> ${p.priceType === 'tiered' ? (p.tiers || []).map((t) => `${t.qty} → $${t.price.toFixed(2)}`).join(' · ') : `$${Number(p.price || 0).toFixed(2)}`} ${esc(p.unit || 'u')} · ${esc(p.store || 'sin tienda')} · ${p.date ? formatDate(p.date) : '—'}</li>
      ${hist
        .map(
          (h) => `<li>${h.date ? formatDate(h.date) : '—'} · ${
            h.tiers?.length ? h.tiers.map((t) => `${t.qty} → $${t.price.toFixed(2)}`).join(' · ') : h.price != null ? `$${Number(h.price).toFixed(2)}` : '—'
          } · ${esc(h.store || 'sin tienda')}</li>`
        )
        .join('')}
    </ul>`;

  await openModal({
    title: '📈 Historial de precio',
    body,
    saveLabel: 'Cerrar',
    onSubmit: () => true,
  });
}

/* ---------- Captura de varios precios ---------- */

const MONEY = /\$\s*(\d+(?:[.,]\d{1,2})?)/;

function parseCapture(text) {
  const out = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const found = line.match(MONEY);
      let price = null;
      let name = line;
      if (found) {
        price = Number(found[1].replace(',', '.'));
        name = line.slice(0, found.index);
      } else {
        const tail = line.match(/(\d+(?:[.,]\d{1,2})?)\s*$/);
        if (tail) {
          price = Number(tail[1].replace(',', '.'));
          name = line.slice(0, tail.index);
        }
      }
      name = name.replace(/[·•\-–—:\s]+$/, '').trim();
      if (!name || !price || price <= 0) return;
      out.push({ name, price });
    });
  return out;
}

async function openCapture() {
  capturaPendiente = [];
  const body = `
    <p class="modal__intro">
      Pega aquí lo que copiaste del supermercado, una cosa por línea. Da igual
      el formato: se buscan los precios y se cruzan con tu inventario.
    </p>
    ${field({
      label: 'Texto copiado',
      name: 'texto',
      type: 'textarea',
      value: '',
      placeholder: 'Leche entera 1L $1.25\nPan integral $2.10\nManzanas 1kg $2.50',
    })}
    <div id="capturaPreview"></div>`;

  const saved = await openModal({
    title: '📥 Capturar varios precios',
    body,
    saveLabel: 'Guardar todos',
    onMount: (frm) => {
      const box = frm.querySelector('#capturaPreview');
      const analizar = () => {
        const items = parseCapture(frm.querySelector('#f-texto').value);
        const prices = store.state.prices;
        capturaPendiente = items.map((it) => {
          const match = findPrice(it.name, prices, 0.5);
          const exacta = prices.some((p) => normalize(p.productName) === normalize(it.name));
          // si no hay precio guardado con ese nombre, se propone uno nuevo
          const enInventario = store.state.inventory.find((p) => normalize(p.name) === normalize(it.name));
          return {
            name: it.name,
            price: it.price,
            match,
            exacta,
            enInventario,
            elegido: true,
          };
        });

        box.innerHTML = capturaPendiente.length
          ? `<div class="captura-list">
              <p class="modal__quick"><span class="modal__count">${capturaPendiente.length} precio${capturaPendiente.length === 1 ? '' : 's'} encontrado${capturaPendiente.length === 1 ? '' : 's'}</span></p>
              ${capturaPendiente
                .map(
                  (c, i) => `
                <label class="check">
                  <input type="checkbox" data-cap="${i}" ${c.elegido ? 'checked' : ''} />
                  <span class="check__name">
                    <strong>${esc(c.name)}</strong> — $${c.price.toFixed(2)}
                    ${
                      c.enInventario
                        ? ' <span class="tag tag--team">del inventario</span>'
                        : c.match
                          ? ` <span class="tag">se parece a ${esc(c.match.productName)} (${Math.round(c.match.score * 100)}%)</span>`
                          : ' <span class="tag">nuevo</span>'
                    }
                  </span>
                </label>`
                )
                .join('')}
            </div>`
          : '<p class="muted">No encontré precios en ese texto. Prueba a poner una línea por producto.</p>';
        box.querySelectorAll('[data-cap]').forEach((chk) =>
          chk.addEventListener('change', () => {
            capturaPendiente[Number(chk.dataset.cap)].elegido = chk.checked;
          })
        );
      };

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--secondary btn--sm';
      btn.textContent = '🔍 Analizar texto';
      btn.style.marginTop = '10px';
      btn.addEventListener('click', analizar);
      frm.querySelector('#f-texto').insertAdjacentElement('afterend', btn);
    },
    onSubmit: (data, frm) => {
      if (!capturaPendiente.length) parseCapture(data.texto);
      const elegidos = capturaPendiente.filter((c) => c.elegido);
      if (!elegidos.length) {
        toast('No hay precios elegidos para guardar', 'error');
        return false;
      }
      store.update((s) => {
        elegidos.forEach((c) => {
          // Si el precio capturado se parece a uno ya guardado, se ACTUALIZA ese
          // (mismo producto) en vez de crear uno nuevo: "Manzanas 1kg $2.60"
          // actualiza "Manzanas". El precio anterior queda en el historial.
          const destino = c.match || null;
          s.prices = savePrice(s.prices, {
            id: destino?.id,
            productName: destino ? destino.productName : c.name,
            priceType: 'unit',
            price: c.price,
            unit: c.enInventario?.unit || destino?.unit || 'u',
            store: destino?.store || 'El Machetazo',
            date: new Date().toISOString().slice(0, 10),
          });
        });
      });
      toast(`${elegidos.length} precio${elegidos.length === 1 ? '' : 's'} guardado${elegidos.length === 1 ? '' : 's'} ✅`);
      return true;
    },
  });

  if (saved) renderPrecios(document.getElementById('view'));
}

/* ---------- Exportar ---------- */

function exportCsv() {
  const csv = pricesToCsv(store.state.prices);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  if (!downloadBlob(blob, `precios-${new Date().toISOString().slice(0, 10)}.csv`)) {
    toast('Tu navegador no permite descargar archivos', 'error');
    return;
  }
  toast('Precios exportados en CSV 📤');
}

/* ---------- Para usar desde otras vistas ---------- */

/** Texto de WhatsApp con el presupuesto de un desayuno ya calculado. */
export function presupuestoText(ev) {
  return estimateText(ev, estimateEvent(ev, store.state.prices, store.state.inventory));
}
