export function renderPrecios(root) {
  root.innerHTML = `
    <div class="coming-soon">
      <div class="coming-soon__badge">En desarrollo</div>
      <h2>🔍 Búsqueda de precios en tiendas</h2>
      <p>
        Esta sección buscará automáticamente precios de los productos del inventario en supermercados y tiendas
        en línea para comparar y elegir la mejor opción antes de comprar.
      </p>
      <div class="coming-soon__grid">
        <div class="feature">
          <span>🛒</span>
          <h4>Comparar tiendas</h4>
          <p>Mismo producto, varios precios, en un solo lugar.</p>
        </div>
        <div class="feature">
          <span>📊</span>
          <h4>Historial de precios</h4>
          <p>Ver cómo ha variado el costo de cada producto.</p>
        </div>
        <div class="feature">
          <span>📝</span>
          <h4>Lista de compras</h4>
          <p>Generar la lista del equipo de compras con el presupuesto estimado.</p>
        </div>
      </div>
      <p class="muted">
        Es la parte más compleja (hay que obtener los precios de las páginas de cada tienda), así que queda para
        más adelante. Mientras tanto, el inventario y los desayunos ya funcionan.
      </p>
    </div>
  `;
}
