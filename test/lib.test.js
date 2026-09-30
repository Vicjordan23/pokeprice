import test from 'node:test';
import assert from 'node:assert/strict';
import { cardValue, changePct, chartPoints, buildQuery, buildIdsQuery, collectionTotal, esc } from '../src/lib.js';

const card = (prices) => ({ cardmarket: { prices } });

test('cardValue usa la tendencia y cae a la media de venta', () => {
  assert.equal(cardValue(card({ trendPrice: 10, averageSellPrice: 8 })), 10);
  assert.equal(cardValue(card({ averageSellPrice: 8 })), 8);
  assert.equal(cardValue({}), null);
  assert.equal(cardValue(undefined), null);
});

test('changePct compara media 7d con 30d', () => {
  assert.ok(Math.abs(changePct(card({ avg7: 110, avg30: 100 })) - 10) < 1e-9);
  assert.equal(changePct(card({ avg7: 100 })), null);
});

test('chartPoints descarta valores ausentes', () => {
  const pts = chartPoints(card({ avg30: 5, avg7: 6, avg1: 0 }));
  assert.deepEqual(pts.map((p) => p.label), ['30 días', '7 días']);
});

test('buildQuery: nombre, nombre + número, entradas inválidas', () => {
  assert.equal(buildQuery('charizard'), 'name:"charizard*"');
  assert.equal(buildQuery('charizard 199/165'), 'name:"charizard*" number:199');
  assert.equal(buildQuery('a'), null);
  // Las comillas y los dos puntos se eliminan: no se puede salir del filtro name:"…".
  assert.equal(buildQuery('x" OR id:abc'), 'name:"x OR id abc*"');
});

test('buildIdsQuery filtra ids raros', () => {
  assert.equal(buildIdsQuery(['base1-4', 'sv3-125']), 'id:base1-4 OR id:sv3-125');
  assert.equal(buildIdsQuery(['bad id!']), null);
});

test('collectionTotal suma valor × cantidad', () => {
  const cards = { a: card({ trendPrice: 10 }), b: card({ trendPrice: 2.5 }) };
  assert.deepEqual(collectionTotal({ a: 2, b: 1, c: 3 }, cards), { total: 22.5, count: 6 });
});

