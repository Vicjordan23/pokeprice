import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, classify } from '../bot/detect.js';
import { extractProducts } from '../bot/extract.js';

test('parsePrice entiende formatos es/en', () => {
  assert.equal(parsePrice('1.299,99 €'), 1299.99);
  assert.equal(parsePrice('1,299.99'), 1299.99);
  assert.equal(parsePrice('0,00 €'), 0);
  assert.equal(parsePrice('12,5'), 12.5);
  assert.equal(parsePrice('1.299'), 1299);
  assert.equal(parsePrice('abc'), null);
  assert.equal(parsePrice(7), 7);
});

test('classify detecta ~0 € y descuentos >= 80% con referencia', () => {
  assert.deepEqual(classify({ price: 0, reference: 199 }), { kind: 'zero', discount: 100 });
  assert.equal(classify({ price: 19.9, reference: 199 }).kind, 'deep');
  assert.equal(classify({ price: 100, reference: 199 }), null);
  assert.equal(classify({ price: 0, reference: null }), null);   // 0 € sin referencia = ruido
  assert.equal(classify({ price: 0, reference: 5 }), null);      // referencia irrelevante
  assert.equal(classify({ price: 0, reference: 199, inStock: false }), null);
});

test('extractProducts lee JSON-LD y metaetiquetas', () => {
  const ld = `<script type="application/ld+json">{"@type":"Product","name":"TV","offers":{"price":"0.00","availability":"https://schema.org/InStock"}}</script>`;
  assert.deepEqual(extractProducts(ld, 'https://x.es/p')[0], { name: 'TV', url: 'https://x.es/p', price: 0, reference: null, inStock: true });
  const meta = `<meta property="og:title" content="Cafetera"><meta property="product:price:amount" content="24,90">`;
  assert.equal(extractProducts(meta, 'https://x.es/c')[0].price, 24.9);
});

import { parseFeed, analyzeItem } from '../bot/rss.js';

test('rss: parsea items y detecta errores de precio, 0 € y descuentos', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Móvil X por 9,99€ (antes 249€)]]></title><link>https://c.es/1</link><description>ok</description></item>
    <item><title>Cafetera 59€</title><link>https://c.es/2</link><description>ERROR DE PRECIO en la web</description></item>
    <item><title>Auriculares GRATIS 0€</title><link>https://c.es/3</link><description></description></item>
    <item><title>Aspiradora 120€ (antes 150€)</title><link>https://c.es/4</link><description></description></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 4);
  assert.equal(analyzeItem(items[0]).kind, 'deep');
  assert.equal(analyzeItem(items[1]).kind, 'error');
  assert.equal(analyzeItem(items[2]).kind, 'zero');
  assert.equal(analyzeItem(items[3]), null);
});
