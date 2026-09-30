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
