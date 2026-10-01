import { store, memberById, teamById, teamMembers } from '../store.js';
import { esc, toast, openModal, field, grid, emptyState, confirmDialog, copyText } from '../ui.js';

let memberSearch = '';

export function renderMiembros(root) {
  const { members, teams } = store.state;
  const q = memberSearch.trim().toLowerCase();
  const filtered = members.filter((m) => !q || m.name.toLowerCase().includes(q) || (m.notes || '').toLowerCase().includes(q));

  root.innerHTML = `
    <div class="panel">
      <div class="panel__head">
        <div>
          <h2>Equipos</h2>
          <p class="muted">Crea los equipos que hagan falta y asígnales a cada miembro.</p>
        </div>
        <div class="panel__head-actions">
          <button class="btn btn--ghost btn--sm" id="copyTeams" title="Copiar todos los equipos y miembros">📋 Copiar equipos</button>
          <button class="btn btn--primary" id="addTeam">＋ Añadir equipo</button>
        </div>
      </div>
      <div class="team-grid">
        ${teams.length === 0
          ? '<p class="muted">Aún no hay equipos creados.</p>'
          : teams
              .map((t) => {
                const count = teamMembers(t.id).length;
                return `
                <div class="team-card">
                  <div class="team-card__top">
                    <h3>${esc(t.name)}</h3>
                    <div class="row-actions">
                      <button class="icon-btn" data-copy-team="${t.id}" title="Copiar este equipo">📋</button>
                      <button class="icon-btn" data-edit-team="${t.id}" title="Renombrar">✏️</button>
                      <button class="icon-btn" data-del-team="${t.id}" title="Eliminar">🗑️</button>
                    </div>
                  </div>
                  <span class="team-card__count">${count} ${count === 1 ? 'miembro' : 'miembros'}</span>
                  <ul class="team-card__list">
                    ${count === 0 ? '<li class="muted">Sin miembros asignados</li>' : teamMembers(t.id).map((m) => `<li>${esc(m.name)}</li>`).join('')}
                  </ul>
                </div>`;
              })
              .join('')}
      </div>
    </div>

    <div class="panel">
      <div class="panel__head">
        <div>
          <h2>Miembros</h2>
          <p class="muted">Nombres y el rol (equipo) que desempeñan en el desayuno.</p>
        </div>
        <div class="panel__head-actions">
          <input class="input input--search" id="memberSearch" type="search" placeholder="🔍 Buscar miembro…" value="${esc(memberSearch)}" />
          <button class="btn btn--primary" id="addMember">＋ Añadir miembro</button>
        </div>
      </div>

      ${filtered.length === 0
        ? emptyState({
            icon: '👥',
            title: members.length ? 'Sin resultados' : 'Aún no hay miembros',
            text: members.length ? 'Prueba con otra búsqueda.' : 'Registra a las personas y el equipo al que pertenecen.',
            action: members.length ? '' : '<button class="btn btn--primary" id="addMemberEmpty">＋ Añadir miembro</button>',
          })
        : `<div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>Nombre</th><th>Equipo / rol</th><th>Contacto</th><th>Notas</th><th></th></tr>
              </thead>
              <tbody>
                ${filtered
                  .map((m) => {
                    const team = teamById(m.teamId);
                    return `
                    <tr>
                      <td><div class="cell-title">${esc(m.name)}</div></td>
                      <td>${team ? `<span class="tag tag--team">${esc(team.name)}</span>` : '<span class="muted">Sin equipo</span>'}</td>
                      <td>${[m.phone, m.email].filter(Boolean).map((v) => `<div class="cell-sub">${esc(v)}</div>`).join('') || '<span class="muted">—</span>'}</td>
                      <td>${m.notes ? `<span class="cell-sub">${esc(m.notes)}</span>` : '—'}</td>
                      <td class="row-actions">
                        <button class="icon-btn" data-edit-member="${m.id}" title="Editar">✏️</button>
                        <button class="icon-btn" data-del-member="${m.id}" title="Eliminar">🗑️</button>
                      </td>
                    </tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>`}
    </div>
  `;

  root.querySelector('#memberSearch')?.addEventListener('input', (e) => {
    memberSearch = e.target.value;
    renderMiembros(root);
    const el = root.querySelector('#memberSearch');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });

  root.querySelector('#addTeam')?.addEventListener('click', () => openTeamForm());
  root.querySelector('#copyTeams')?.addEventListener('click', () => copyText(allTeamsText(), 'Equipos copiados ✅'));
  root.querySelectorAll('[data-copy-team]').forEach((b) =>
    b.addEventListener('click', () => copyText(teamText(b.dataset.copyTeam), 'Equipo copiado ✅'))
  );
  root.querySelector('#addMember')?.addEventListener('click', () => openMemberForm());
  root.querySelector('#addMemberEmpty')?.addEventListener('click', () => openMemberForm());

  root.querySelectorAll('[data-edit-team]').forEach((b) => b.addEventListener('click', () => openTeamForm(b.dataset.editTeam)));
  root.querySelectorAll('[data-del-team]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = teamById(b.dataset.delTeam);
      if (!t) return;
      const count = teamMembers(t.id).length;
      const msg = count
        ? `El equipo "${t.name}" tiene ${count} miembro(s). Se quedarán sin equipo asignado. ¿Continuar?`
        : `¿Eliminar el equipo "${t.name}"?`;
      if (confirmDialog(msg)) {
        store.update((s) => {
          s.teams = s.teams.filter((x) => x.id !== t.id);
          s.members.forEach((m) => {
            if (m.teamId === t.id) m.teamId = '';
          });
        });
        toast('Equipo eliminado');
        renderMiembros(root);
      }
    })
  );

  root.querySelectorAll('[data-edit-member]').forEach((b) => b.addEventListener('click', () => openMemberForm(b.dataset.editMember)));
  root.querySelectorAll('[data-del-member]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = memberById(b.dataset.delMember);
      if (!m) return;
      if (confirmDialog(`¿Eliminar a ${m.name}?`)) {
        store.update((s) => {
          s.members = s.members.filter((x) => x.id !== m.id);
          s.events.forEach((e) => {
            e.memberIds = (e.memberIds || []).filter((id) => id !== m.id);
          });
        });
        toast('Miembro eliminado');
        renderMiembros(root);
      }
    })
  );
}

/* ---------- Copiar como texto (WhatsApp, etc.) ---------- */

function teamLines(t) {
  const list = teamMembers(t.id);
  const lines = [`👥 *${t.name}* (${list.length})`];
  if (list.length) list.forEach((m) => lines.push(`• ${m.name}`));
  else lines.push('(sin miembros asignados)');
  return lines;
}

function teamText(teamId) {
  const team = teamById(teamId);
  return team ? teamLines(team).join('\n') : '';
}

function allTeamsText() {
  const { teams, members } = store.state;
  const today = new Date().toLocaleDateString('es-ES');
  const lines = [`🤝 *EQUIPOS · Desayunos Hospital del Niño* (${today})`];
  teams.forEach((t) => {
    lines.push('');
    lines.push(...teamLines(t));
  });
  const orphans = members.filter((m) => !m.teamId || !teamById(m.teamId));
  if (orphans.length) {
    lines.push('');
    lines.push(`👥 *Sin equipo* (${orphans.length})`);
    orphans.forEach((m) => lines.push(`• ${m.name}`));
  }
  return lines.join('\n');
}

async function openTeamForm(id) {
  const existing = id ? teamById(id) : null;
  const saved = await openModal({
    title: existing ? 'Renombrar equipo' : 'Añadir equipo',
    body: field({ label: 'Nombre del equipo', name: 'name', required: true, value: existing?.name || '', placeholder: 'Ej. Equipo de cocina' }),
    saveLabel: existing ? 'Guardar cambios' : 'Crear equipo',
    onSubmit: (data) => {
      const name = (data.name || '').trim();
      if (!name) {
        toast('Escribe un nombre para el equipo', 'error');
        return false;
      }
      store.update((s) => {
        if (existing) {
          const t = s.teams.find((x) => x.id === existing.id);
          t.name = name;
        } else {
          s.teams.push({ id: store.uid(), name });
        }
      });
      toast(existing ? 'Equipo actualizado' : 'Equipo creado');
      return true;
    },
  });
  if (saved) renderMiembros(document.getElementById('view'));
}

async function openMemberForm(id) {
  const { teams } = store.state;
  const existing = id ? memberById(id) : null;

  if (teams.length === 0) {
    toast('Primero crea al menos un equipo', 'error');
    return;
  }

  const teamOptions = [{ value: '', label: '— Sin equipo —' }, ...teams.map((t) => ({ value: t.id, label: t.name }))];
  const selectedTeam = existing?.teamId || teams[0].id;

  const body = grid(
    'form-grid',
    field({ label: 'Nombre completo', name: 'name', required: true, value: existing?.name || '', placeholder: 'Ej. María López' }) +
      field({ label: 'Equipo / rol', name: 'teamId', type: 'select', value: selectedTeam, options: teamOptions }) +
      field({ label: 'Teléfono', name: 'phone', value: existing?.phone || '', placeholder: 'Opcional' }) +
      field({ label: 'Correo', name: 'email', type: 'email', value: existing?.email || '', placeholder: 'Opcional' }) +
      field({ label: 'Notas', name: 'notes', type: 'textarea', value: existing?.notes || '', placeholder: 'Disponibilidad, observaciones…' })
  );

  const saved = await openModal({
    title: existing ? 'Editar miembro' : 'Añadir miembro',
    body,
    onSubmit: (data) => {
      const name = (data.name || '').trim();
      if (!name) {
        toast('Escribe el nombre del miembro', 'error');
        return false;
      }
      store.update((s) => {
        const payload = {
          name,
          teamId: data.teamId || '',
          phone: (data.phone || '').trim(),
          email: (data.email || '').trim(),
          notes: (data.notes || '').trim(),
        };
        if (existing) {
          Object.assign(s.members.find((x) => x.id === existing.id), payload);
        } else {
          s.members.push({ id: store.uid(), ...payload });
        }
      });
      toast(existing ? 'Miembro actualizado' : 'Miembro añadido');
      return true;
    },
  });
  if (saved) renderMiembros(document.getElementById('view'));
}
