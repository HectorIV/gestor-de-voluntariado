import { store, productById, memberById, teamById, teamsOfMember, memberTeamIds, isTeamless, upcomingEvents, lowStockItems, setQty } from '../store.js';
import { esc, toast, openModal, field, grid, emptyState, statCard, formatDate, formatDateShort, formatNumber, confirmDialog, copyText, rerender } from '../ui.js';

const STATUS = {
  planificado: { label: 'Planificado', tone: 'info' },
  'en-curso': { label: 'En curso', tone: 'warn' },
  realizado: { label: 'Realizado', tone: 'ok' },
  cancelado: { label: 'Cancelado', tone: 'muted' },
};

export function renderDesayunos(root) {
  // Conserva scroll y foco (importante en móvil: al tocar un campo no debe saltar al tope).
  rerender(() => drawDesayunos(root));
}

function drawDesayunos(root) {
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
  root.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => copyText(eventText(b.dataset.copy), 'Desayuno copiado ✅'))
  );
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
      // Al pasar a “Realizado” se pregunta quiénes participaron de verdad:
      // queda guardado como historial en la tarjeta (cancelar no cambia nada).
      if (b.dataset.value === 'realizado') {
        openParticipation(b.dataset.status, root, { finish: true });
        return;
      }
      store.update((s) => {
        const ev = s.events.find((x) => x.id === b.dataset.status);
        if (ev) ev.status = b.dataset.value;
      });
      renderDesayunos(root);
    })
  );
  root.querySelectorAll('[data-part]').forEach((b) =>
    b.addEventListener('click', () => openParticipation(b.dataset.part, root))
  );
  root.querySelectorAll('[data-deduct]').forEach((b) =>
    b.addEventListener('click', () => deductInventory(b.dataset.deduct, root))
  );
  root.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => openClosure(b.dataset.close, root))
  );
  root.querySelectorAll('[data-restore]').forEach((b) =>
    b.addEventListener('click', () => {
      store.update((s) => {
        const ev = s.events.find((x) => x.id === b.dataset.restore);
        if (!ev) return;
        // Devuelve lo que se sacó de verdad: el uso real si está cerrado, si no lo planificado.
        planByProduct(ev).forEach((planQty, id) => {
          const p = s.inventory.find((x) => x.id === id);
          if (p) setQty(p, Number(p.qty) + alreadyRemoved(ev, id, planQty));
        });
        ev.deducted = false;
        ev.used = null;
        ev.removed = null;
        // Si al cerrar faltó algo y se anotó en la lista de compras, se quita el aviso.
        s.shopping = (s.shopping || []).filter((x) => x.note !== `Faltó en: ${ev.title}`);
      });
      toast('Cantidades devueltas al inventario');
      renderDesayunos(root);
    })
  );
}

/* ---------- Copiar como texto (WhatsApp, etc.) ---------- */

/**
 * Historial de participación agrupado por equipo: [[equipo, [nombres]], …].
 * Usa los nombres y equipos guardados en el momento de cerrar, así que se
 * sostiene aunque la persona se haya borrado de Miembros después.
 */
function participationGroups(ev) {
  const snap = ev.participants || [];
  if (!snap.length) return [];
  const buckets = new Map();
  snap.forEach((p) => {
    const keys = p.teams?.length ? p.teams : ['Sin equipo'];
    keys.forEach((t) => {
      if (!buckets.has(t)) buckets.set(t, []);
      buckets.get(t).push(p.name);
    });
  });
  const order = [...store.state.teams.map((t) => t.name), 'Sin equipo'];
  return [
    ...order.filter((t) => buckets.has(t)).map((t) => [t, buckets.get(t)]),
    ...[...buckets.keys()].filter((t) => !order.includes(t)).map((t) => [t, buckets.get(t)]),
  ];
}

function participationHtml(ev) {
  return participationGroups(ev)
    .map(([team, names]) => `<li><strong>${esc(team)}:</strong> ${names.map((n) => esc(n)).join(', ')}</li>`)
    .join('');
}

function participationLines(ev) {
  return participationGroups(ev).map(([team, names]) => `• ${team}: ${names.join(', ')}`);
}

