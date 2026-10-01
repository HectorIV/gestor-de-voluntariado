import { store, productById, memberById, teamById, upcomingEvents, lowStockItems } from '../store.js';
import { esc, toast, openModal, field, grid, emptyState, statCard, formatDate, formatNumber, confirmDialog } from '../ui.js';

const STATUS = {
  planificado: { label: 'Planificado', tone: 'info' },
  'en-curso': { label: 'En curso', tone: 'warn' },
  realizado: { label: 'Realizado', tone: 'ok' },
  cancelado: { label: 'Cancelado', tone: 'muted' },
};

export function renderDesayunos(root) {
  const { events, members, inventory } = store.state;
  const pending = upcomingEvents();
  const low = lowStockItems();
  const next = pending[0];

  const sorted = [...events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  root.innerHTML = `
    <div class="stats">
      ${statCard({ label: 'Próximo desayuno', value: next ? formatDate(next.date) : '—', hint: next ? next.area || 'Sin área indicada' : 'no hay planificados', tone: next ? 'primary' : '' })}
      ${statCard({ label: 'Desayunos totales', value: String(events.length), hint: `${events.filter((e) => e.status === 'realizado').length} realizados` })}
      ${statCard({ label: 'Voluntarios', value: String(members.length), hint: `${store.state.teams.length} equipos` })}
      ${statCard({ label: 'Stock bajo', value: String(low.length), hint: low.length ? 'revisar inventario' : 'todo en orden', tone: low.length ? 'danger' : '' })}
    </div>

    <div class="toolbar">
      <span class="toolbar__hint">Hospital del Niño · gestión de desayunos</span>
      <a class="btn btn--ghost btn--sm" href="#/graficas">📊 Ver gráficas</a>
      <button class="btn btn--primary" id="addEvent">＋ Nuevo desayuno</button>
    </div>

    ${sorted.length === 0
      ? emptyState({
          icon: '🥐',
          title: 'Aún no hay desayunos programados',
          text: 'Crea el primero: fecha, área del hospital, personas a las que serviremos, productos necesarios y el equipo asignado.',
          action: '<button class="btn btn--primary" id="addEventEmpty">＋ Nuevo desayuno</button>',
        })
      : `<div class="cards">${sorted.map(eventCard).join('')}</div>`}
  `;

  root.querySelector('#addEvent')?.addEventListener('click', () => openEventForm());
  root.querySelector('#addEventEmpty')?.addEventListener('click', () => openEventForm());

  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEventForm(b.dataset.edit)));
  root.querySelectorAll('[data-delete]').forEach((b) =>
    b.addEventListener('click', () => {
      const ev = events.find((e) => e.id === b.dataset.delete);
      if (!ev) return;
      if (confirmDialog(`¿Eliminar el desayuno "${ev.title}"?`)) {
        store.update((s) => {
          s.events = s.events.filter((x) => x.id !== ev.id);
        });
        toast('Desayuno eliminado');
        renderDesayunos(root);
      }
    })
  );
  root.querySelectorAll('[data-status]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((s) => {
        const ev = s.events.find((x) => x.id === b.dataset.status);
        if (ev) ev.status = b.dataset.value;
      });
      renderDesayunos(root);
    })
  );
  root.querySelectorAll('[data-deduct]').forEach((b) =>
    b.addEventListener('click', () => deductInventory(b.dataset.deduct, root))
  );
  root.querySelectorAll('[data-restore]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((s) => {
        const ev = s.events.find((x) => x.id === b.dataset.restore);
        if (!ev) return;
        ev.items.forEach((it) => {
          const p = s.inventory.find((x) => x.id === it.productId);
          if (p) p.qty = Number(p.qty) + Number(it.qty);
        });
        ev.deducted = false;
      });
      toast('Cantidades devueltas al inventario');
      renderDesayunos(root);
    })
  );
}

