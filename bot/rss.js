// Fuentes RSS de comunidades de chollos (Chollometro, etc.): se analiza el título/descripción de cada chollo.
import { parsePrice } from './detect.js';

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

const tag = (block, name) => block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '';

export function parseFeed(xml) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([b]) => ({
    title: decode(tag(b, 'title')),
    link: decode(tag(b, 'link')) || b.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || '',
    desc: decode(tag(b, 'description')),
  })).filter((i) => i.title && i.link);
}

const PRICE_RE = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(?:€|eur\b)|(?:€|eur\b)\s?(\d+(?:[.,]\d{1,2})?)/gi;
const ERROR_RE = /error(?:es)? de precio|fallo de precio|precio erróneo|price error|bug de precio|error en (?:el )?precio/i;

/** Devuelve una oferta sospechosa o null. Mira sobre todo el título; la descripción solo para la palabra "error". */
export function analyzeItem(item, opts = {}) {
  const { zeroMax = 0.99, minDiscount = 80, minReference = 15 } = opts;
  const prices = [...item.title.matchAll(PRICE_RE)].map((m) => parsePrice(m[1] ?? m[2])).filter((p) => p != null);
  const price = prices.length ? Math.min(...prices) : null;
  const reference = prices.length > 1 ? Math.max(...prices) : null;
  const pct = Number(item.title.match(/-\s?(\d{2,3})\s?%/)?.[1]) || null;
  const discount = reference && price != null && reference >= minReference && reference > price
    ? Math.round((1 - price / reference) * 1000) / 10 : pct;
  const base = { name: item.title.slice(0, 160), url: item.link, price, reference, discount };

  if (ERROR_RE.test(`${item.title} ${item.desc}`)) return { ...base, kind: 'error' };
  if (price != null && price <= zeroMax && /gratis|0\s?€|0,00/i.test(item.title)) return { ...base, kind: 'zero' };
  if (discount != null && discount >= minDiscount) return { ...base, kind: 'deep' };
  return null;
}