function eventText(id) {
  const ev = store.state.events.find((e) => e.id === id);
  if (!ev) return '';
  const status = (STATUS[ev.status] || STATUS.planificado).label;
  const lines = [
    `🥐 *${ev.title}*`,
    `📅 ${formatDateShort(ev.date)} · 🏥 ${ev.area || 'área por definir'}`,
    `🍽 ${formatNumber(ev.people || 0)} personas · Estado: ${status}`,
  ];
  if (Number(ev.budget)) lines.push(`💰 Presupuesto: ${formatNumber(ev.budget)}`);
  if (ev.notes) lines.push(`📝 ${ev.notes}`);

  const items = ev.items || [];
  if (items.length) {
    lines.push('', '*📦 Productos:*');
    items.forEach((it) => {
      const p = productById(it.productId);
      lines.push(`• ${p ? p.name : 'producto eliminado'}: ${formatNumber(it.qty)} ${p ? p.unit || 'u.' : ''}`.trimEnd());
    });
  }

  const memberIds = ev.memberIds || [];
  if (memberIds.length) {
    lines.push('', '*👥 Equipo:*');
    const assigned = memberIds.map(memberById).filter(Boolean);
    store.state.teams.forEach((t) => {
      const names = assigned.filter((m) => memberTeamIds(m).includes(t.id));
      if (names.length) lines.push(`• ${t.name}: ${names.map((m) => m.name).join(', ')}`);
    });
    const orphan = assigned.filter(isTeamless);
    if (orphan.length) lines.push(`• Sin equipo: ${orphan.map((m) => m.name).join(', ')}`);
  }

  const partLines = participationLines(ev);
  if (partLines.length) lines.push('', '*👥 Participaron:*', ...partLines);

  if (ev.used) {
    lines.push('', '*🏁 Cierre (uso real):*');
    planByProduct(ev).forEach((planQty, id) => {
      const p = productById(id);
      if (!p) return;
      const used = Number(ev.used[id]);
      const sobra = planQty - used;
      const extra = sobra > 0 ? ` (sobró ${formatNumber(sobra)})` : sobra < 0 ? ` (usó ${formatNumber(-sobra)} más)` : '';
      lines.push(`• ${p.name}: usado ${formatNumber(used)} de ${formatNumber(planQty)}${extra}`);
    });
  } else if (ev.deducted) {
    lines.push('', '✅ Descontado del inventario');
  }
  return lines.join('\n');
}

