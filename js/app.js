import { store } from './store.js';
import { toast, confirmDialog } from './ui.js';
import { renderDesayunos } from './views/desayunos.js';
import { renderInventario } from './views/inventario.js';
import { renderMiembros } from './views/miembros.js';
import { renderGraficas } from './views/graficas.js';
import { renderPrecios } from './views/precios.js';

const ROUTES = {
  desayunos: {
    title: 'Desayunos',
    subtitle: 'Gestión de desayunos en el Hospital del Niño',
    render: renderDesayunos,
  },
  inventario: {
    title: 'Inventario',
    subtitle: 'Comida, servilletas, guantes, cafeteras y todo lo necesario',
    render: renderInventario,
  },
  miembros: {
    title: 'Miembros y equipos',
    subtitle: 'Quién compra, elabora, transporta y reparte',
    render: renderMiembros,
  },
  graficas: {
    title: 'Gráficas',
    subtitle: 'Retroalimentación gráfica de la actividad',
    render: renderGraficas,
  },
  precios: {
    title: 'Buscar precios',
    subtitle: 'Comparación de precios en tiendas (fase futura)',
    render: renderPrecios,
  },
};

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('viewTitle');
const subtitleEl = document.getElementById('viewSubtitle');

function currentRoute() {
  const hash = location.hash.replace(/^#\//, '');
  return ROUTES[hash] ? hash : 'desayunos';
}

function render() {
  const key = currentRoute();
  const route = ROUTES[key];

  titleEl.textContent = route.title;
  subtitleEl.textContent = route.subtitle;
  document.title = `${route.title} · Gestor de Voluntariado`;

  document.querySelectorAll('#nav .nav__item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.route === key);
  });

  route.render(viewEl);
  viewEl.scrollTop = 0;
  window.scrollTo({ top: 0 });
}

/* Navegación */
window.addEventListener('hashchange', render);

if (!location.hash) location.hash = '#/desayunos';

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('is-open');
});

document.getElementById('nav').addEventListener('click', (e) => {
  if (e.target.closest('.nav__item')) document.getElementById('sidebar').classList.remove('is-open');
});

/* Exportar / importar */
document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `voluntariado-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Copia de seguridad descargada');
});

document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!confirmDialog('Esto reemplazará los datos actuales con los del archivo. ¿Continuar?')) return;
      store.replace(data);
      toast('Datos importados correctamente');
      render();
    } catch {
      toast('El archivo no es válido', 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

/* Estado inicial + re-render ante cambios del store */
store.subscribe(() => render());
render();
