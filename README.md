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

En producción está publicada en **https://hectoriv.github.io/gestor-de-voluntariado/**

## Instalar como app (PWA) y modo sin conexión

La app es una **PWA**: se puede instalar en el ordenador o en el móvil y **funciona sin
internet**.

- **Instalar:** en Chrome/Edge aparece el botón **📱 Instalar app** en el menú lateral
  (o el candado/instalar de la barra de direcciones). En iPhone: *Compartir → Añadir a
  pantalla de inicio*.
- **Sin conexión:** el `sw.js` (service worker) guarda la app en caché; si no hay
  internet se muestra un aviso naranja 📴 en el menú y todo sigue funcionando.
- **Los datos se guardan** en el navegador (`localStorage`), también sin conexión, y
  sobreviven a cerrar la app. No se sincronizan entre dispositivos: usa **⬇ Exportar /
  ⬆ Importar** para pasarlos.
- Al cambiar la app, sube la versión en `sw.js` (`const VERSION = 'v10'`, …) para que
  los usuarios carguen la versión nueva sin cachés viejas.
- Los iconos se generan con `python tools/generate_icons.py` (requiere `pip install pillow`).

Los datos se guardan automáticamente en el `localStorage` del navegador.
En el menú lateral hay botones para **exportar** una copia de seguridad en JSON e **importarla**.
En móvil el menú se abre con **☰** y se cierra con **✕**, tocando fuera del menú o con **Escape**.

## Secciones

### 🥐 Desayunos (menú 1)
- Tarjetas con estadísticas: próximo desayuno, totales, voluntarios y stock bajo.
- Crear desayunos con: título, fecha, área/sala del hospital, nº de personas, estado y notas.
- Productos necesarios: se eligen del inventario con su cantidad.
- Equipo asignado: se marcan los miembros agrupados por equipo (cada uno aparece una
  sola vez, con etiquetas de los demás equipos a los que pertenece).
- Estados (chips): Planificado · En curso · Realizado · Cancelado.
- Botón **Descontar del inventario**: baja las cantidades usadas (con aviso si no hay stock)
  y **Devolver al inventario** si te equivocaste.
- **🏁 Cierre con uso real**: al terminar la actividad, anotas **lo realmente consumido** de
  cada producto y el inventario se ajusta solo:
  - lo que **sobra vuelve** automáticamente,
  - si algo **se acaba** (se usó más de lo que hay) se queda en 0, se avisa y se añade
    automáticamente a la **lista de compras** con la nota “Faltó en: …”,
  - el desayuno pasa a **Realizado** y la tarjeta muestra el resumen
    (`usado 4 de 6 · sobró 2`).
  - Se puede **reabrir y ajustar** cuantas veces haga falta (las cantidades se corrigen
    por diferencia) y **↩ Devolver** devuelve exactamente lo que se sacó.
- **📋 Copiar detalle**: el desayuno en texto plano (fecha, área, personas, productos,
  equipo por grupos y cierre con uso real) listo para pegar en WhatsApp.

### 📦 Inventario
- Producto, categoría, cantidad actual, unidad, cantidad mínima y notas.
- Categorías: Alimentos, Servilletas y desechables, Guantes e higiene,
  Equipo (cafeteras, ollas), Limpieza, Otros.
- **🧺 Lista típica**: alta masiva con lo de siempre (jugo, café, té, pan de molde,
  queso, mantequilla, jamón, galletas, ziplos medianos y grandes, servilletas, vasos,
  platos, guantes, cafetera, termo, hielo). Se marcan solo los que quieras; los que ya
  tienes aparecen como “ya está”. Entra con cantidad 0 y su mínimo, para verlo en “Reponer”.
- Al crear un producto, el nombre autocompleta categoría, unidad y mínimo (lista de sugerencias).
- Botones `−` / `＋` para ajustar cantidades rápidamente.
- Aviso automático **"Reponer"** cuando la cantidad baja **por debajo** del mínimo
  (llegar justo al mínimo ya cuenta como **Completo**).
- **Botón ✅ / ⚠️ en cada fila** para marcar a mano si **falta** o ya se **completó**,
  aunque los números digan otra cosa (aparece el aviso “a mano” y el botón ↩️ para
  volver al cálculo automático). Cambiar la cantidad con `−`/`＋` o desde el formulario
  también vuelve al estado automático.
- Búsqueda por nombre y filtro por categoría.
- **📋 Copiar lista** / **🔴 Faltantes**: copia el inventario como texto con formato
  de WhatsApp (negritas con *asteriscos*) para pegarlo en el grupo.
- Acceso rápido a **🛒 Compras** desde la propia barra de herramientas.

### 🛒 Compras (lista para el mercado)
- Se llena **sola**: entra todo lo que esté por debajo del mínimo (y lo marquen a mano
  como “falta”), agrupado por categoría con “hay X de Y”. Lo que **falte al cerrar un
  desayuno** entra solo, con la nota “Faltó en: …”.
- **Marca lo que compras** con la casilla y queda **tachado**; el estado se guarda y
  sigue ahí aunque cambies de sección o cierres la app.
- **＋ Añadir a la lista**: artículos sueltos que no están en el inventario
  (hielo, carbón, pan extra…) con cantidad, unidad y nota. Al escribir el nombre
  **autocompleta** con lo que ya existe (inventario y recurrentes).
