const STORAGE_KEY = 'gestor-voluntariado-v1';

const DEFAULT_TEAMS = [
  'Equipo de compras',
  'Elaboración del desayuno',
  'Equipo de transporte',
  'Equipo de reparto',
];

function uid() {
  return (self.crypto && self.crypto.randomUUID)
    ? self.crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function defaultState() {
  return {
    teams: DEFAULT_TEAMS.map((name) => ({ id: uid(), name })),
    members: [],
    inventory: [],
    events: [],
    shopping: [],
    recurring: [],
    categories: [
      'Alimentos',
      'Servilletas y desechables',
      'Guantes e higiene',
      'Equipo (cafeteras, ollas)',
      'Limpieza',
      'Otros',
    ],
    settings: {
      hospital: 'Hospital del Niño',
    },
  };
}

/** Normaliza los equipos de un miembro a array (antes era un solo teamId). */
function migrateMembers(members) {
  return members.map((m) => {
    const nm = { ...m };
    if (!Array.isArray(nm.teamIds)) nm.teamIds = nm.teamId ? [nm.teamId] : [];
    delete nm.teamId; // antiguo campo de un solo equipo
    return nm;
  });
}

/**
 * Si los datos son antiguos y aún no existe la lista de recurrentes, se siembra
 * con lo que ya estaba en la lista de compras (a mano), para verla desde el primer momento.
 */
function seedRecurring(raw) {
  const list = raw && Array.isArray(raw.shopping) ? raw.shopping : [];
  const out = [];
  const seen = new Set();
  list.forEach((it) => {
    const name = String(it.name || '').trim();
    const key = name.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      id: uid(),
      name,
      qty: Math.max(0, Number(it.qty) || 0),
      unit: it.unit || '',
      category: it.category || 'Otros',
      times: 1,
    });
  });
  return out;
}

function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    teams: Array.isArray(raw.teams) ? raw.teams : base.teams,
    members: migrateMembers(Array.isArray(raw.members) ? raw.members : []),
    inventory: Array.isArray(raw.inventory) ? raw.inventory : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    shopping: Array.isArray(raw.shopping) ? raw.shopping : [],
    recurring: Array.isArray(raw.recurring) ? raw.recurring : seedRecurring(raw),
    categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : base.categories,
    settings: { ...base.settings, ...(raw.settings || {}) },
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch (err) {
    console.error('No se pudo leer el guardado:', err);
    return defaultState();
  }
}

const listeners = new Set();

export const store = {
  get state() {
    return state;
  },
  uid,
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('No se pudo guardar:', err);
    }
    listeners.forEach((fn) => fn(state));
  },
  update(mutator) {
    mutator(state);
    store.save();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  replace(newState) {
    state = migrate(newState);
    store.save();
  },
  reset() {
    state = defaultState();
    store.save();
  },
};

/* ---------- Selectores ---------- */

export function teamById(id) {
  return state.teams.find((t) => t.id === id);
}

export function productById(id) {
  return state.inventory.find((p) => p.id === id);
}

export function memberById(id) {
  return state.members.find((m) => m.id === id);
}

/**
 * Estado de un producto:
 *  - 'falta' si está por debajo del mínimo, o marcado a mano como falta.
 *  - 'ok' si llega al mínimo (la igualdad ya cumple) o está marcado a mano como completo.
 * El marcado manual (p.flag) tiene prioridad sobre los números.
 */
export function productStatus(p) {
  if (p.flag === 'completo') return 'ok';
  if (p.flag === 'falta') return 'falta';
  return Number(p.qty) < Number(p.min || 0) ? 'falta' : 'ok';
}

export function isMissing(p) {
  return productStatus(p) === 'falta';
}

/** Marca/desmarca a mano ('falta' | 'completo' | null para volver a lo automático). */
export function setFlag(p, flag) {
  p.flag = flag || null;
}

/** Cambia la cantidad y vuelve al estado automático (borra marcas manuales). */
export function setQty(p, qty) {
  p.qty = Math.max(0, Number(qty) || 0);
  p.flag = null;
  p.bought = false;
}

export function lowStockItems() {
  return state.inventory.filter((p) => productStatus(p) === 'falta');
}

/**
 * Apunta un producto como recurrente para reutilizarlo en Compras.
 * Si ya existía, sube su contador de veces y actualiza los datos; si no, lo crea.
 * @param {object} s estado (para usar dentro de store.update)
 * @param {{name: string, qty?: number, unit?: string, category?: string}} item
 */
export function noteRecurring(s, item) {
  const name = String((item && item.name) || '').trim();
  if (!name) return;
  if (!Array.isArray(s.recurring)) s.recurring = [];
  const key = name.toLowerCase();
  const found = s.recurring.find((r) => String(r.name || '').trim().toLowerCase() === key);
  if (found) {
    found.times = (Number(found.times) || 1) + 1;
    if (Number(item.qty)) found.qty = Math.max(0, Number(item.qty));
    if (item.unit) found.unit = item.unit;
    if (item.category) found.category = item.category;
    return;
  }
  s.recurring.push({
    id: uid(),
    name,
    qty: Math.max(0, Number(item.qty) || 0),
    unit: item.unit || '',
    category: item.category || 'Otros',
    times: 1,
  });
}

/** Recurrentes ordenados por veces usados (lo más repetido primero). */
export function recurringItems() {
  return [...(Array.isArray(state.recurring) ? state.recurring : [])].sort(
    (a, b) => (Number(b.times) || 0) - (Number(a.times) || 0)
  );
}

export function upcomingEvents() {
  return [...state.events]
    .filter((e) => e.status !== 'realizado' && e.status !== 'cancelado')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/**
 * IDs de equipo de un miembro: puede pertenecer a varios.
 * Tolera datos antiguos con un único teamId.
 */
export function memberTeamIds(m) {
  if (Array.isArray(m.teamIds)) return m.teamIds;
  return m.teamId ? [m.teamId] : [];
}

/** Equipos (objetos) de un miembro, descartando los que ya no existan. */
export function teamsOfMember(m) {
  return memberTeamIds(m).map((id) => teamById(id)).filter(Boolean);
}

/** true si el miembro no pertenece a ningún equipo existente. */
export function isTeamless(m) {
  return teamsOfMember(m).length === 0;
}

export function teamMembers(teamId) {
  return state.members.filter((m) => memberTeamIds(m).includes(teamId));
}
