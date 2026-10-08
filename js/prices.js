/* Precios y presupuesto.

   Los precios se guardan en el estado de la app (no en IndexedDB: son datos
   pequeños y SÍ viajan en el exportar/importar, para que un voluntario le
   pase su lista de precios a otro).

   Cada producto con precio tiene:
     - priceType: 'unit' (por pieza) | 'weight' (por kg) | 'tiered' (por cantidad)
     - price/unit  para unit y weight
     - tiers[]     para tiered: [{qty, price}] = "a partir de qty, el precio es price"
     - history[]   registro histórico: [{date, price, store}]

   El cálculo es en vivo: se pasa la cantidad necesaria y se devuelve el
   precio que toca (con tiers, el de la cantidad más alta alcanzada). */

const STORES_KEY = 'gestor-voluntariado-prices-v1';

/* ---------- Normalizar y comparar nombres ---------- */

/** Minúsculas, sin acentos, sin signos: "Pan Integral (24u.)" → "pan integral 24u" */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distancia de Levenshtein (ediciones para pasar de a a b). */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Parecido entre dos nombres, de 0 a 1. Mezcla la distancia de edición con
 * las palabras compartidas, así "leche entera 1l" y "leche entera litro"
 * se parecen aunque no sean idénticos.
 */
export function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const dist = levenshtein(na, nb);
  const lenSim = 1 - dist / Math.max(na.length, nb.length);

  const wordsA = new Set(na.split(' '));
  const wordsB = nb.split(' ').filter((w) => w.length > 2); // "de", "la" no cuentan
  const shared = wordsB.filter((w) => wordsA.has(w)).length;
  const wordSim = shared / Math.max(wordsA.size, wordsB.length, 1);

  return Math.round(Math.max(lenSim, wordSim * 0.95, (lenSim + wordSim) / 2) * 100) / 100;
}

/**
 * Busca el precio más parecido a un nombre de producto.
 * @returns {object|null} el registro con un campo extra `score`
 */
export function findPrice(productName, prices, minScore = 0.55) {
  if (!Array.isArray(prices) || !prices.length) return null;
  let best = null;
  let bestScore = minScore;
  prices.forEach((p) => {
    const score = similarity(productName, p.productName);
    if (score >= bestScore) {
      bestScore = score;
      best = p;
    }
  });
  return best ? { ...best, score: bestScore } : null;
}

/* ---------- Cálculo ---------- */

/**
 * Precio que corresponde a una cantidad, resolviendo los tiers.
 * @returns {{price:number, unit:string, tier:object|null}|null}
 */
export function priceForQty(record, qty) {
  if (!record) return null;

  if (record.priceType === 'tiered' && Array.isArray(record.tiers) && record.tiers.length) {
    const tiers = [...record.tiers]
      .map((t) => ({ qty: Math.max(0, Number(t.qty) || 0), price: Math.max(0, Number(t.price) || 0) }))
      .sort((a, b) => a.qty - b.qty);
    if (!tiers.length) return null;
    // el tramo más alto cuya cantidad mínima ya se alcanza
    let pick = tiers[0];
    tiers.forEach((t) => {
      if (Number(qty) >= t.qty) pick = t;
    });
    return { price: pick.price, unit: record.unit || 'u', tier: pick };
  }

  const price = Number(record.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, unit: record.unit || 'u', tier: null };
}

/**
 * Estima el coste de un desayuno a partir de los precios guardados.
 * Devuelve filas con el detalle para poder pintarlas tal cual.
 */
export function estimateEvent(ev, prices, inventory, { minScore = 0.5 } = {}) {
  const items = Array.isArray(ev?.items) ? ev.items : [];
  const rows = [];
  let total = 0;
  let withPrice = 0;
  const missing = [];

  items.forEach((it) => {
    const product = inventory.find((x) => x.id === it.productId);
    const name = product ? product.name : 'Producto eliminado';
    const qty = Number(it.qty) || 0;
    const record = findPrice(name, prices, minScore);
    const info = record ? priceForQty(record, qty) : null;

    if (info && info.price > 0) {
      const line = qty * info.price;
      total += line;
      withPrice += 1;
      rows.push({
        name,
        qty,
        unit: product?.unit || record.unit || 'u',
        price: info.price,
        priceUnit: info.unit,
        line,
        tier: info.tier,
        score: record.score,
        record,
        hasPrice: true,
      });
    } else {
      missing.push(name);
      rows.push({
        name,
        qty,
        unit: product?.unit || 'u',
        price: null,
        line: null,
        score: record ? record.score : 0,
        record: record || null,
        hasPrice: false,
      });
    }
  });

  return { rows, total, withPrice, missing, items: items.length, budget: Math.max(0, Number(ev?.budget) || 0) };
}

