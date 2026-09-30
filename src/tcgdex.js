// Acceso a TCGdex (https://api.tcgdex.net/v2): catálogo multilingüe con precios de Cardmarket y TCGplayer.
import { CONFIG } from './config.js';
import { normalizeCard, numberVariants, sameNumber } from './lib.js';

export const net = { lastError: null };

async function getJson(url, { timeout = 15000, retry = true } = {}) {
  const attempts = retry ? 2 : 1;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      const reason = err.name === 'AbortError' ? `tiempo agotado (${timeout / 1000} s)` : err.message;
      net.lastError = reason;
      console.error('TCGdex:', reason, err);
      const transient = err.name === 'AbortError' || err.name === 'TypeError' || /^HTTP 5/.test(err.message);
      if (i === attempts || !transient) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

const cardsUrl = (lang) => `${CONFIG.apiBase}/${lang}/cards`;

/** Ficha completa (con precios). Prueba español y luego inglés. */
export async function getCard(id) {
  for (const lang of ['es', 'en']) {
    const card = normalizeCard(await getJson(`${cardsUrl(lang)}/${encodeURIComponent(id)}`));
    if (card) return card;
  }
  return null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]).catch(() => null);
      }
    }),
  );
  return out;
}

/** Descarga varias fichas a la caché. Devuelve cuántas salieron bien y cuántas no. */
export async function loadCards(ids, cache, limit = 6) {
  const cards = await mapLimit(ids, limit, getCard);
  let ok = 0;
  cards.forEach((c) => { if (c) { cache[c.id] = c; ok++; } });
  return { ok, failed: ids.length - ok };
}

async function briefs(lang, params, timeout = 12000) {
  const data = await getJson(`${cardsUrl(lang)}?${new URLSearchParams(params)}`, { retry: false, timeout });
  return Array.isArray(data) ? data : [];
}

/** Junta listados de varios idiomas sin repetir ids. Falla solo si todos los idiomas fallan. */
async function briefsAcross(langs, params) {
  const results = await Promise.allSettled(langs.map((l) => briefs(l, params)));
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  const seen = new Map();
  for (const r of results) if (r.status === 'fulfilled') for (const b of r.value) if (!seen.has(b.id)) seen.set(b.id, b);
  return [...seen.values()];
}

/**
 * Busca por nombre en varios idiomas. Si se da un número, deja solo las cartas con ese número
 * (o todas si ninguna coincide). Devuelve fichas completas de las primeras `max`.
 */
export async function searchByName(name, { langs = ['es', 'en'], number = null, max = 12, cache } = {}) {
  let list = await briefsAcross(langs, { name });
  if (number) {
    const hit = list.filter((b) => sameNumber(b.localId, number));
    if (hit.length) list = hit;
  }
  const total = list.length;
  const cards = (await mapLimit(list.slice(0, max), 6, (b) => getCard(b.id))).filter(Boolean);
  if (cache) cards.forEach((c) => { cache[c.id] = c; });
  return { cards, total };
}

/** Sin nombre legible: busca por número y se queda con las que tienen ese total impreso (p. ej. /165). */
export async function findByNumber(number, printedTotal, { max = 40, cache } = {}) {
  let list = [];
  const found = await Promise.allSettled(numberVariants(number).map((v) => briefs('en', { localId: v })));
  if (found.every((r) => r.status === 'rejected')) throw found[0].reason;
  for (const r of found) if (r.status === 'fulfilled') list = list.concat(r.value);
  const cards = (await mapLimit(list.slice(0, max), 6, (b) => getCard(b.id))).filter(Boolean);
  const match = printedTotal ? cards.filter((c) => c.set?.printedTotal === printedTotal) : cards;
  if (cache) match.forEach((c) => { cache[c.id] = c; });
  return match;
}
