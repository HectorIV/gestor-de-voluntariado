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

function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    teams: Array.isArray(raw.teams) ? raw.teams : base.teams,
    members: Array.isArray(raw.members) ? raw.members : [],
    inventory: Array.isArray(raw.inventory) ? raw.inventory : [],
    events: Array.isArray(raw.events) ? raw.events : [],
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

export function lowStockItems() {
  return state.inventory.filter((p) => Number(p.qty) <= Number(p.min || 0));
}

export function upcomingEvents() {
  return [...state.events]
    .filter((e) => e.status !== 'realizado' && e.status !== 'cancelado')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function teamMembers(teamId) {
  return state.members.filter((m) => m.teamId === teamId);
}