- **🔁 Añadir rápido**: una tarjeta con pastillas para meter en la lista de un toque
  tanto los **productos del inventario** (con su “hay X de Y”) como los **recurrentes**
  (los artículos que más se repiten). Tiene filtro de búsqueda, no repite lo que ya
  está en la lista y cada vez que añades algo queda apuntado como recurrente.
- Botones: **✅ Marcar todo**, **🧹 Limpiar comprados** (borra los artículos sueltos
  comprados y destacha los del inventario) y **📋 Copiar lista** (☐/☑ en texto plano
  para pegar en WhatsApp).
- Accesos directos a **📦 Ver inventario** y viceversa.

### 👥 Miembros y equipos
- Equipos por defecto: compras, elaboración, transporte y reparto… y puedes **crear los tuyos**.
- Miembros con nombre, **uno o varios equipos**, teléfono, correo y notas.
- Cada equipo muestra su lista de miembros; **un miembro puede pertenecer a varios
  equipos** y aparecerá en todos ellos (al editar, marcas todas las casillas que
  correspondan).
- **📋 Copiar equipos** (todos los grupos con sus miembros) o el icono 📋 de cada tarjeta
  para copiar solo ese equipo y pegarlo en WhatsApp.

### 📊 Gráficas (retroalimentación)
- Tarjetas de resumen: desayunos, personas servidas, voluntarios y stock bajo.
- **Desayunos por mes** y **Personas atendidas por mes** (barras, con selector de
  periodo: 3 / 6 / 12 meses o todo).
- **Estado de los desayunos** en dona (realizado, planificado, en curso, cancelado).
- **Miembros por equipo** y **Productos más usados** (barras horizontales); quien está
  en varios equipos cuenta en cada uno de ellos.
- **Stock actual** con la línea vertical marcando la cantidad mínima de cada producto.
- Todo con datos reales de la app: si no hay nada registrado, muestra un aviso.

### 🖼 Fotos y collage
- Cada foto se guarda **dentro de su desayuno** (desde la tarjeta del desayuno con
  **🖼 Fotos** o desde esta sección eligiéndolo). Funciona sin internet: los bytes
  van a IndexedDB del propio navegador.
- **Galería en cuadrícula** con el pie de cada foto (qué hizo el equipo), que se
  puede cambiar después (✏️) y descargar una a una (⬇️).
- **Collage para redes**: eliges plantilla (**2×2**, **3×3** o **tira vertical**) y
  tamaño (**1080×1080** cuadrado o **1080×1920** historia). Las fotos se reparten en
  filas completas —con 1 ocupa todo el lienzo, con 3 van dos y una grande— para que
  **no queden huecos vacíos**; salen con esquinas redondeadas, sombra y fondo con
  degradado, y (opción marcada por defecto) una barra con el nombre y la fecha del
  desayuno. Ves la vista previa y lo descargas en JPG listo para Instagram/Facebook.
- Las fotos se reducen a 1600 px antes de guardarse para no ocupar de más.
- Las fotos **no** viajan en el JSON de exportar/importar (son archivos, no datos);
  se quedan en el dispositivo donde se subieron.

### 💲 Precios y presupuesto
- **Precios manuales**: anotas a cuánto está cada producto (normalmente en
  *El Machetazo*) con tres formas:
  - **Por unidad** — "Leche entera 1L" → $1.25 por litro.
  - **Por peso** — "Manzanas" → $2.50 por kg.
  - **Por tramos** — "Manzanas" → 1 kg $2.50 · 5 kg $2.20 · 10 kg $2.00.
    Al calcular se usa el tramo de la cantidad más alta que se alcance
    (si necesitas 7 kg, se usa el precio de 5 kg).
- **Captura rápida desde el móvil**: copias el texto del supermercado, lo pegas
  en **📥 Capturar varios** y la app saca los precios y los cruza con tu
  inventario por nombre parecido. Los que coinciden **actualizan** el precio
  que ya tenías en vez de duplicarlo.
- **Cálculo en vivo del presupuesto**: cada desayuno con presupuesto muestra
  *estimado vs presupuesto* con barra y aviso ("sobran $9.70" / "faltan $6.44"),
  y avisa de los productos que todavía no tienen precio.
- **Historial de precios** (📈): guarda cada cambio con su fecha, así se ve si
  un producto está subiendo o bajando.
- **Gráficas**: "Gasto por desayuno" (con la marca del presupuesto) y
  "Desviación del presupuesto" (cuánto se pasó o sobró en cada uno).
- **Exportar CSV** para llevarlo a Excel, y los precios **sí** viajan en el
  JSON de exportar/importar (así un voluntario le pasa su lista a otro).

## Estructura

```
index.html          · maquetación, menú lateral y modal
manifest.json       · manifiesto de la PWA (nombre, iconos, tema)
sw.js               · service worker: caché y funcionamiento sin conexión
icons/              · iconos (192, 512, maskable, apple-touch, favicon)
css/styles.css      · estilos, diseño responsive
js/app.js           · rutas (#/desayunos, #/inventario…), PWA y exportar/importar
js/store.js         · estado + guardado en localStorage
js/ui.js            · utilidades (modal, toast, campos, formato)
js/photos.js         · fotos: IndexedDB, reducción de imágenes y miniaturas
js/collage.js        · collage en canvas (plantillas y tamaños para redes)
js/prices.js         · precios: cruce de nombres, tramos y cálculo de presupuesto
js/views/*.js       · vistas (desayunos, inventario, compras, miembros, gráficas, fotos, precios)
tools/              · script que genera los iconos
```
