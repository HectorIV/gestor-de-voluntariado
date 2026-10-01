/* Catálogo de productos que solemos necesitar en los desayunos.
   Sirve para: alta rápida desde Inventario (botón "Lista típica")
   y autocompletado al crear un producto nuevo. */

export const SUGGESTED = [
  // Alimentos y bebidas
  { name: 'Jugo (litro o caja)', category: 'Alimentos', unit: 'unidades', min: 12 },
  { name: 'Café', category: 'Alimentos', unit: 'paquetes', min: 4 },
  { name: 'Té (varios tipos)', category: 'Alimentos', unit: 'cajas', min: 3 },
  { name: 'Pan de molde', category: 'Alimentos', unit: 'paquetes', min: 6 },
  { name: 'Queso', category: 'Alimentos', unit: 'paquetes', min: 5 },
  { name: 'Mantequilla', category: 'Alimentos', unit: 'paquetes', min: 3 },
  { name: 'Jamón', category: 'Alimentos', unit: 'paquetes', min: 5 },
  { name: 'Galletas', category: 'Alimentos', unit: 'paquetes', min: 5 },

  // Empacado y desechables
  { name: 'Ziplos medianos (para emparedado)', category: 'Servilletas y desechables', unit: 'paquetes', min: 3 },
  { name: 'Ziplos grandes (jugo y galleta)', category: 'Servilletas y desechables', unit: 'paquetes', min: 3 },
  { name: 'Servilletas de papel', category: 'Servilletas y desechables', unit: 'paquetes', min: 5 },
  { name: 'Vasos desechables', category: 'Servilletas y desechables', unit: 'paquetes', min: 3 },
  { name: 'Platos desechables', category: 'Servilletas y desechables', unit: 'paquetes', min: 3 },

  // Higiene
  { name: 'Guantes de látex', category: 'Guantes e higiene', unit: 'cajas', min: 3 },
  { name: 'Alcohol en gel', category: 'Guantes e higiene', unit: 'unidades', min: 2 },

  // Equipo
  { name: 'Cafetera eléctrica', category: 'Equipo (cafeteras, ollas)', unit: 'unidades', min: 1 },
  { name: 'Termo / olla térmica', category: 'Equipo (cafeteras, ollas)', unit: 'unidades', min: 2 },
  { name: 'Hielo (bolsa)', category: 'Otros', unit: 'bolsas', min: 4 },
];

export function suggestedByName(name) {
  const key = String(name || '').trim().toLowerCase();
  return SUGGESTED.find((s) => s.name.toLowerCase() === key);
}
