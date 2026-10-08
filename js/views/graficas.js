import { store, lowStockItems, productStatus, memberTeamIds } from '../store.js';
import { esc, statCard, formatDate, formatNumber, rerender } from '../ui.js';
import { estimateEvent } from '../prices.js';

const PALETTE = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be123c', '#4d7c0f', '#9333ea'];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

let period = '6'; // meses visibles en las gráficas mensuales

export function renderGraficas(root) {
  rerender(() => drawGraficas(root));
}

function drawGraficas(root) {
  const { events, members, teams, inventory } = store.state;
  const active = events.filter((e) => e.status !== 'cancelado');
  const done = events.filter((e) => e.status === 'realizado');
  const low = lowStockItems();
  const personas = done.reduce((sum, e) => sum + Number(e.people || 0), 0);

  const hasData = events.length || members.length || inventory.length;

  if (!hasData) {
    root.innerHTML = `
      <div class="empty">
        <div class="empty__icon">📊</div>
        <h3>Todavía no hay datos que gráficar</h3>
        <p>En cuanto registres desayunos, productos y miembros, aquí verás el resumen de la actividad.</p>
        <a class="btn btn--primary" href="#/desayunos">Ir a desayunos</a>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="stats">
      ${statCard({ label: 'Desayunos', value: String(events.length), hint: `${done.length} realizados`, tone: 'primary' })}
      ${statCard({ label: 'Personas servidas', value: formatNumber(personas), hint: 'en desayunos realizados' })}
      ${gastoMedioCard(events, store.state.prices, inventory)}
      ${statCard({ label: 'Voluntarios', value: String(members.length), hint: `${teams.length} equipos` })}
      ${statCard({ label: 'Stock bajo', value: String(low.length), hint: low.length ? 'productos a reponer' : 'todo en orden', tone: low.length ? 'danger' : '' })}
    </div>

    <div class="toolbar">
      <span class="toolbar__hint">Retroalimentación de la actividad · Hospital del Niño</span>
      <label class="field field--inline">
        <span class="field__label">Periodo</span>
        <select class="input input--filter" id="period">
          <option value="3" ${period === '3' ? 'selected' : ''}>Últimos 3 meses</option>
          <option value="6" ${period === '6' ? 'selected' : ''}>Últimos 6 meses</option>
          <option value="12" ${period === '12' ? 'selected' : ''}>Últimos 12 meses</option>
          <option value="todo" ${period === 'todo' ? 'selected' : ''}>Todo</option>
        </select>
      </label>
    </div>

    <div class="chart-grid">
      ${chartCard('Desayunos por mes', 'cantidad de eventos programados', barsVertical(monthKeys(events, period).map((k) => ({
        label: monthLabel(k),
        value: active.filter((e) => (e.date || '').startsWith(k)).length,
        title: `${monthLong(k)}: ${active.filter((e) => (e.date || '').startsWith(k)).length} desayunos`,
      }))))}

      ${chartCard('Personas atendidas por mes', 'según los desayunos realizados', barsVertical(monthKeys(events, period).map((k) => {
        const value = done.filter((e) => (e.date || '').startsWith(k)).reduce((s, e) => s + Number(e.people || 0), 0);
        return { label: monthLabel(k), value, title: `${monthLong(k)}: ${value} personas` };
      })))}

      ${chartCard('Estado de los desayunos', `${events.length} en total`, donut(
        statusSeries(events)
      ))}

      ${(() => {
        const n = members.length;
        const total = `${n} ${n === 1 ? 'voluntario' : 'voluntarios'}`;
        return chartCard(
          'Miembros por equipo',
          members.some((m) => memberTeamIds(m).length > 1) ? `${total} · algunos cuentan en varios equipos` : total,
          horizontalBars(teamSeries(teams, members))
        );
      })()}

      ${chartCard('Productos más usados', 'según lo consumido en los desayunos', horizontalBars(
        productUsage(active, inventory)
      ))}

      ${chartCard('Stock actual del inventario', 'la línea marca la cantidad mínima', stockBars(inventory))}

      ${chartCard(
        'Gasto por desayuno',
        'coste estimado con los precios guardados',
        gastoChart(events, store.state.prices, inventory)
      )}

      ${chartCard(
        'Desviación del presupuesto',
        'cuánto se pasó o sobró en cada desayuno',
        desviacionChart(events, store.state.prices, inventory)
      )}
    </div>
  `;

  root.querySelector('#period')?.addEventListener('change', (e) => {
    period = e.target.value;
    renderGraficas(root);
  });
}

/* ---------- Piezas ---------- */

function chartCard(title, subtitle, body) {
  return `
    <section class="chart-card">
      <header class="chart-card__head">
        <h3>${esc(title)}</h3>
        <span>${esc(subtitle)}</span>
      </header>
      <div class="chart-card__body">${body}</div>
    </section>`;
}

function barsVertical(items) {
  const max = Math.max(...items.map((i) => i.value), 0);
  if (!max) return '<p class="muted chart-empty">Sin datos en este periodo.</p>';
  return `
    <div class="vbars">
      ${items
        .map(
          (i) => `
        <div class="vbar" title="${esc(i.title)}">
          <span class="vbar__value">${i.value ? formatNumber(i.value) : ''}</span>
          <div class="vbar__track">
            <div class="vbar__fill ${i.value ? '' : 'is-zero'}" style="height:${i.value ? Math.max(4, (i.value / max) * 100) : 100}%"></div>
          </div>
          <span class="vbar__label">${esc(i.label)}</span>
        </div>`
        )
        .join('')}
    </div>`;
}

function horizontalBars(items) {
  const visible = items.filter((i) => i.value > 0);
  if (!visible.length) return '<p class="muted chart-empty">Sin datos todavía.</p>';
  const max = Math.max(...visible.map((i) => i.value));
  return `
    <div class="hbars">
      ${items
        .map((i) => {
          const pct = max ? (i.value / max) * 100 : 0;
          return `
          <div class="hbar ${i.value ? '' : 'is-empty'}" title="${esc(i.title || `${i.label}: ${i.value}`)}">
            <span class="hbar__label">${esc(i.label)}</span>
            <div class="hbar__track">
              <div class="hbar__fill" style="width:${pct}%;background:${i.color || 'var(--primary)'}"></div>
            </div>
            <span class="hbar__value">${formatNumber(i.value)}</span>
          </div>`;
        })
        .join('')}
    </div>`;
}

/* ---------- Gasto y presupuesto ---------- */

function gastoMedioCard(events, prices, inventory) {
  const gastos = events
    .filter((e) => e.status !== 'cancelado')
    .map((e) => estimateEvent(e, prices, inventory))
    .filter((est) => est.withPrice > 0);
  if (!gastos.length) return '';
  const media = gastos.reduce((s, e) => s + e.total, 0) / gastos.length;
  const conPresupuesto = events.filter((e) => Number(e.budget) > 0).length;
  return statCard({
    label: 'Gasto medio',
    value: `$${media.toFixed(2)}`,
    hint: `${gastos.length} desayuno${gastos.length === 1 ? '' : 's'} estimados${conPresupuesto ? ` · ${conPresupuesto} con presupuesto` : ''}`,
    tone: 'primary',
  });
}

/** Columnas de coste estimado, con la marca del presupuesto de cada desayuno. */
function gastoChart(events, prices, inventory) {
  const rows = [...events]
    .filter((e) => e.status !== 'cancelado')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(-10)
    .map((e) => ({ ev: e, est: estimateEvent(e, prices, inventory), budget: Math.max(0, Number(e.budget) || 0) }))
    .filter((r) => r.est.withPrice > 0);

  if (!rows.length) {
    return '<p class="muted chart-empty">Todavía no hay precios guardados. Añádelos en la sección 💲 Precios para ver el gasto.</p>';
  }

  const max = Math.max(...rows.map((r) => Math.max(r.est.total, r.budget)), 0.01);

  return `
    <div class="gasto">
      ${rows
        .map((r) => {
          const over = r.budget > 0 && r.est.total > r.budget;
          return `
          <div class="gasto__col" title="${esc(r.ev.title)} · ${formatDate(r.ev.date)}: estimado $${r.est.total.toFixed(2)}${r.budget ? `, presupuesto $${r.budget.toFixed(2)}` : ''}">
            <div class="gasto__track">
              ${
                r.budget
                  ? `<span class="gasto__mark" style="bottom:${(r.budget / max) * 100}%" title="Presupuesto $${r.budget.toFixed(2)}"></span>`
                  : ''
              }
              <div class="gasto__bar ${over ? 'is-over' : ''}" style="height:${Math.max(3, (r.est.total / max) * 100)}%"></div>
            </div>
            <span class="gasto__label">$${r.est.total.toFixed(0)}</span>
          </div>`;
        })
        .join('')}
    </div>
    <p class="chart-legend">
      <span class="dot"></span> coste estimado
      <span class="gasto__mark gasto__mark--legend"></span> presupuesto del desayuno
    </p>`;
}

/** Barra por desayuno: negativo = se pasó del presupuesto, positivo = sobró. */
function desviacionChart(events, prices, inventory) {
  const rows = [...events]
    .filter((e) => e.status !== 'cancelado' && Number(e.budget) > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(-10)
    .map((e) => {
      const est = estimateEvent(e, prices, inventory);
      return { ev: e, diff: Math.max(0, Number(e.budget) || 0) - est.total, est };
    })
    .filter((r) => r.est.withPrice > 0);

  if (!rows.length) {
    return '<p class="muted chart-empty">Hacen falta desayunos con presupuesto y precios guardados.</p>';
  }

  const max = Math.max(...rows.map((r) => Math.abs(r.diff)), 0.01);

  return `
    <div class="hbars hbars--split">
      ${rows
        .map((r) => {
          const pct = (Math.abs(r.diff) / max) * 50;
          const over = r.diff < 0;
          return `
          <div class="hbar hbar--split" title="${esc(r.ev.title)} · ${formatDate(r.ev.date)}: ${over ? 'se pasó' : 'sobró'} $${Math.abs(r.diff).toFixed(2)}">
            <span class="hbar__label">${esc(r.ev.title).slice(0, 22)}</span>
            <div class="hbar__split">
              <span class="hbar__split-neg" style="width:50%"></span>
              <span class="hbar__split-pos" style="width:50%"></span>
              <span class="hbar__split-fill ${over ? 'is-over' : ''}" style="${over ? 'right' : 'left'}:50%;width:${pct}%"></span>
            </div>
            <span class="hbar__value">${over ? '-' : '+'}$${Math.abs(r.diff).toFixed(0)}</span>
          </div>`;
        })
        .join('')}
    </div>
    <p class="chart-legend"><span class="dot dot--danger"></span> se pasó <span class="dot"></span> sobró</p>`;
}

function stockBars(inventory) {  if (!inventory.length) return '<p class="muted chart-empty">El inventario está vacío.</p>';
  const max = Math.max(...inventory.map((p) => Math.max(Number(p.qty), Number(p.min || 0))), 1);
  return `
    <div class="hbars">
      ${inventory
        .map((p) => {
          const qty = Number(p.qty);
          const min = Number(p.min || 0);
          const low = productStatus(p) === 'falta';
          return `
          <div class="hbar ${low ? 'is-low' : ''}" title="${esc(p.name)}: ${formatNumber(qty)} ${esc(p.unit || 'u.')} (mínimo ${formatNumber(min)})">
            <span class="hbar__label">${esc(p.name)}</span>
            <div class="hbar__track">
              <div class="hbar__fill" style="width:${(qty / max) * 100}%;background:${low ? 'var(--danger)' : 'var(--primary)'}"></div>
              ${min ? `<span class="hbar__min" style="left:${(min / max) * 100}%" title="Mínimo: ${formatNumber(min)}"></span>` : ''}
            </div>
            <span class="hbar__value">${formatNumber(qty)}</span>
          </div>`;
        })
        .join('')}
    </div>
    <p class="chart-legend"><span class="dot dot--danger"></span> bajo mínimo <span class="dot"></span> con stock</p>`;
}

function donut(series) {
  const total = series.reduce((s, x) => s + x.value, 0);
  if (!total) return '<p class="muted chart-empty">Sin desayunos registrados.</p>';

  const R = 60;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const rings = series
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const seg = `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${s.color}" stroke-width="24"
        stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}"
        stroke-dashoffset="${(-acc * C).toFixed(2)}" />`;
      acc += frac;
      return seg;
    })
    .join('');

  const pct = Math.round((series.find((s) => s.key === 'realizado')?.value || 0) / total * 100);

  return `
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 160 160" role="img" aria-label="Estado de los desayunos">
        <g transform="rotate(-90 80 80)">${rings}</g>
        <text x="80" y="76" text-anchor="middle" class="donut__big">${pct}%</text>
        <text x="80" y="96" text-anchor="middle" class="donut__small">realizados</text>
      </svg>
      <ul class="legend">
        ${series
          .map(
            (s) => `
          <li><span class="dot" style="background:${s.color}"></span>${esc(s.label)} <strong>${s.value}</strong></li>`
          )
          .join('')}
      </ul>
    </div>`;
}

