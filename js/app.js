import { store } from './store.js';
import { toast, confirmDialog } from './ui.js';
import { renderDesayunos } from './views/desayunos.js';
import { renderInventario } from './views/inventario.js';
import { renderCompras } from './views/compras.js';
import { renderMiembros } from './views/miembros.js';
import { renderGraficas } from './views/graficas.js';
import { renderFotos } from './views/fotos.js';
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
  compras: {
    title: 'Lista de compras',
    subtitle: 'Ve marcando lo que compras; lo hecho queda tachado',
    render: renderCompras,
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
  fotos: {
    title: 'Fotos y collage',
    subtitle: 'Una foto por desayuno, con su pie, y collage listo para redes',
    render: renderFotos,
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
  // El hash puede llevar parámetros (#/fotos?ev=ID): la ruta es lo primero.
  const hash = location.hash.replace(/^#\//, '').split('?')[0];
  return ROUTES[hash] ? hash : 'desayunos';
}

let lastRenderedRoute = null;

function render() {
  const key = currentRoute();
  const route = ROUTES[key];
  const routeChanged = key !== lastRenderedRoute;
  lastRenderedRoute = key;

  titleEl.textContent = route.title;
  subtitleEl.textContent = route.subtitle;
  document.getElementById('srHeading').textContent = route.title;
  document.title = `${route.title} · Gestor de Voluntariado`;

  document.querySelectorAll('#nav .nav__item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.route === key);
  });

  // Las vistas ya conservan scroll y foco (rerender). Al cambiar de sección
  // volvemos al principio; en un cambio de datos NO: en móvil se notaba como
  // un salto al tope cada vez que tocábamos un campo.
  route.render(viewEl);
  if (routeChanged) {
    viewEl.scrollTop = 0;
    window.scrollTo({ top: 0 });
  }
}

/* Navegación */
window.addEventListener('hashchange', render);

if (!location.hash) location.hash = '#/desayunos';

const sidebarEl = document.getElementById('sidebar');

document.getElementById('menuToggle').addEventListener('click', () => {
  sidebarEl.classList.toggle('is-open');
});

/* Móvil: el menú se puede cerrar con el botón ✕, tocando fuera o con Escape */
document.getElementById('sidebarClose').addEventListener('click', () => sidebarEl.classList.remove('is-open'));

document.querySelector('.main').addEventListener('click', (e) => {
  if (e.target.closest('#menuToggle')) return; // el propio botón ya abre/cierra
  sidebarEl.classList.remove('is-open');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') sidebarEl.classList.remove('is-open');
});

document.getElementById('nav').addEventListener('click', (e) => {
  if (e.target.closest('.nav__item')) sidebarEl.classList.remove('is-open');
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

/* ---------- PWA: instalación y uso sin conexión ---------- */

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .catch((err) => console.warn('Service worker no disponible:', err));
  });
}

let installPrompt = null;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  toast('App instalada en el dispositivo ✅');
});

const offlineHint = document.getElementById('offlineHint');
function updateOnlineState() {
  offlineHint.hidden = navigator.onLine;
}
window.addEventListener('online', updateOnlineState);
window.addEventListener('offline', updateOnlineState);
updateOnlineState();
