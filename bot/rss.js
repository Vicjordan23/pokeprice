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
    // Pepper (Chollometro/Dealabs/Mydealz) indica la tienda en <pepper:merchant name="...">.
    date: Date.parse(decode(tag(b, 'pubDate'))) || null,
    merchant: decode(b.match(/<pepper:merchant[^>]+name=["']([^"']+)/i)?.[1] ?? ''),
  })).filter((i) => i.title && i.link);
}

const PRICE_RE = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(?:€|eur\b)|(?:€|eur\b)\s?(\d+(?:[.,]\d{1,2})?)/gi;
// Errores de precio en es/fr/de/en/it/pt (los de Amazon suelen verse antes en Dealabs o Mydealz).
const ERROR_RE = /error(?:es)? de precio|fallo de precio|precio erróneo|bug de precio|error en (?:el )?precio|erreur de prix|erreur de tarif|bug de prix|preisfehler|fehlerpreis|price error|pricing error|pricing mistake|errore di prezzo|erro de preço/i;
const FREE_RE = /gratis|gratuit|kostenlos|umsonst|\bfree\b|\b0\s?€|0,00/i;

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
  if (price != null && price <= zeroMax && FREE_RE.test(item.title)) return { ...base, kind: 'zero' };
  if (discount != null && discount >= minDiscount) return { ...base, kind: 'deep' };
  return null;
}

// Tiendas que envían a España (para filtrar chollos de Dealabs/Mydealz, que son de otros países).
const SPAIN_STORES = [
  'amazon', 'media ?markt', 'pc ?componentes', 'corte ?ingl[eé]s', 'carrefour', 'fnac', 'worten', 'leroy ?merlin',
  'ikea', 'decathlon', 'aliexpress', 'miravia', 'zalando', 'coolmod', 'pcbox', 'neobyte', 'globaldata', 'ldlc',
  'alternate', 'notebooksbilliger', 'bricodepot', 'sprinter', 'jd ?sports', 'dyson', 'xiaomi', 'lidl', 'alcampo',
  'apple', 'samsung', 'nike', 'adidas', 'lenovo', 'hp store', 'rakuten', 'ebay', 'tradeinn', 'powerplanetonline',
  'versus ?gamers', 'game\\.es', 'steam', 'nintendo', 'playstation', 'xbox', 'tiendanimal', 'kiwoko', 'mango',
  'zara', 'h&m', 'primark', 'conforama', 'maisons du monde', 'phone ?house', 'orange', 'vodafone', 'movistar',
];
const SPAIN_RE = new RegExp(`(?:^|[^a-z0-9])(?:${SPAIN_STORES.join('|')})(?![a-z0-9])`, 'i');
const PICKUP_RE = /abholung|selbstabholung|retrait (?:en )?(?:magasin|drive)|click ?(?:&|and) ?collect/i;

/** ¿Es de Amazon o de una tienda que envía a España? Descarta recogida en tienda física. */
export function shipsToSpain(item) {
  const text = `${item.merchant} ${item.title} ${item.desc} ${item.link}`;
  if (!SPAIN_RE.test(text)) return false;
  return !PICKUP_RE.test(text) || /amazon/i.test(text);
}

/** Si la URL es una página HTML en vez de un feed, busca su <link rel="alternate" type="application/rss+xml">. */
export function findFeedUrl(html, pageUrl) {
  for (const [tagHtml] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/type=["']application\/rss\+xml["']/i.test(tagHtml) || !/rel=["']alternate["']/i.test(tagHtml)) continue;
    const href = tagHtml.match(/href=["']([^"']+)/i)?.[1];
    if (href) return new URL(decode(href), pageUrl).href;
  }
  return null;
}

/** Vista web pública de un canal (https://t.me/s/<canal>): cada mensaje pasa a ser un "chollo". */
export function parseTelegram(html) {
  const out = [];
  for (const block of html.split('tgme_widget_message_wrap').slice(1)) {
    const post = block.match(/data-post=["']([^"']+)/)?.[1];
    const raw = block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!post || !raw) continue;
    const text = decode(raw.replace(/<br\s*\/?>/gi, ' '));
    if (!text) continue;
    out.push({
      title: text.slice(0, 300),
      desc: '',
      link: `https://t.me/${post}`,
      date: Date.parse(block.match(/<time[^>]+datetime=["']([^"']+)/)?.[1] ?? '') || null,
      merchant: '',
    });
  }
  return out;
}