/* ---------- Datos ---------- */

function statusSeries(events) {
  const counts = { planificado: 0, 'en-curso': 0, realizado: 0, cancelado: 0 };
  events.forEach((e) => {
    counts[e.status] = (counts[e.status] || 0) + 1;
  });
  return [
    { key: 'realizado', label: 'Realizado', color: '#17803d', value: counts.realizado },
    { key: 'planificado', label: 'Planificado', color: '#2563eb', value: counts.planificado },
    { key: 'en-curso', label: 'En curso', color: '#d97700', value: counts['en-curso'] },
    { key: 'cancelado', label: 'Cancelado', color: '#94a3b8', value: counts.cancelado },
  ];
}

function teamSeries(teams, members) {
  const list = teams.map((t, i) => ({
    label: t.name,
    value: members.filter((m) => memberTeamIds(m).includes(t.id)).length,
    color: PALETTE[i % PALETTE.length],
  }));
  const orphan = members.filter((m) => !memberTeamIds(m).some((id) => teams.some((t) => t.id === id))).length;
  if (orphan) list.push({ label: 'Sin equipo', value: orphan, color: '#94a3b8' });
  return list;
}

function productUsage(events, inventory) {
  const usage = new Map();
  events.forEach((e) => {
    (e.items || []).forEach((it) => {
      const p = inventory.find((x) => x.id === it.productId);
      const name = p ? p.name : 'Producto eliminado';
      usage.set(name, (usage.get(name) || 0) + Number(it.qty || 0));
    });
  });
  if (!usage.size) return [];
  return [...usage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
}

function monthKeys(allEvents, p) {
  if (p === 'todo') {
    const keys = new Set(allEvents.map((e) => (e.date || '').slice(0, 7)).filter(Boolean));
    const sorted = [...keys].sort();
    return sorted.length > 18 ? sorted.slice(-18) : sorted;
  }
  const n = Number(p);
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const currentYear = new Date().getFullYear();
  return y === currentYear ? MESES[m - 1] : `${MESES[m - 1]} ${String(y).slice(2)}`;
}

function monthLong(key) {
  const [y, m] = key.split('-').map(Number);
  const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${names[m - 1]} de ${y}`;
}