test('esc escapa HTML', () => {
  assert.equal(esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
});

import { parseCardText, buildScanQuery, rankMatches } from '../src/lib.js';

test('parseCardText saca número, total y nombres', () => {
  const p = parseCardText('Basic Pokémon\nCharizard ex   HP 330\nfoo\n199/165 SV3');
  assert.equal(p.number, '199');
  assert.equal(p.total, 165);
  assert.equal(p.names[0], 'Charizard ex');
  assert.equal(parseCardText('sin numero').number, null);
  assert.deepEqual(parseCardText('1234 ---').names, []);
  assert.equal(parseCardText('004 / 102').number, '4');
});

test('buildScanQuery prefiere número+total y cae al nombre', () => {
  assert.equal(buildScanQuery({ number: '4', total: 102, names: ['Charizard'] }), 'number:4 set.printedTotal:102');
  assert.equal(buildScanQuery({ number: null, total: null, names: ['Charizard'] }), 'name:"Charizard*"');
  assert.equal(buildScanQuery({ number: null, total: null, names: [] }), null);
});

test('rankMatches pone primero el nombre presente en el texto', () => {
  const cards = [{ name: 'Pikachu' }, { name: 'Charizard ex' }, { name: 'Charizard' }];
  assert.deepEqual(rankMatches(cards, 'CHARIZARD ex HP 330').map((c) => c.name), ['Charizard ex', 'Charizard', 'Pikachu']);
});

import { parseTarget, alertHit, checkAlerts } from '../src/lib.js';

test('parseTarget entiende formatos españoles y punto decimal', () => {
  assert.equal(parseTarget('96,4'), 96.4);
  assert.equal(parseTarget('1.250,50 €'), 1250.5);
  assert.equal(parseTarget('1.250'), 1250);
  assert.equal(parseTarget('96.4'), 96.4);
  assert.equal(parseTarget('abc'), null);
  assert.equal(parseTarget('0'), null);
  assert.equal(parseTarget(''), null);
});

test('alertHit según dirección', () => {
  assert.equal(alertHit({ dir: 'below', target: 100 }, 100), true);
  assert.equal(alertHit({ dir: 'below', target: 100 }, 101), false);
  assert.equal(alertHit({ dir: 'above', target: 100 }, 100), true);
  assert.equal(alertHit({ dir: 'above', target: 100 }, null), false);
});

test('checkAlerts dispara una vez y no muta', () => {
  const alerts = { a: { dir: 'below', target: 100, triggered: null }, b: { dir: 'above', target: 50, triggered: null }, c: { dir: 'below', target: 100, triggered: { at: 1, value: 90 } } };
  const cards = { a: card({ trendPrice: 90 }), b: card({ trendPrice: 40 }), c: card({ trendPrice: 80 }) };
  const r = checkAlerts(alerts, cards, 123);
  assert.deepEqual(r.fired, ['a']);
  assert.deepEqual(r.alerts.a.triggered, { at: 123, value: 90 });
  assert.equal(r.alerts.b.triggered, null);
  assert.equal(r.alerts.c.triggered.at, 1);
  assert.equal(alerts.a.triggered, null);
});

import { buildScanQueries } from '../src/lib.js';

test('buildScanQueries ordena de más a menos selectiva', () => {
  assert.deepEqual(buildScanQueries({ number: '23', total: 165, names: ['Charmander'] }), [
    'name:"Charmander*" number:23',
    'number:23 set.printedTotal:165',
    'name:"Charmander*"',
  ]);
  assert.deepEqual(buildScanQueries({ number: '23', total: 165, names: [] }), ['number:23 set.printedTotal:165']);
  assert.deepEqual(buildScanQueries({ number: null, total: null, names: [] }), []);
});

import { normalizeCard, parseSearchText, sameNumber, numberVariants } from '../src/lib.js';

const CM = { updated: '2026-09-30T09:52:39.658Z', unit: 'EUR', idProduct: 511535, avg: 0.12, low: 0.02, trend: 0.17, avg1: 0.12, avg7: 0.09, avg30: 0.12, 'trend-holo': 0.77, 'avg-holo': 0.68, 'low-holo': 0.02, 'avg1-holo': 2.5, 'avg7-holo': 1.27, 'avg30-holo': 0.63 };
const TP = { unit: 'USD', updated: '2026-09-30T09:52:54.019Z', normal: { productId: 226392, lowPrice: 0.01, midPrice: 0.29, highPrice: 25, marketPrice: 0.27, directLowPrice: null }, 'reverse-holofoil': { productId: 226392, lowPrice: 0.1, midPrice: 0.52, highPrice: 19.84, marketPrice: 0.5 } };
const RAW = { id: 'swsh4-23', localId: '23', name: 'Charmander', image: 'https://assets.tcgdex.net/es/swsh/swsh4/23', set: { name: 'Voltaje Vívido', cardCount: { official: 185, total: 203 } }, pricing: { cardmarket: CM, tcgplayer: TP } };

test('normalizeCard traduce la ficha de TCGdex a la forma interna', () => {
  const c = normalizeCard(RAW);
  assert.equal(c.id, 'swsh4-23');
  assert.equal(c.number, '23');
  assert.equal(c.set.printedTotal, 185);
  assert.equal(c.images.small, 'https://assets.tcgdex.net/es/swsh/swsh4/23/low.webp');
  assert.equal(c.cardmarket.prices.trendPrice, 0.17);
  assert.equal(c.cardmarket.prices.avg7, 0.09);
  assert.equal(c.cardmarket.updatedAt, '2026-09-30T09:52:39.658Z');
  assert.equal(c.tcgplayer.prices.normal.market, 0.27);
  assert.equal(c.tcgplayer.url, 'https://www.tcgplayer.com/product/226392');
  assert.equal(cardValue(c), 0.17);
});

test('normalizeCard usa los precios holo si no hay tendencia normal y tolera cartas sin precios ni imagen', () => {
  const holoOnly = normalizeCard({ ...RAW, pricing: { cardmarket: { ...CM, trend: null, avg: null, low: null } } });
  assert.equal(holoOnly.cardmarket.prices.trendPrice, 0.77);
  assert.equal(cardValue(holoOnly), 0.77);
  const bare = normalizeCard({ id: 'x-1', localId: '1', name: 'X' });
  assert.equal(cardValue(bare), null);
  assert.deepEqual(bare.images, {});
  assert.equal(bare.cardmarket, undefined);
  assert.equal(normalizeCard(null), null);
});

test('parseSearchText y sameNumber/numberVariants', () => {
  assert.deepEqual(parseSearchText('charizard 199/165'), { name: 'charizard', number: '199' });
  assert.deepEqual(parseSearchText('  Mr. Mime '), { name: 'Mr. Mime', number: null });
  assert.equal(parseSearchText('a'), null);
  assert.equal(sameNumber('023', '23'), true);
  assert.equal(sameNumber('SWSH092', '92'), false);
  assert.deepEqual(numberVariants('4'), ['4', '04', '004']);
  assert.deepEqual(numberVariants('123'), ['123']);
});

test('parseCardText descarta números poco verosímiles y acepta la barra leída como |', () => {
  assert.equal(parseCardText('HP 60/20 x\n023/165').number, '23');
  assert.equal(parseCardText('023|165').total, 165);
  assert.equal(parseCardText('5/8').number, null); // total < 10
  assert.equal(parseCardText('199/165').number, '199'); // secreta: supera el total
});