function eventCard(ev) {
  const status = STATUS[ev.status] || STATUS.planificado;
  const items = (ev.items || []).map((it) => {
    const p = productById(it.productId);
    return `<li>${p ? esc(p.name) : '<s>Producto eliminado</s>'} · <strong>${formatNumber(it.qty)}</strong> ${esc(p?.unit || 'u.')}</li>`;
  });

  const assigned = (ev.memberIds || []).map(memberById).filter(Boolean);
  const byTeam = store.state.teams
    .map((t) => {
      const names = assigned.filter((m) => memberTeamIds(m).includes(t.id));
      return names.length ? `<li><strong>${esc(t.name)}:</strong> ${names.map((m) => esc(m.name)).join(', ')}</li>` : '';
    })
    .filter(Boolean);

  const noTeam = assigned.filter(isTeamless);

  if (noTeam.length) byTeam.push(`<li><strong>Sin equipo:</strong> ${noTeam.map((m) => esc(m.name)).join(', ')}</li>`);

  return `
    <article class="card ${ev.status === 'realizado' ? 'card--done' : ''}">
      <div class="card__head">
        <div>
          <span class="badge badge--${status.tone}">${status.label}</span>
          <h3>${esc(ev.title)}</h3>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-copy="${ev.id}" title="Copiar detalle">📋</button>
          <button class="icon-btn" data-edit="${ev.id}" title="Editar">✏️</button>
          <button class="icon-btn" data-delete="${ev.id}" title="Eliminar">🗑️</button>
        </div>
      </div>

      <div class="card__meta">
        <span>📅 ${formatDate(ev.date)}</span>
        <span>🏥 ${esc(ev.area || 'Área por definir')}</span>
        <span>🍽 ${formatNumber(ev.people || 0)} personas</span>
        ${Number(ev.budget) ? `<span>💰 ${formatNumber(ev.budget)} de presupuesto</span>` : ''}
      </div>

      ${ev.notes ? `<p class="card__notes">${esc(ev.notes)}</p>` : ''}

      <div class="card__grid">
        <div>
          <h4>Productos necesarios</h4>
          ${items.length ? `<ul class="list">${items.join('')}</ul>` : '<p class="muted">Sin productos definidos</p>'}
          ${ev.used
            ? `<span class="badge badge--ok">🏁 Cerrado con uso real</span>`
            : ev.deducted
              ? '<span class="badge badge--ok">Descontado del inventario</span>'
              : ''}
          ${
            ev.used
              ? `<ul class="list list--cierre">${[...planByProduct(ev).entries()]
                  .map(([id, planQty]) => {
                    const p = productById(id);
                    if (!p) return '';
                    const used = Number(ev.used[id]);
                    const sobra = planQty - used;
                    const extra =
                      sobra > 0
                        ? ` · sobró ${formatNumber(sobra)}`
                        : sobra < 0
                          ? ` · usó ${formatNumber(-sobra)} más de lo previsto`
                          : '';
                    return `<li>${esc(p.name)} · usado <strong>${formatNumber(used)}</strong> de ${formatNumber(planQty)}${extra}</li>`;
                  })
                  .join('')}</ul>`
              : ''
          }
        </div>
        <div>
          <h4>Equipo asignado</h4>
          ${byTeam.length ? `<ul class="list list--team">${byTeam.join('')}</ul>` : '<p class="muted">Sin miembros asignados</p>'}
        </div>
      </div>

      ${
        participationGroups(ev).length
          ? `<div class="card__hist">
          <h4>👥 Participaron <span class="muted">· historial</span></h4>
          <ul class="list list--team">${participationHtml(ev)}</ul>
        </div>`
          : ''
      }

      <div class="card__foot">
        <div class="chip-row">
          ${Object.entries(STATUS)
            .map(
              ([key, cfg]) =>
                `<button class="chip ${ev.status === key ? 'chip--active chip--' + cfg.tone : ''}" data-status="${ev.id}" data-value="${key}">${cfg.label}</button>`
            )
            .join('')}
        </div>
        <button class="btn ${ev.participants?.length ? 'btn--ghost' : 'btn--secondary'} btn--sm" data-part="${ev.id}" title="Marcar quiénes participaron y verlo como historial">👥 ${ev.participants?.length ? `Participaron ${ev.participants.length}` : 'Participación'}</button>
        ${
          (ev.items || []).length
            ? `<button class="btn ${ev.used ? 'btn--secondary' : 'btn--primary'} btn--sm" data-close="${ev.id}" title="Registrar lo realmente usado y ajustar el inventario">🏁 ${ev.used ? 'Ajustar cierre' : 'Cierre con uso real'}</button>`
            : ''
        }
        ${
          ev.deducted
            ? `<button class="btn btn--ghost btn--sm" data-restore="${ev.id}">↩ Devolver al inventario</button>`
            : `<button class="btn btn--secondary btn--sm" data-deduct="${ev.id}" ${(ev.items || []).length ? '' : 'disabled'}>📦 Descontar del inventario</button>`
        }
      </div>
    </article>`;
}

/* ---------- Participación: historial de quiénes estuvieron ---------- */

/**
 * Cajas de miembros agrupadas por equipo (cada persona aparece una sola vez,
 * en su primer equipo, con etiqueta de los demás). `historic` son personas ya
 * borradas de Miembros que siguen en el historial del evento: se listan al
 * final para que no se pierdan al volver a guardar.
 */
