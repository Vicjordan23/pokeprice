// Lógica pura (sin DOM) para poder probarla con node:test.

/** Precio de referencia en EUR (Cardmarket): tendencia, o media de venta si falta. */
export function cardValue(card) {
  const p = card?.cardmarket?.prices;
  if (!p) return null;
  return p.trendPrice ?? p.averageSellPrice ?? null;
}

/** Variación % de la media de 7 días frente a la de 30 días. */
export function changePct(card) {
  const p = card?.cardmarket?.prices;
  if (!p || !p.avg7 || !p.avg30) return null;
  return (p.avg7 / p.avg30 - 1) * 100;
}

/** Puntos de la mini-gráfica: media 30d, 7d y 1d de Cardmarket. */
export function chartPoints(card) {
  const p = card?.cardmarket?.prices;
  if (!p) return [];
  return [
    { label: '30 días', value: p.avg30 },
    { label: '7 días', value: p.avg7 },
    { label: '1 día', value: p.avg1 },
  ].filter((pt) => typeof pt.value === 'number' && pt.value > 0);
}

/**
 * Convierte lo que escribe el usuario en una consulta de pokemontcg.io.
 * "charizard" -> name:charizard*   |   "charizard 199" -> name:charizard* number:199
 */
export function buildQuery(text) {
  const t = String(text ?? '').trim().replace(/["\\:()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 2) return null;
  const m = t.match(/^(.*?)\s+(\d{1,3})(?:\/\d+)?$/);
  if (m && m[1]) return `name:"${m[1]}*" number:${m[2]}`;
  return `name:"${t}*"`;
}

/** Consulta para traer varias cartas por id. */
export function buildIdsQuery(ids) {
  const clean = ids.filter((id) => /^[\w.-]+$/.test(id));
  if (!clean.length) return null;
  return clean.map((id) => `id:${id}`).join(' OR ');
}

/** Valor total de una colección {id: cantidad} con instantáneas de carta {id: card}. */
export function collectionTotal(owned, cards) {
  let total = 0;
  let count = 0;
  for (const [id, qty] of Object.entries(owned)) {
    if (!(qty > 0)) continue;
    count += qty;
    total += (cardValue(cards[id]) ?? 0) * qty;
  }
  return { total, count };
}

/** Escapa texto de la API antes de meterlo en innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- Escáner (OCR) ----------

const NOT_A_NAME = /^(basic|stage\s*\d|hp\b|pok[eé]mon|trainer|energy|supporter|item|tool|illus|weakness|resistance|retreat)/i;

/**
 * Extrae del texto del OCR el número de carta ("199/165") y posibles nombres.
 * El número no depende del idioma de la carta; el nombre solo sirve si coincide con el inglés de la API.
 */
export function parseCardText(text) {
  const t = String(text ?? '');
  const m = t.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  const names = t
    .split('\n')
    .slice(0, 8)
    .map((l) => (l.replace(/\bHP\b.*$/i, '').match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]*(?: [A-Za-zÀ-ÿ'’.-]+)*/g) ?? []))
    .flat()
    .filter((s) => s.length >= 3 && !NOT_A_NAME.test(s))
    .slice(0, 3);
  return { number: m ? String(parseInt(m[1], 10)) : null, total: m ? parseInt(m[2], 10) : null, names };
}

/** Consulta para pokemontcg.io a partir de lo leído: número + total impreso, o si no el nombre. */
export function buildScanQuery(parsed) {
  if (parsed.number && parsed.total) return `number:${parsed.number} set.printedTotal:${parsed.total}`;
  return parsed.names.length ? buildQuery(parsed.names[0]) : null;
}

/** Ordena candidatos: primero los cuyo nombre aparece en el texto leído. */
export function rankMatches(cards, text) {
  const lower = String(text ?? '').toLowerCase();
  const score = (c) => {
    const name = String(c.name ?? '').toLowerCase();
    if (name && lower.includes(name)) return 2 + name.length / 100;
    const first = name.split(' ')[0];
    return first && first.length >= 3 && lower.includes(first) ? 1 : 0;
  };
  return cards.map((c, i) => ({ c, i, s: score(c) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
}

// ---------- Alertas de precio ----------

/** Lee un importe escrito a la española ("1.250,50", "96,4") o con punto decimal ("96.4"). */
export function parseTarget(text) {
  let t = String(text ?? '').replace(/[\s€]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** ¿Se cumple la alerta {dir:'below'|'above', target} con este valor? */
export function alertHit(alert, value) {
  if (value == null || !alert) return false;
  return alert.dir === 'above' ? value >= alert.target : value <= alert.target;
}

/**
 * Evalúa las alertas activas (sin `triggered`) con los precios actuales.
 * No muta: devuelve las alertas nuevas y los ids que se han disparado ahora.
 */
export function checkAlerts(alerts, cards, now = Date.now()) {
  const next = {};
  const fired = [];
  for (const [id, a] of Object.entries(alerts)) {
    const value = cardValue(cards[id]);
    if (!a.triggered && alertHit(a, value)) {
      next[id] = { ...a, triggered: { at: now, value } };
      fired.push(id);
    } else next[id] = a;
  }
  return { alerts: next, fired };
}
