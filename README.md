# Gestor de Voluntariado · Desayunos Hospital del Niño

Aplicación web sencilla (HTML + CSS + JavaScript puro, sin dependencias) para organizar los
desayunos de voluntariado en el Hospital del Niño.

## Cómo abrirlo

Doble clic en `index.html` funciona, pero los módulos de JavaScript (`type="module"`)
requieren servidor. La forma más fácil:

```bash
python -m http.server 8777
# y abrir http://127.0.0.1:8777/index.html
```

Los datos se guardan automáticamente en el `localStorage` del navegador.
En el menú lateral hay botones para **exportar** una copia de seguridad en JSON e **importarla**.

## Secciones

### 🥐 Desayunos (menú 1)
- Tarjetas con estadísticas: próximo desayuno, totales, voluntarios y stock bajo.
- Crear desayunos con: título, fecha, área/sala del hospital, nº de personas, estado y notas.
- Productos necesarios: se eligen del inventario con su cantidad.
- Equipo asignado: se marcan los miembros agrupados por equipo.
- Estados (chips): Planificado · En curso · Realizado · Cancelado.
- Botón **Descontar del inventario**: baja las cantidades usadas (con aviso si no hay stock)
  y **Devolver al inventario** si te equivocaste.

### 📦 Inventario
- Producto, categoría, cantidad actual, unidad, cantidad mínima y notas.
- Categorías: Alimentos, Servilletas y desechables, Guantes e higiene,
  Equipo (cafeteras, ollas), Limpieza, Otros.
- Botones `−` / `＋` para ajustar cantidades rápidamente.
- Aviso automático **"Reponer"** cuando la cantidad llega a la mínima.
- Búsqueda por nombre y filtro por categoría.

### 👥 Miembros y equipos
- Equipos por defecto: compras, elaboración, transporte y reparto… y puedes **crear los tuyos**.
- Miembros con nombre, equipo/rol, teléfono, correo y notas.
- Cada equipo muestra su lista de miembros.

### 💲 Buscar precios (futuro)
- Sección reservada para comparar precios en tiendas. Es la parte más compleja
  (hay que extraer precios de las páginas de cada tienda), así que queda para después.

## Estructura

```
index.html          · maquetación, menú lateral y modal
css/styles.css      · estilos, diseño responsive
js/app.js           · rutas (#/desayunos, #/inventario…) y exportar/importar
js/store.js         · estado + guardado en localStorage
js/ui.js            · utilidades (modal, toast, campos, formato)
js/views/*.js       · vistas de cada sección
```
