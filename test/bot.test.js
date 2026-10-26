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

test('rss: detecta errores de precio en francés y alemán', () => {
  assert.equal(analyzeItem({ title: 'Casque Sony 25€', link: 'x', desc: 'Erreur de prix sur Amazon' }).kind, 'error');
  assert.equal(analyzeItem({ title: 'Kopfhörer 19€', link: 'x', desc: 'Preisfehler bei Amazon' }).kind, 'error');
  assert.equal(analyzeItem({ title: 'Jeu kostenlos 0€', link: 'x', desc: '' }).kind, 'zero');
});

import { shipsToSpain } from '../bot/rss.js';

test('shipsToSpain acepta Amazon y tiendas con envío a España y descarta recogida en tienda', () => {
  const it = (title, desc = '', merchant = '') => ({ title, desc, merchant, link: 'https://x.test/1' });
  assert.equal(shipsToSpain(it('Casque 25€', '', 'Amazon')), true);
  assert.equal(shipsToSpain(it('Kopfhörer 19€ bei MediaMarkt')), true);
  assert.equal(shipsToSpain(it('Aceite 2€ ATU - Abholung')), false);
  assert.equal(shipsToSpain(it('Sofa 50€', '', 'Poco Domäne')), false);
  assert.equal(shipsToSpain(it('Amazon 5€ Abholung')), true);
  assert.equal(shipsToSpain(it('Pineapple 5€')), false);
});

import { findFeedUrl } from '../bot/rss.js';

test('findFeedUrl descubre el feed anunciado en el <head>', () => {
  const html = '<head><link rel="alternate" type="application/rss+xml" title="x" href="/comments/feed/"></head>';
  assert.equal(findFeedUrl(html, 'https://b.es/'), 'https://b.es/comments/feed/');
  assert.equal(findFeedUrl('<head></head>', 'https://b.es/'), null);
});

import { parseTelegram } from '../bot/rss.js';

test('parseTelegram extrae mensajes de la vista web de un canal', () => {
  const html = `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap" data-post="canal/123">
    <div class="tgme_widget_message_text js-message_text" dir="auto">🔥 Auriculares 9,99€<br/>antes <b>79€</b> -87%</div>
    <a class="tgme_widget_message_date" href="https://t.me/canal/123"><time datetime="2026-10-26T10:00:00+00:00" class="time">10:00</time></a></div></div>`;
  const [m] = parseTelegram(html);
  assert.equal(m.link, 'https://t.me/canal/123');
  assert.match(m.title, /Auriculares 9,99€ antes 79€ -87%/);
  assert.equal(m.date, Date.parse('2026-10-26T10:00:00+00:00'));
  assert.equal(analyzeItem(m).kind, 'deep');
  assert.deepEqual(parseTelegram('<html></html>'), []);
});

test('rss: ignora precios recurrentes (€/mes) aunque diga GRATIS', () => {
  const it = { title: 'Hosting WordPress Business por (0,95€/mes + IVA) + Dominio GRATIS + Auditoría GRATIS (54€)', link: 'x', desc: '' };
  assert.equal(analyzeItem(it), null);
  assert.equal(analyzeItem({ title: 'Móvil 0€ gratis', link: 'x', desc: '' }).kind, 'zero');
});
