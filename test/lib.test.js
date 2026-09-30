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