/** Resumen corto para una tarjeta o un toast. */
export function budgetSummary(ev, prices, inventory) {
  const est = estimateEvent(ev, prices, inventory);
  const budget = Math.max(0, Number(ev?.budget) || 0);
  const diff = budget - est.total;
  let tone = 'ok';
  let label = 'Te sobran';
  if (!budget) {
    tone = 'muted';
    label = 'Sin presupuesto';
  } else if (diff < 0) {
    tone = 'danger';
    label = 'Te faltan';
  } else if (est.total >= budget * 0.9) {
    tone = 'warn';
    label = 'Ajustado, sobran';
  }
  return { ...est, budget, diff, tone, label };
}

/* ---------- Tiendas habituales ---------- */

const DEFAULT_STORES = ['El Machetazo', 'Super 99', 'Riba Smith', 'Otro'];

function loadStores() {
  try {
    const raw = localStorage.getItem(STORES_KEY);
    if (!raw) return [...DEFAULT_STORES];
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length ? list : [...DEFAULT_STORES];
  } catch {
    return [...DEFAULT_STORES];
  }
}

export function stores() {
  return loadStores();
}

export function addStore(name) {
  const clean = String(name || '').trim();
  if (!clean) return stores();
  const list = stores();
  if (list.some((s) => s.toLowerCase() === clean.toLowerCase())) return list;
  const next = [...list, clean];
  try {
    localStorage.setItem(STORES_KEY, JSON.stringify(next));
  } catch {
    /* modo privado: se queda solo en memoria */
  }
  return next;
}

/** Tiendas que aparecen en los precios ya guardados (para sugerir, no para guardar). */
export function storesUsed(prices) {
  const set = new Set(stores());
  (prices || []).forEach((p) => {
    if (p.store) set.add(p.store);
  });
  return [...set];
}

/* ---------- Registro / actualización ---------- */

/**
 * Crea o actualiza el precio de un producto. Si ya existe uno con nombre
 * equivalente, se actualiza y se archiva el precio anterior en `history`.
 */
export function savePrice(prices, entry) {
  const list = Array.isArray(prices) ? [...prices] : [];
  const name = String(entry.productName || '').trim();
  if (!name) return list;

  const match = list.find((p) => normalize(p.productName) === normalize(name)) || null;
  const today = entry.date || new Date().toISOString().slice(0, 10);

  const base = {
    productName: name,
    priceType: entry.priceType || 'unit',
    unit: entry.unit || 'u',
    store: entry.store || '',
    notes: entry.notes || '',
    date: today,
  };

  if (base.priceType === 'tiered') {
    base.tiers = (entry.tiers || [])
      .map((t) => ({ qty: Math.max(0, Number(t.qty) || 0), price: Math.max(0, Number(t.price) || 0) }))
      .filter((t) => t.price > 0)
      .sort((a, b) => a.qty - b.qty);
    if (!base.tiers.length) base.priceType = 'unit';
  } else {
    base.price = Math.max(0, Number(entry.price) || 0);
  }

  if (!match) {
    const created = {
      id: entry.id || 'precio-' + Math.random().toString(36).slice(2, 10),
      ...base,
      history: [{ date: today, price: base.price ?? null, store: base.store, tiers: base.tiers || null }],
    };
    list.push(created);
    return list;
  }

  const prevPrice = match.priceType === 'tiered' ? null : Number(match.price);
  const changed =
    match.priceType !== base.priceType ||
    (base.priceType === 'tiered'
      ? JSON.stringify(match.tiers || []) !== JSON.stringify(base.tiers || [])
      : prevPrice !== base.price) ||
    (match.unit || 'u') !== base.unit;

  const history = [...(match.history || [])];
  if (changed && (prevPrice > 0 || match.tiers?.length)) {
    history.push({ date: match.date || today, price: prevPrice, store: match.store, tiers: match.tiers || null });
  }
  if (history.length > 60) history.splice(0, history.length - 60); // no crece sin límite

  return list.map((p) =>
    p.id === match.id ? { ...p, ...base, history, id: p.id } : p
  );
}

/** Borra el precio de un producto. */
export function deletePrice(prices, id) {
  return (prices || []).filter((p) => p.id !== id);
}

