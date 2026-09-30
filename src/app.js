import { cardValue, changePct, chartPoints, buildQuery, buildIdsQuery, collectionTotal, esc } from './lib.js';
import { CONFIG } from './config.js';

const SELECT = 'id,name,number,rarity,set,images,tcgplayer,cardmarket';
const KEY_OWNED = 'pokeprice.owned.v1';
const KEY_CARDS = 'pokeprice.cards.v1';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const usd = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' });
const pctFmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const $app = document.getElementById('app');
const state = { cards: load(KEY_CARDS, {}), owned: load(KEY_OWNED, {}), search: { text: '', results: null, status: 'idle' } };

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save() {
  try {
    localStorage.setItem(KEY_OWNED, JSON.stringify(state.owned));
    // Solo guardamos instantáneas de las cartas de la colección.
    const keep = {};
    for (const id of Object.keys(state.owned)) if (state.cards[id]) keep[id] = state.cards[id];
    localStorage.setItem(KEY_CARDS, JSON.stringify(keep));
  } catch { /* almacenamiento no disponible: la app sigue funcionando en memoria */ }
}

async function api(params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const headers = CONFIG.apiKey ? { 'X-Api-Key': CONFIG.apiKey } : {};
    const res = await fetch(`${CONFIG.apiBase}/cards?${new URLSearchParams({ select: SELECT, ...params })}`, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    for (const c of json.data) state.cards[c.id] = c;
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

const money = (n) => (n == null ? '—' : eur.format(n));
const pct = (n) => (n == null ? '' : `${n >= 0 ? '+' : '−'}${pctFmt.format(Math.abs(n))}%`);
const pctClass = (n) => (n == null ? '' : n >= 0 ? 'up' : 'down');
const dateEs = (s) => (s ? String(s).replace(/\//g, '-') : '');

function thumb(card, cls = 'thumb') {
  const src = card.images?.small;
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy">` : `<div class="${cls} ph"></div>`;
}

function cardRow(card) {
  const ch = changePct(card);
  return `<a class="row" href="#/carta/${esc(card.id)}">
    ${thumb(card)}
    <span class="grow"><b>${esc(card.name)}</b><small>${esc(card.set?.name)} · ${esc(card.number)}</small></span>
    <span class="right"><b>${money(cardValue(card))}</b><small class="${pctClass(ch)}">${pct(ch)}</small></span>
  </a>`;
}

// ---------- Vistas ----------

function viewCollection() {
  const { total, count } = collectionTotal(state.owned, state.cards);
  const ids = Object.keys(state.owned).filter((id) => state.owned[id] > 0 && state.cards[id]);
  ids.sort((a, b) => (cardValue(state.cards[b]) ?? 0) - (cardValue(state.cards[a]) ?? 0));
  const rows = ids.map((id) => cardRow(state.cards[id])).join('');
  return `<header class="top"><h1><span class="accent">Poké</span>Price</h1></header>
    <section class="hero">
      <div class="label">Valor total estimado</div>
      <div class="big">${money(total)}</div>
      <div class="chips"><div><small>Cartas</small><b>${count}</b></div><div><small>Distintas</small><b>${ids.length}</b></div></div>
      <div class="label" id="sync"></div>
    </section>
    <h2>Tus cartas más valiosas</h2>
    ${rows ? `<div class="list">${rows}</div>` : `<p class="empty">Aún no tienes cartas. Busca una y pulsa «Añadir a mi colección».</p>`}`;
}

function viewSearch() {
  const s = state.search;
  return `<header class="top"><h1>Buscar carta</h1></header>
    <label for="q" class="lbl">Nombre (y número opcional, p. ej. «charizard 199»)</label>
    <div class="field"><input id="q" type="search" autocomplete="off" value="${esc(s.text)}" placeholder="Charizard"></div>
    <div id="results">${resultsHtml()}</div>`;
}

function resultsHtml() {
  const s = state.search;
  if (s.status === 'loading') return '<p class="empty">Buscando…</p>';
  if (s.status === 'error') return '<p class="empty error" role="alert">No se pudo consultar pokemontcg.io. Comprueba tu conexión e inténtalo de nuevo.</p>';
  if (s.results == null) return '<p class="empty">Escribe al menos 2 letras.</p>';
  if (!s.results.length) return '<p class="empty">Sin resultados.</p>';
  return `<div class="list">${s.results.map(cardRow).join('')}</div>`;
}

function viewDetail(id) {
  const card = state.cards[id];
  if (!card) return `<header class="top"><a class="back" href="#/buscar" aria-label="Volver">‹</a></header><p class="empty" id="detail-status">Cargando carta…</p>`;
  const cm = card.cardmarket?.prices;
  const ch = changePct(card);
  const owned = state.owned[id] > 0;
  const pts = chartPoints(card);
  return `<header class="top"><button class="back" data-action="back" aria-label="Volver">‹</button>${owned ? '<span class="badge">En tu colección</span>' : ''}</header>
    <section class="detail-head">
      ${card.images?.large ? `<img class="art" src="${esc(card.images.large)}" alt="${esc(card.name)}">` : '<div class="art ph"></div>'}
      <div>
        <small>${esc(card.set?.name)} · ${esc(card.number)}</small>
        <h2 class="name">${esc(card.name)}</h2>
        <div class="big">${money(cardValue(card))}</div>
        <small>Tendencia Cardmarket</small>
        <div class="${pctClass(ch)} chg">${ch == null ? '' : `${pct(ch)} · 7 días frente a 30 días`}</div>
      </div>
    </section>
    <section class="panel"><b>Evolución (medias de Cardmarket)</b>${chartSvg(pts)}</section>
    <section class="panel"><b>Por mercado</b>
      <div class="kv"><span>Cardmarket · desde</span><b>${money(cm?.lowPrice)}</b></div>
      <div class="kv"><span>Cardmarket · media de venta</span><b>${money(cm?.averageSellPrice)}</b></div>
      ${tcgRows(card)}
      <small class="src">Datos vía pokemontcg.io. Cardmarket actualizado: ${esc(dateEs(card.cardmarket?.updatedAt)) || 'n/d'}. Son medias, no el precio en tiempo real.</small>
      <div class="links">${linkTo(card.cardmarket?.url, 'Ver en Cardmarket')}${linkTo(card.tcgplayer?.url, 'Ver en TCGplayer')}</div>
    </section>
    <div class="bar"><button class="btn ${owned ? 'sec' : 'pri'}" data-action="toggle" data-id="${esc(id)}">${owned ? 'Quitar de mi colección' : 'Añadir a mi colección'}</button></div>`;
}

function tcgRows(card) {
  const prices = card.tcgplayer?.prices;
  if (!prices) return '';
  return Object.entries(prices)
    .filter(([, v]) => v && v.market != null)
    .map(([finish, v]) => `<div class="kv"><span>TCGplayer · ${esc(finish)}</span><b>${usd.format(v.market)}</b></div>`)
    .join('');
}

function linkTo(url, text) {
  return typeof url === 'string' && url.startsWith('https://') ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text}</a>` : '';
}

function chartSvg(pts) {
  if (pts.length < 2) return '<p class="empty">Sin histórico suficiente.</p>';
  const W = 320, H = 96, pad = 12;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const xy = pts.map((p, i) => [pad + (i * (W - 2 * pad)) / (pts.length - 1), H - pad - ((p.value - min) / span) * (H - 2 * pad)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dots = xy.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#C2410C"/>`).join('');
  const labels = pts.map((p) => `<span>${p.label}<b>${money(p.value)}</b></span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolución del precio: ${pts.map((p) => `${p.label} ${money(p.value)}`).join(', ')}"><polyline fill="none" stroke="#C2410C" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${line}"/>${dots}</svg><div class="axis">${labels}</div>`;
}

function tabs(route) {
  const on = (r) => (route === r ? ' on' : '');
  return `<nav class="tabs"><a class="${on('coleccion').trim()}" href="#/">Colección</a><a class="${on('buscar').trim()}" href="#/buscar">Buscar</a></nav>`;
}

// ---------- Router ----------

let prevHash = '#/';

async function render() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/carta\/([\w.-]+)$/);
  const route = m ? 'carta' : hash.startsWith('#/buscar') ? 'buscar' : 'coleccion';
  if (route !== 'carta') prevHash = hash;
  window.scrollTo(0, 0);

  if (route === 'carta') {
    $app.innerHTML = viewDetail(m[1]);
    if (!state.cards[m[1]]) {
      try {
        await api({ q: `id:${m[1]}` });
      } catch {
        if (location.hash === hash) document.getElementById('detail-status').textContent = 'No se pudo cargar la carta.';
        return;
      }
      if (location.hash === hash) $app.innerHTML = viewDetail(m[1]);
    }
    return;
  }

  if (route === 'buscar') {
    $app.innerHTML = viewSearch() + tabs('buscar');
    document.getElementById('q').addEventListener('input', onSearchInput);
    return;
  }

  $app.innerHTML = viewCollection() + tabs('coleccion');
  refreshCollection(hash);
}

async function refreshCollection(hash) {
  const ids = Object.keys(state.owned).filter((id) => state.owned[id] > 0);
  const q = buildIdsQuery(ids);
  const setSync = (t) => { const el = document.getElementById('sync'); if (el && location.hash === hash) el.textContent = t; };
  if (!q) return;
  setSync('Actualizando precios…');
  try {
    await api({ q, pageSize: String(Math.min(ids.length, 250)) });
    save();
    if ((location.hash || '#/') === hash) {
      $app.innerHTML = viewCollection() + tabs('coleccion');
      setSync('Precios actualizados ahora');
    }
  } catch {
    setSync('Sin conexión: mostrando los últimos precios guardados');
  }
}

let searchTimer;
let searchSeq = 0;
function onSearchInput(e) {
  const text = e.target.value;
  state.search.text = text;
  clearTimeout(searchTimer);
  const q = buildQuery(text);
  if (!q) { state.search = { text, results: null, status: 'idle' }; paintResults(); return; }
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    state.search.status = 'loading';
    paintResults();
    try {
      const data = await api({ q, pageSize: '30', orderBy: '-set.releaseDate' });
      if (seq !== searchSeq) return;
      state.search.results = data;
      state.search.status = 'ok';
    } catch {
      if (seq !== searchSeq) return;
      state.search.status = 'error';
    }
    paintResults();
  }, 350);
}
function paintResults() {
  const el = document.getElementById('results');
  if (el) el.innerHTML = resultsHtml();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'back') location.hash = prevHash;
  if (btn.dataset.action === 'toggle') {
    const id = btn.dataset.id;
    if (state.owned[id] > 0) delete state.owned[id]; else state.owned[id] = 1;
    save();
    render();
  }
});

window.addEventListener('hashchange', render);
render();