function eventCard(ev) {
  const status = STATUS[ev.status] || STATUS.planificado;
  const items = (ev.items || []).map((it) => {
    const p = productById(it.productId);
    return `<li>${p ? esc(p.name) : '<s>Producto eliminado</s>'} · <strong>${formatNumber(it.qty)}</strong> ${esc(p?.unit || 'u.')}</li>`;
  });

  const byTeam = store.state.teams
    .map((t) => {
      const names = (ev.memberIds || [])
        .map(memberById)
        .filter(Boolean)
        .filter((m) => m.teamId === t.id);
      return names.length ? `<li><strong>${esc(t.name)}:</strong> ${names.map((m) => esc(m.name)).join(', ')}</li>` : '';
    })
    .filter(Boolean);

  const noTeam = (ev.memberIds || [])
    .map(memberById)
    .filter(Boolean)
    .filter((m) => !teamById(m.teamId));

  if (noTeam.length) byTeam.push(`<li><strong>Sin equipo:</strong> ${noTeam.map((m) => esc(m.name)).join(', ')}</li>`);

  return `
    <article class="card ${ev.status === 'realizado' ? 'card--done' : ''}">
      <div class="card__head">
        <div>
          <span class="badge badge--${status.tone}">${status.label}</span>
          <h3>${esc(ev.title)}</h3>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-edit="${ev.id}" title="Editar">✏️</button>
          <button class="icon-btn" data-delete="${ev.id}" title="Eliminar">🗑️</button>
        </div>
      </div>

      <div class="card__meta">
        <span>📅 ${formatDate(ev.date)}</span>
        <span>🏥 ${esc(ev.area || 'Área por definir')}</span>
        <span>🍽 ${formatNumber(ev.people || 0)} personas</span>
      </div>

      ${ev.notes ? `<p class="card__notes">${esc(ev.notes)}</p>` : ''}

      <div class="card__grid">
        <div>
          <h4>Productos necesarios</h4>
          ${items.length ? `<ul class="list">${items.join('')}</ul>` : '<p class="muted">Sin productos definidos</p>'}
          ${ev.deducted ? '<span class="badge badge--ok">Descontado del inventario</span>' : ''}
        </div>
        <div>
          <h4>Equipo asignado</h4>
          ${byTeam.length ? `<ul class="list list--team">${byTeam.join('')}</ul>` : '<p class="muted">Sin miembros asignados</p>'}
        </div>
      </div>

      <div class="card__foot">
        <div class="chip-row">
          ${Object.entries(STATUS)
            .map(
              ([key, cfg]) =>
                `<button class="chip ${ev.status === key ? 'chip--active chip--' + cfg.tone : ''}" data-status="${ev.id}" data-value="${key}">${cfg.label}</button>`
            )
            .join('')}
        </div>
        ${
          ev.deducted
            ? `<button class="btn btn--ghost btn--sm" data-restore="${ev.id}">↩ Devolver al inventario</button>`
            : `<button class="btn btn--secondary btn--sm" data-deduct="${ev.id}" ${(ev.items || []).length ? '' : 'disabled'}>📦 Descontar del inventario</button>`
        }
      </div>
    </article>`;
}

function deductInventory(eventId, root) {
  const ev = store.state.events.find((e) => e.id === eventId);
  if (!ev || !ev.items?.length) return;

  const missing = ev.items.filter((it) => {
    const p = productById(it.productId);
    return !p || Number(p.qty) < Number(it.qty);
  });

  if (missing.length) {
    const names = missing
      .map((it) => {
        const p = productById(it.productId);
        return p ? `${p.name} (hay ${formatNumber(p.qty)})` : 'producto eliminado';
      })
      .join(', ');
    if (!confirmDialog(`No hay stock suficiente para: ${names}.\nSe descontará hasta dejarlo en 0. ¿Continuar?`)) return;
  }

  store.update((s) => {
    const e = s.events.find((x) => x.id === eventId);
    e.items.forEach((it) => {
      const p = s.inventory.find((x) => x.id === it.productId);
      if (p) p.qty = Math.max(0, Number(p.qty) - Number(it.qty));
    });
    e.deducted = true;
  });
  toast('Inventario descontado');
  renderDesayunos(root);
}