function memberPickerHtml(checkedSet, name, historic = []) {
  const { members, teams } = store.state;
  if (!members.length && !historic.length) {
    return '<p class="muted">No hay miembros registrados. Añádelos en la sección Miembros y equipos.</p>';
  }

  const row = (id, label, tags, isChecked) => `
                    <label class="check">
                      <input type="checkbox" name="${name}" value="${esc(id)}" ${isChecked ? 'checked' : ''} />
                      <span class="check__name">${label}${tags}</span>
                    </label>`;

  const memberRow = (m, groupId) => {
    const others = teamsOfMember(m).filter((t) => t.id !== groupId);
    const tags = others.length
      ? ` <span class="check__teams">${others.map((t) => `<span class="tag tag--team">${esc(t.name)}</span>`).join(' ')}</span>`
      : '';
    return row(m.id, esc(m.name), tags, checkedSet.has(m.id));
  };

  const groups = teams
    .map((t) => {
      const list = members.filter((m) => memberTeamIds(m).filter((id) => teamById(id))[0] === t.id);
      if (!list.length) return '';
      return `
                <fieldset class="team-group">
                  <legend>${esc(t.name)}</legend>
                  ${list.map((m) => memberRow(m, t.id)).join('')}
                </fieldset>`;
    })
    .join('');

  const teamless = members.filter((m) => !teamsOfMember(m).length);
  const extra = teamless.length
    ? `
                <fieldset class="team-group">
                  <legend>${teams.length ? 'Sin equipo' : 'Miembros'}</legend>
                  ${teamless.map((m) => memberRow(m, null)).join('')}
                </fieldset>`
    : '';

  const gone = historic.length
    ? `
                <fieldset class="team-group">
                  <legend>Ya no están en Miembros</legend>
                  ${historic
                    .map((p) =>
                      row(
                        p.id,
                        `${esc(p.name)} <span class="muted">(no está en la lista)</span>`,
                        p.teams?.length
                          ? ` <span class="check__teams">${p.teams.map((t) => `<span class="tag tag--team">${esc(t)}</span>`).join(' ')}</span>`
                          : '',
                        checkedSet.has(p.id)
                      )
                    )
                    .join('')}
                </fieldset>`
    : '';

  return groups + extra + gone;
}

/**
 * Modal para marcar quiénes participaron de verdad. Se guarda en
 * `ev.participants` con el nombre y los equipos copiados en ese momento, así
 * el historial se conserva aunque luego se borre a la persona de Miembros.
 */
async function openParticipation(eventId, root, { finish = false } = {}) {
  const ev = store.state.events.find((e) => e.id === eventId);
  if (!ev) return;

  const { members } = store.state;
  const snapshot = ev.participants || [];
  const historic = snapshot.filter((p) => !members.some((m) => m.id === p.id));
  // Si aún no hay historial, se parte de los miembros asignados al desayuno.
  const base = snapshot.length ? snapshot.map((p) => p.id) : ev.memberIds || [];
  const checked = new Set([...base, ...historic.map((p) => p.id)]);

  const body = `
    <p class="modal__intro">
      Marca <strong>quiénes participaron de verdad</strong>. Se guarda como
      <strong>historial</strong> del desayuno con su equipo, y se mantiene aunque
      la persona se saque de la lista de Miembros.${
        finish ? ' Al guardar, el desayuno pasa a <strong>Realizado</strong>.' : ''
      }
    </p>
    ${memberPickerHtml(checked, 'part', historic)}
    <div class="modal__quick"><span class="modal__count" id="partCount"></span></div>`;

  const saved = await openModal({
    title: finish ? '🏁 Finalizar · quiénes participaron' : '👥 Participación · historial',
    body,
    saveLabel: finish ? 'Finalizar desayuno' : 'Guardar participación',
    onMount: (frm) => {
      const count = () => {
        const total = frm.querySelectorAll('input[name=part]').length;
        const n = frm.querySelectorAll('input[name=part]:checked').length;
        const el = frm.querySelector('#partCount');
        if (el) el.textContent = `${n} de ${total} participan`;
      };
      frm.querySelectorAll('input[name=part]').forEach((i) => i.addEventListener('change', count));
      count();
    },
    onSubmit: (data, frm) => {
      const ids = [...frm.querySelectorAll('input[name=part]:checked')].map((el) => el.value);
      const prev = new Map(snapshot.map((p) => [p.id, p]));
      store.update((s) => {
        const e = s.events.find((x) => x.id === eventId);
        if (!e) return;
        e.participants = ids
          .map((id) => {
            const m = s.members.find((x) => x.id === id);
            if (m) {
              return {
                id: m.id,
                name: m.name,
                teams: memberTeamIds(m)
                  .map((tid) => s.teams.find((t) => t.id === tid)?.name)
                  .filter(Boolean),
              };
            }
            return prev.get(id) || null; // persona ya borrada: se conserva su ficha
          })
          .filter(Boolean);
        if (finish) e.status = 'realizado';
      });
      toast(finish ? 'Desayuno finalizado · participación guardada 🙌' : 'Participación guardada');
      return true;
    },
  });

  if (saved) renderDesayunos(document.getElementById('view'));
}

/* ---------- Cierre con uso real ---------- */

/** Suma lo planificado por producto (por si un producto aparece dos veces). */
function planByProduct(ev) {
  const map = new Map();
  (ev.items || []).forEach((it) => map.set(it.productId, (map.get(it.productId) || 0) + Number(it.qty)));
  return map;
}