/**
 * Desviación media entre lo que se gasta y lo que se presupuesta.
 * Compara la media del coste estimado con la media del presupuesto de los
 * desayunos que tienen las dos cosas (mínimo 2 para que signifique algo).
 * @returns {{n:number, mediaGasto:number, mediaPresupuesto:number, pct:number,
 *            nivel:'vacio'|'ok'|'warn'|'danger', arriba:boolean, mensaje:string}}
 */
export function desviacionMedia(events, prices, inventory, { warn = 10, danger = 25 } = {}) {
  const conDatos = (Array.isArray(events) ? events : [])
    .filter((e) => e && e.status !== 'cancelado' && Number(e.budget) > 0)
    .map((e) => ({ ev: e, est: estimateEvent(e, prices, inventory) }))
    .filter((r) => r.est.withPrice > 0);

  if (conDatos.length < 2) {
    return {
      n: conDatos.length,
      mediaGasto: 0,
      mediaPresupuesto: 0,
      pct: 0,
      nivel: 'vacio',
      arriba: false,
      mensaje:
        conDatos.length === 1
          ? 'Hace falta un desayuno más con presupuesto y precios para comparar.'
          : 'Aún no hay desayunos con presupuesto y precios guardados.',
    };
  }

  const mediaGasto = conDatos.reduce((s, r) => s + r.est.total, 0) / conDatos.length;
  const mediaPresupuesto = conDatos.reduce((s, r) => s + Math.max(0, Number(r.ev.budget) || 0), 0) / conDatos.length;
  const pct = mediaPresupuesto ? ((mediaGasto - mediaPresupuesto) / mediaPresupuesto) * 100 : 0;
  const abs = Math.abs(pct);

  let nivel = 'ok';
  if (abs >= danger) nivel = 'danger';
  else if (abs >= warn) nivel = 'warn';

  const arriba = pct > 0;
  const pctTxt = `${abs.toFixed(0)}%`;

  let mensaje;
  if (nivel === 'ok') {
    mensaje = `En media gastas lo que presupuestas (${arriba ? '+' : '−'}${pctTxt}).`;
  } else if (arriba) {
    mensaje = `Gastas ${pctTxt} más de lo que presupuestas ($${mediaGasto.toFixed(2)} de $${mediaPresupuesto.toFixed(2)}).`;
  } else {
    mensaje = `Gastas ${pctTxt} menos de lo que presupuestas ($${mediaGasto.toFixed(2)} de $${mediaPresupuesto.toFixed(2)}).`;
  }

  return { n: conDatos.length, mediaGasto, mediaPresupuesto, pct, nivel, arriba, mensaje };
}

/* ---------- Exportar ---------- */
/** CSV con los precios actuales (una fila por producto). */
export function pricesToCsv(prices) {
  const rows = [['producto', 'tipo', 'precio', 'unidad', 'tienda', 'fecha', 'tramos', 'notas']];
  (prices || []).forEach((p) => {
    const tramos = p.priceType === 'tiered' && p.tiers?.length
      ? p.tiers.map((t) => `${t.qty}=${t.price}`).join(' | ')
      : '';
    rows.push([
      p.productName,
      p.priceType,
      p.priceType === 'tiered' ? '' : String(p.price ?? ''),
      p.unit || 'u',
      p.store || '',
      p.date || '',
      tramos,
      p.notes || '',
    ]);
  });
  return rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
}

/** Texto para WhatsApp de los precios de un desayuno. */
export function estimateText(ev, estimate) {
  const est = estimate || {};
  const budget = Math.max(0, Number(ev?.budget) || Number(est.budget) || 0);
  const lines = [];
  (est.rows || []).forEach((r) => {
    const precio = r.hasPrice ? `$${r.price.toFixed(2)}` : 'sin precio';
    lines.push(`• ${r.name}: ${r.qty} ${r.unit} × ${precio}`);
  });
  lines.push('');
  lines.push(`💰 *Estimado: $${(Number(est.total) || 0).toFixed(2)}*`);
  if (budget) {
    const diff = budget - (Number(est.total) || 0);
    lines.push(diff >= 0 ? `✅ Sobran $${diff.toFixed(2)} de $${budget.toFixed(2)}` : `⚠️ Faltan $${(-diff).toFixed(2)} de $${budget.toFixed(2)}`);
  }
  if ((est.missing || []).length) {
    lines.push(`❓ Sin precio: ${est.missing.join(', ')}`);
  }
  return lines.join('\n');
}