async function openEventForm(id) {
  const { inventory, members, teams } = store.state;
  const existing = id ? store.state.events.find((e) => e.id === id) : null;
  const draftItems = existing ? existing.items.map((it) => ({ ...it })) : [];
  const draftMembers = new Set(existing?.memberIds || []);

  const body = `
    ${grid(
      'form-grid',
      field({ label: 'Título', name: 'title', required: true, value: existing?.title || '', placeholder: 'Ej. Desayuno Urgencias – turno mañana' }) +
        field({ label: 'Fecha', name: 'date', type: 'date', required: true, value: existing?.date || new Date().toISOString().slice(0, 10) }) +
        field({ label: 'Área / sala', name: 'area', value: existing?.area || '', placeholder: 'Ej. Pabellón 3, auditorio…' }) +
        field({ label: 'Personas a servir', name: 'people', type: 'number', min: 0, value: existing?.people || 0 }) +
        field({ label: 'Estado', name: 'status', type: 'select', value: existing?.status || 'planificado', options: Object.entries(STATUS).map(([value, cfg]) => ({ value, label: cfg.label })) }) +
        field({ label: 'Notas', name: 'notes', type: 'textarea', value: existing?.notes || '', placeholder: 'Indicaciones, horarios, contactos…' })
    )}

    <div class="subform">
      <div class="subform__head">
        <h4>Productos necesarios</h4>
        <button type="button" class="btn btn--secondary btn--sm" id="addItem" ${inventory.length ? '' : 'disabled'}>＋ Añadir producto</button>
      </div>
      ${inventory.length === 0 ? '<p class="muted">No hay productos en el inventario. Añádelos primero en la sección Inventario.</p>' : ''}
      <div id="itemRows" class="item-rows"></div>
    </div>

    <div class="subform">
      <div class="subform__head"><h4>Equipo asignado</h4></div>
      ${
        members.length === 0
          ? '<p class="muted">No hay miembros registrados. Añádelos en la sección Miembros y equipos.</p>'
          : teams
              .map((t) => {
                const list = members.filter((m) => m.teamId === t.id);
                const extras = members.filter((m) => !m.teamId && t.id === teams[0].id);
                const rows = t.id === teams[0].id ? [...list, ...extras] : list;
                if (!rows.length) return '';
                return `
                <fieldset class="team-group">
                  <legend>${esc(t.name)}</legend>
                  ${rows
                    .map(
                      (m) => `
                    <label class="check">
                      <input type="checkbox" name="member" value="${m.id}" ${draftMembers.has(m.id) ? 'checked' : ''} />
                      <span>${esc(m.name)}</span>
                    </label>`
                    )
                    .join('')}
                </fieldset>`;
              })
              .join('')
      }
    </div>
  `;

  const saved = await openModal({
    title: existing ? 'Editar desayuno' : 'Nuevo desayuno',
    body,
    saveLabel: existing ? 'Guardar cambios' : 'Crear desayuno',
    onMount: (frm) => {
      const rowsBox = frm.querySelector('#itemRows');

      const drawRows = () => {
        rowsBox.innerHTML = draftItems.length
          ? draftItems
              .map(
                (it, i) => `
              <div class="item-row" data-i="${i}">
                <select class="input" data-field="productId">
                  ${inventory.map((p) => `<option value="${p.id}" ${p.id === it.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
                </select>
                <input class="input input--num" type="number" min="0" step="any" data-field="qty" value="${esc(it.qty)}" />
                <button type="button" class="icon-btn" data-remove="${i}" title="Quitar">🗑️</button>
              </div>`
              )
              .join('')
          : '';

        rowsBox.querySelectorAll('[data-field]').forEach((el) => {
          el.addEventListener('change', () => {
            const row = el.closest('.item-row');
            const i = Number(row.dataset.i);
            draftItems[i][el.dataset.field] = el.dataset.field === 'qty' ? Math.max(0, Number(el.value) || 0) : el.value;
          });
        });
        rowsBox.querySelectorAll('[data-remove]').forEach((b) =>
          b.addEventListener('click', () => {
            draftItems.splice(Number(b.dataset.remove), 1);
            drawRows();
          })
        );
      };

      frm.querySelector('#addItem')?.addEventListener('click', () => {
        const used = new Set(draftItems.map((i) => i.productId));
        const free = inventory.find((p) => !used.has(p.id)) || inventory[0];
        draftItems.push({ productId: free.id, qty: 1 });
        drawRows();
      });

      drawRows();
    },
    onSubmit: (data, frm) => {
      const title = (data.title || '').trim();
      if (!title) {
        toast('Ponle un título al desayuno', 'error');
        return false;
      }
      const memberIds = [...frm.querySelectorAll('input[name=member]:checked')].map((el) => el.value);

      store.update((s) => {
        const payload = {
          title,
          date: data.date || '',
          area: (data.area || '').trim(),
          people: Math.max(0, Number(data.people) || 0),
          status: data.status || 'planificado',
          notes: (data.notes || '').trim(),
          items: draftItems.filter((i) => i.productId),
          memberIds,
        };
        if (existing) {
          const ev = s.events.find((x) => x.id === existing.id);
          const itemsChanged = JSON.stringify(ev.items) !== JSON.stringify(payload.items);
          Object.assign(ev, payload);
          if (itemsChanged) ev.deducted = false;
        } else {
          s.events.push({ id: store.uid(), deducted: false, ...payload });
        }
      });
      toast(existing ? 'Desayuno actualizado' : 'Desayuno creado');
      return true;
    },
  });

  if (saved) renderDesayunos(document.getElementById('view'));
}