/**
 * Cuánto se ha sacado de verdad del inventario para este evento:
 * lo registrado en el cierre/descuento (ev.removed), o como alternativa el uso real
 * o lo planificado si solo se descontó, o 0 si no se tocó.
 */
function alreadyRemoved(ev, productId, planQty) {
  if (ev.removed && ev.removed[productId] != null) return Number(ev.removed[productId]);
  if (ev.used && ev.used[productId] != null) return Number(ev.used[productId]);
  return ev.deducted ? planQty : 0;
}

function addShortageToShopping(s, product, falta, evTitle) {
  s.shopping = s.shopping || [];
  const note = `Faltó en: ${evTitle}`;
  const found = s.shopping.find((x) => x.name === product.name && x.note === note);
  if (found) {
    found.qty = falta;
    found.bought = false;
  } else {
    s.shopping.push({
      id: store.uid(),
      name: product.name,
      qty: falta,
      unit: product.unit || '',
      category: product.category || 'Otros',
      note,
      bought: false,
    });
  }
}

async function openClosure(eventId, root) {
  const ev = store.state.events.find((e) => e.id === eventId);
  if (!ev || !ev.items?.length) return;

  const plan = planByProduct(ev);
  const rows = [...plan.entries()]
    .map(([id, planQty]) => {
      const p = productById(id);
      if (!p) return null;
      const prev = alreadyRemoved(ev, id, planQty);
      const available = Number(p.qty) + prev;
      const def = ev.used && ev.used[id] != null ? Number(ev.used[id]) : planQty;
      return { id, p, planQty, prev, available, def };
    })
    .filter(Boolean);

  if (!rows.length) {
    toast('No hay productos que ajustar (¿están eliminados?)', 'error');
    return;
  }

  const body = `
    <p class="modal__intro">
      Anota <strong>lo realmente consumido</strong> en la actividad. Lo que sobre vuelve al inventario,
      lo que falte se avisa y se añade a la <strong>lista de compras</strong>. Al guardar, el desayuno
      pasa a <strong>Realizado</strong>.
    </p>
    <div class="close-list">
      ${rows
        .map(
          (r) => `
        <div class="close-row">
          <div class="close-row__name">
            <strong>${esc(r.p.name)}</strong>
            <span class="cell-sub">planificado ${formatNumber(r.planQty)} ${esc(r.p.unit || 'u.')} · disponible ${formatNumber(r.available)}</span>
          </div>
          <input class="input input--num" type="number" min="0" step="any" data-used="${r.id}" value="${r.def}" aria-label="Usado realmente de ${esc(r.p.name)}" />
          <span class="close-stat" data-stat="${r.id}"></span>
        </div>`
        )
        .join('')}
    </div>
    <div class="modal__quick"><span class="modal__count" id="cierreTotal"></span></div>`;

  const saved = await openModal({
    title: '🏁 Cierre de actividad',
    body,
    saveLabel: 'Guardar cierre',
    onMount: (frm) => {
      const refresh = () => {
        let sobraTotal = 0;
        let faltaTotal = 0;
        rows.forEach((r) => {
          const input = frm.querySelector(`[data-used="${r.id}"]`);
          const stat = frm.querySelector(`[data-stat="${r.id}"]`);
          if (!input || !stat) return;
          const used = Math.max(0, Number(input.value) || 0);
          const sobra = r.planQty - used;
          const falta = Math.max(0, used - r.available);
          if (sobra > 0) sobraTotal += sobra;
          if (falta > 0) faltaTotal += falta;
          stat.className = 'close-stat ' + (falta > 0 ? 'is-short' : sobra > 0 ? 'is-ok' : sobra < 0 ? 'is-warn' : 'is-mute');
          stat.textContent =
            falta > 0
              ? `⚠ se acaba · faltan ${formatNumber(falta)} ${r.p.unit || 'u.'}`
              : sobra > 0
                ? `✓ sobra ${formatNumber(sobra)} ${r.p.unit || 'u.'}`
                : sobra < 0
                  ? `usa ${formatNumber(-sobra)} más de lo previsto`
                  : '✓ todo usado';
        });
        const total = frm.querySelector('#cierreTotal');
        if (total) {
          total.textContent = `Resumen: sobra ${formatNumber(sobraTotal)} · faltan ${formatNumber(faltaTotal)}`;
        }
      };
      frm.querySelectorAll('[data-used]').forEach((i) => i.addEventListener('input', refresh));
      refresh();
    },
    onSubmit: (data, frm) => {
      const usedMap = {};
      frm.querySelectorAll('[data-used]').forEach((i) => {
        usedMap[i.dataset.used] = Math.max(0, Number(i.value) || 0);
      });

      const faltantes = [];
      let sobraTotal = 0;
      let faltaTotal = 0;

      store.update((s) => {
        const e = s.events.find((x) => x.id === eventId);
        if (!e) return;
        const planNow = planByProduct(e);
        const nuevoUsed = {};
        const nuevoRemoved = {};

        planNow.forEach((planQty, id) => {
          const p = s.inventory.find((x) => x.id === id);
          const used = usedMap[id] != null ? usedMap[id] : planQty;
          nuevoUsed[id] = used;
          if (!p) return;

          const prev = alreadyRemoved(e, id, planQty);
          const disponible = Number(p.qty) + prev;
          const sobra = Math.max(0, planQty - used);
          const falta = Math.max(0, used - disponible);

          if (sobra > 0) sobraTotal += sobra;
          if (falta > 0) {
            faltaTotal += falta;
            faltantes.push({ p, falta });
          }

          // Ajuste: se devuelve lo que sobra y se saca lo extra que se usó
          // (sin bajar de 0: si no alcanzó, se queda a 0 y se avisa).
          const before = Number(p.qty);
          const after = Math.max(0, before + (prev - used));
          nuevoRemoved[id] = prev - (after - before);
          setQty(p, after);
        });

        e.used = nuevoUsed;
        e.removed = nuevoRemoved;
        e.deducted = true;
        e.status = 'realizado';

        // Los avisos de "faltó en este evento" se recalculan en cada cierre.
        const nota = `Faltó en: ${e.title}`;
        s.shopping = (s.shopping || []).filter((x) => x.note !== nota);
        faltantes.forEach(({ p, falta }) => addShortageToShopping(s, p, falta, e.title));
      });

      const partes = [];
      if (sobraTotal > 0) partes.push(`sobra ${formatNumber(sobraTotal)}`);
      if (faltaTotal > 0) partes.push(`faltaron ${formatNumber(faltaTotal)} → lista de compras 🛒`);
      toast(partes.length ? `Cierre guardado · ${partes.join(' · ')}` : 'Cierre guardado · todo cuadrado ✅');
      return true;
    },
  });

  if (saved) {
    renderDesayunos(document.getElementById('view'));
    // Terminar el cierre pregunta además quiénes participaron (historial).
    openParticipation(eventId, document.getElementById('view'), { finish: true });
  }
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
    const removedMap = {};
    planByProduct(e).forEach((planQty, id) => {
      const p = s.inventory.find((x) => x.id === id);
      if (!p) return;
      const before = Number(p.qty);
      const after = Math.max(0, before - planQty);
      removedMap[id] = before - after; // lo que de verdad se llevó (puede ser menos que lo planeado)
      setQty(p, after);
    });
    e.removed = removedMap;
    e.deducted = true;
  });
  toast('Inventario descontado');
  renderDesayunos(root);
}

async function openEventForm(id) {
  const { inventory } = store.state;
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
        field({ label: 'Presupuesto', name: 'budget', type: 'number', min: 0, step: 'any', placeholder: 'Opcional', value: existing?.budget || '' }) +
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
      ${memberPickerHtml(draftMembers, 'member')}
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
                <select class="input" data-field="productId" aria-label="Producto necesario">
                  ${inventory.map((p) => `<option value="${p.id}" ${p.id === it.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
                </select>
                <input class="input input--num" type="number" min="0" step="any" data-field="qty" value="${esc(it.qty)}" aria-label="Cantidad" />
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
          budget: Math.max(0, Number(data.budget) || 0),
          status: data.status || 'planificado',
          notes: (data.notes || '').trim(),
          items: draftItems.filter((i) => i.productId),
          memberIds,
        };
        if (existing) {
          const ev = s.events.find((x) => x.id === existing.id);
          const itemsChanged = JSON.stringify(ev.items) !== JSON.stringify(payload.items);
          Object.assign(ev, payload);
          if (itemsChanged) {
            ev.deducted = false;
            ev.used = null;
            ev.removed = null;
          }
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
