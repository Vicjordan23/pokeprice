// Extracción de productos desde HTML: JSON-LD (schema.org) y metaetiquetas.
// Sin dependencias; es heurístico: cada tienda puede necesitar su propio extractor.
import { parsePrice } from './detect.js';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function* walk(node) {
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  if (node && typeof node === 'object') {
    yield node;
    for (const k of ['@graph', 'itemListElement', 'item', 'mainEntity']) if (node[k]) yield* walk(node[k]);
  }
}

const isType = (n, t) => [].concat(n['@type'] ?? []).includes(t);

function fromOffer(offer) {
  const offers = [].concat(offer ?? []).flatMap((o) => (o?.offers ? [].concat(o.offers) : [o]));
  const priced = offers
    .map((o) => ({
      price: parsePrice(o?.price ?? o?.lowPrice),
      avail: String(o?.availability ?? ''),
      spec: o?.priceSpecification,
    }))
    .filter((o) => o.price != null);
  if (!priced.length) return null;
  const best = priced.reduce((a, b) => (b.price < a.price ? b : a));
  // priceSpecification con priceType ListPrice/StrikethroughPrice = precio de referencia.
  const specs = [].concat(best.spec ?? []);
  const ref = specs.find((s) => /List|Strikethrough|MSRP/i.test(String(s?.priceType ?? '')));
  return {
    price: best.price,
    reference: parsePrice(ref?.price),
    inStock: best.avail ? /InStock|LimitedAvailability|PreOrder|OnlineOnly/i.test(best.avail) : true,
  };
}

export function extractProducts(html, pageUrl) {
  const out = [];
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of blocks) {
    let json;
    try { json = JSON.parse(decode(raw).trim()); } catch { continue; }
    for (const n of walk(json)) {
      if (!isType(n, 'Product') || !n.offers) continue;
      const o = fromOffer(n.offers);
      if (!o) continue;
      const url = typeof n.url === 'string' ? new URL(n.url, pageUrl).href : pageUrl;
      out.push({ name: String(n.name ?? '').slice(0, 160), url, ...o });
    }
  }
  if (out.length) return out;

  // Fallback: metaetiquetas Open Graph / itemprop de una ficha de producto.
  const meta = (re) => html.match(re)?.[1];
  const price = parsePrice(
    meta(/<meta[^>]+(?:property|name)=["'](?:product|og):price:amount["'][^>]+content=["']([^"']+)/i) ??
    meta(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)/i) ??
    meta(/itemprop=["']price["'][^>]*content=["']([^"']+)/i),
  );
  if (price == null) return out;
  const name = meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ?? meta(/<title>([^<]+)/i) ?? '';
  out.push({ name: decode(name).slice(0, 160), url: pageUrl, price, reference: null, inStock: true });
  return out;
}
