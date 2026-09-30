import { cardValue, changePct, chartPoints, collectionTotal, esc, parseCardText, rankMatches, parseTarget, checkAlerts, parseSearchText } from './lib.js';
import { getCard, loadCards, searchByName, findByNumber, net } from './tcgdex.js';
import { CONFIG } from './config.js';

const KEY_OWNED = 'pokeprice.owned.v2';
const KEY_CARDS = 'pokeprice.cards.v2';
const KEY_ALERTS = 'pokeprice.alerts.v2';
const CHECK_EVERY_MS = 15 * 60 * 1000;

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const usd = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' });
const pctFmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const $app = document.getElementById('app');
const state = { cards: load(KEY_CARDS, {}), owned: load(KEY_OWNED, {}), alerts: load(KEY_ALERTS, {}), alertForm: null, alertErr: '', search: { text: '', results: null, status: 'idle' }, scan: { status: 'idle', msg: '', preview: null, info: '', results: null } };

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save() {
  try {
    localStorage.setItem(KEY_OWNED, JSON.stringify(state.owned));
    localStorage.setItem(KEY_ALERTS, JSON.stringify(state.alerts));
    // Solo guardamos instantáneas de las cartas de la colección y de las alertas.
    const keep = {};
    for (const id of [...Object.keys(state.owned), ...Object.keys(state.alerts)]) if (state.cards[id]) keep[id] = state.cards[id];
    localStorage.setItem(KEY_CARDS, JSON.stringify(keep));
  } catch { /* almacenamiento no disponible: la app sigue funcionando en memoria */ }
}

const money = (n) => (n == null ? '—' : eur.format(n));
const pct = (n) => (n == null ? '' : `${n >= 0 ? '+' : '−'}${pctFmt.format(Math.abs(n))}%`);
const pctClass = (n) => (n == null ? '' : n >= 0 ? 'up' : 'down');
const dateEs = (s) => (s ? String(s).slice(0, 10).replace(/\//g, '-') : '');

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
    ${rows ? `<div class="list">${rows}</div>` : `<p class="empty">Aún no tienes cartas. Busca una y pulsa «Añadir a mi colección».</p>`}
    <p class="legal">Proyecto de aficionados, sin relación con Nintendo, Game Freak ni The Pokémon Company. Pokémon y sus ilustraciones son marcas de sus propietarios. Precios vía TCGdex (Cardmarket y TCGplayer), actualizados a diario; no son ofertas de compra ni venta.</p>`;
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
  if (s.status === 'error') return `<p class="empty error" role="alert">No se pudo consultar TCGdex (${esc(net.lastError ?? 'sin conexión')}). Inténtalo de nuevo.</p>`;
  if (s.results == null) return '<p class="empty">Escribe al menos 2 letras.</p>';
  if (!s.results.length) return '<p class="empty">Sin resultados.</p>';
  const more = s.total > s.results.length ? `<p class="hint">Mostrando ${s.results.length} de ${s.total}. Añade el número de la carta para afinar (p. ej. «${esc(s.text.trim().split(' ')[0])} 23»).</p>` : '';
  return `<div class="list">${s.results.map(cardRow).join('')}</div>${more}`;
}

function viewScan() {
  const sc = state.scan;
  const busy = sc.status === 'working';
  return `<header class="top"><h1>Escanear carta</h1></header>
    <p class="hint">Haz una foto (o elige una de tu galería) con la carta plana, bien iluminada y ocupando casi toda la imagen. Tiene que verse el nombre y el número de abajo (por ejemplo 199/165). Todo se lee en tu móvil; la foto no se sube a ningún sitio.</p>
    <div class="two">
      <label class="btn pri filebtn${busy ? ' disabled' : ''}" for="scan-cam">${busy ? 'Leyendo…' : 'Hacer foto'}</label>
      <label class="btn ghost filebtn${busy ? ' disabled' : ''}" for="scan-file">Elegir de galería</label>
    </div>
    <input id="scan-cam" class="sr-only" type="file" accept="image/*" capture="environment" ${busy ? 'disabled' : ''}>
    <input id="scan-file" class="sr-only" type="file" accept="image/*" ${busy ? 'disabled' : ''}>
    ${sc.preview ? `<img class="scan-prev" src="${esc(sc.preview)}" alt="Foto de la carta">` : ''}
    <div id="scan-out">${scanOut()}</div>`;
}

function scanOut() {
  const sc = state.scan;
  const msg = sc.msg ? `<p class="empty ${sc.status === 'error' ? 'error' : ''}" ${sc.status === 'error' ? 'role="alert"' : ''}>${esc(sc.msg)}</p>` : '';
  const raw = sc.raw ? `<details class="raw"><summary>Texto leído de la foto</summary><pre>${esc(sc.raw.slice(0, 400))}</pre></details>` : '';
  const info = (sc.info ? `<small class="src">Leído: ${esc(sc.info)}</small>` : '') + raw;
  if (!sc.results) return msg + info;
  if (!sc.results.length) return `${msg || '<p class="empty">No encontré ninguna carta con lo leído.</p>'}${info}`;
  return `<h2>Posibles coincidencias</h2><div class="list">${sc.results.slice(0, 8).map(cardRow).join('')}</div>${info}<small class="src">Comprueba que sea la tuya antes de añadirla.</small>`;
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
      <small class="src">Datos vía TCGdex. Cardmarket actualizado: ${esc(dateEs(card.cardmarket?.updatedAt)) || 'n/d'}. Son medias, no el precio en tiempo real.</small>
      <div class="links">${linkTo(card.cardmarket?.url, 'Ver en Cardmarket')}${linkTo(card.tcgplayer?.url, 'Ver en TCGplayer')}</div>
    </section>
    ${alertPanel(id, card)}
    <div class="bar"><button class="btn ${owned ? 'sec' : 'pri'}" data-action="toggle" data-id="${esc(id)}">${owned ? 'Quitar de mi colección' : 'Añadir a mi colección'}</button></div>`;
}

const fmtDate = (ts) => new Date(ts).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
const alertText = (a) => `${a.dir === 'above' ? 'Sube de' : 'Baja de'} ${money(a.target)}`;

function alertPanel(id, card) {
  const a = state.alerts[id];
  const value = cardValue(card);
  let body;
  if (state.alertForm === id) {
    body = `<form id="alert-form" data-id="${esc(id)}" novalidate>
      <div class="two">
        <div><label for="a-dir" class="lbl">Avísame cuando</label>
          <select id="a-dir" name="dir"><option value="below">baje de</option><option value="above">suba de</option></select></div>
        <div><label for="a-target" class="lbl">Precio (€)</label>
          <input id="a-target" name="target" inputmode="decimal" autocomplete="off" value="${value != null ? esc(String(value).replace('.', ',')) : ''}"></div>
      </div>
      ${state.alertErr ? `<p class="error" role="alert">${esc(state.alertErr)}</p>` : ''}
      <div class="links"><button class="btn pri sm" type="submit">Guardar alerta</button><button class="btn ghost sm" type="button" data-action="alert-cancel">Cancelar</button></div>
    </form>`;
  } else if (a?.triggered) {
    body = `<p class="alert-hit"><b>Disparada</b> · ${alertText(a)}: llegó a ${money(a.triggered.value)} (${esc(fmtDate(a.triggered.at))})</p>
      <div class="links"><button class="btn pri sm" data-action="alert-rearm" data-id="${esc(id)}">Volver a activar</button><button class="btn ghost sm" data-action="alert-del" data-id="${esc(id)}">Eliminar</button></div>`;
  } else if (a) {
    body = `<p>${alertText(a)} · ahora ${money(value)}</p>
      <div class="links"><button class="btn ghost sm" data-action="alert-del" data-id="${esc(id)}">Eliminar alerta</button></div>`;
  } else {
    body = `<p class="hint">Te aviso cuando el precio de tendencia cruce el importe que elijas.</p>
      <div class="links"><button class="btn ghost sm" data-action="alert-open" data-id="${esc(id)}">Crear alerta</button></div>`;
  }
  return `<section class="panel"><b>Alerta de precio</b>${body}</section>`;
}

function viewAlerts() {
  const entries = Object.entries(state.alerts).filter(([id]) => state.cards[id]);
  const canNotify = 'Notification' in window && Notification.permission === 'default';
  const rows = entries
    .sort(([, x], [, y]) => (y.triggered ? 1 : 0) - (x.triggered ? 1 : 0))
    .map(([id, a]) => {
      const c = state.cards[id];
      const status = a.triggered ? `<small class="up">Disparada · ${money(a.triggered.value)}</small>` : `<small>Ahora ${money(cardValue(c))}</small>`;
      return `<a class="row${a.triggered ? ' hit' : ''}" href="#/carta/${esc(id)}">${thumb(c)}
        <span class="grow"><b>${esc(c.name)}</b><small>${esc(c.set?.name)} · ${esc(c.number)}</small></span>
        <span class="right"><b>${alertText(a)}</b>${status}</span></a>`;
    }).join('');
  return `<header class="top"><h1>Alertas</h1></header>
    <p class="hint">Se comprueban cada 15 minutos <b>mientras la app está abierta</b>. Con la app cerrada no se envían avisos: eso necesitaría un servidor.</p>
    ${canNotify ? '<button class="btn ghost sm" data-action="notif">Activar avisos del navegador</button>' : ''}
    ${rows ? `<div class="list" style="margin-top:12px">${rows}</div>` : '<p class="empty">No tienes alertas. Crea una desde la ficha de una carta.</p>'}`;
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
  const dots = xy.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="currentColor"/>`).join('');
  const labels = pts.map((p) => `<span>${p.label}<b>${money(p.value)}</b></span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolución del precio: ${pts.map((p) => `${p.label} ${money(p.value)}`).join(', ')}"><polyline fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${line}"/>${dots}</svg><div class="axis">${labels}</div>`;
}

function tabs(route) {
  const on = (r) => (route === r ? ' on' : '');
  const hits = Object.values(state.alerts).filter((a) => a.triggered).length;
  return `<nav class="tabs"><a class="${on('coleccion').trim()}" href="#/">Colección</a><a class="${on('escanear').trim()}" href="#/escanear">Escanear</a><a class="${on('buscar').trim()}" href="#/buscar">Buscar</a><a class="${on('alertas').trim()}" href="#/alertas">Alertas${hits ? `<span class="dot" aria-label="${hits} disparadas">${hits}</span>` : ''}</a></nav>`;
}

// ---------- Router ----------

let prevHash = '#/';

async function render() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/carta\/([\w.-]+)$/);
  const route = m ? 'carta' : hash.startsWith('#/buscar') ? 'buscar' : hash.startsWith('#/escanear') ? 'escanear' : hash.startsWith('#/alertas') ? 'alertas' : 'coleccion';
  if (route !== 'carta') prevHash = hash;
  window.scrollTo(0, 0);

  if (route === 'carta') {
    $app.innerHTML = viewDetail(m[1]);
    if (!state.cards[m[1]]) {
      try {
        { const c = await getCard(m[1]); if (!c) throw new Error('no encontrada'); state.cards[c.id] = c; }
      } catch {
        if (location.hash === hash) document.getElementById('detail-status').textContent = 'No se pudo cargar la carta.';
        return;
      }
      if (location.hash === hash) $app.innerHTML = viewDetail(m[1]);
    }
    return;
  }

  if (route === 'alertas') {
    $app.innerHTML = viewAlerts() + tabs('alertas');
    checkAllAlerts();
    return;
  }

  if (route === 'escanear') {
    $app.innerHTML = viewScan() + tabs('escanear');
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
  const setSync = (t) => { const el = document.getElementById('sync'); if (el && location.hash === hash) el.textContent = t; };
  if (!ids.length) return;
  setSync('Actualizando precios…');
  const { ok, failed } = await loadCards(ids, state.cards);
  if (!ok) { setSync('Sin conexión: mostrando los últimos precios guardados'); return; }
  save();
  if ((location.hash || '#/') === hash) {
    $app.innerHTML = viewCollection() + tabs('coleccion');
    setSync(failed ? `Precios actualizados (${ok} de ${ids.length})` : 'Precios actualizados ahora');
  }
}

let searchTimer;
let searchSeq = 0;
function onSearchInput(e) {
  const text = e.target.value;
  state.search.text = text;
  clearTimeout(searchTimer);
  const parsed = parseSearchText(text);
  if (!parsed) { state.search = { text, results: null, status: 'idle' }; paintResults(); return; }
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    state.search.status = 'loading';
    paintResults();
    try {
      const { cards, total } = await searchByName(parsed.name, { number: parsed.number, cache: state.cards });
      if (seq !== searchSeq) return;
      state.search.results = cards;
      state.search.total = total;
      state.search.status = 'ok';
    } catch {
      if (seq !== searchSeq) return;
      state.search.status = 'error';
    }
    paintResults();
  }, 400);
}
function paintResults() {
  const el = document.getElementById('results');
  if (el) el.innerHTML = resultsHtml();
}

let scanSeq = 0;
function paintScan(full) {
  if (!location.hash.startsWith('#/escanear')) return;
  if (full) $app.innerHTML = viewScan() + tabs('escanear');
  else { const el = document.getElementById('scan-out'); if (el) el.innerHTML = scanOut(); }
}

async function toCanvas(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas;
}

let ocrPromise = null;
function loadOcr() {
  // Un único lector reutilizable; modo de texto disperso (PSM 11) porque una carta no es una página de texto.
  ocrPromise ??= (async () => {
    const mod = await import(/* @vite-ignore */ CONFIG.ocrModule);
    const T = mod.default ?? mod;
    if (T.createWorker) {
      const worker = await T.createWorker('eng');
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      return (canvas) => worker.recognize(canvas).then((r) => r.data.text);
    }
    return (canvas) => T.recognize(canvas, 'eng').then((r) => r.data.text);
  })().catch((err) => { ocrPromise = null; throw err; });
  return ocrPromise;
}

/** Escala de grises + estiramiento de contraste (ignora el 2 % más oscuro y más claro) y, si toca, giro. */
function enhance(src, rotate = 0) {
  const k = Math.min(2, 2200 / Math.max(src.width, src.height));
  const w = Math.round(src.width * k), h = Math.round(src.height * k);
  const c = document.createElement('canvas');
  const swap = rotate % 180 !== 0;
  c.width = swap ? h : w; c.height = swap ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; hist[g]++; }
  const total = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const g = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = g; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Lee la foto en varias pasadas y para en cuanto encuentra un número de carta verosímil. */
async function readCard(canvas, onStep) {
  const ocr = await loadOcr();
  const passes = [
    ['Leyendo la carta…', () => canvas],
    ['Mejorando el contraste…', () => enhance(canvas)],
    ['Probando la foto girada…', () => enhance(canvas, 90)],
    ['Probando la foto girada al revés…', () => enhance(canvas, 270)],
  ];
  let all = '';
  for (const [label, make] of passes) {
    onStep(label);
    all += '\n' + (await ocr(make()));
    if (parseCardText(all).number) break;
  }
  return all.trim();
}

async function scanFile(file) {
  const seq = ++scanSeq;
  const sc = state.scan;
  if (sc.preview) URL.revokeObjectURL(sc.preview);
  Object.assign(sc, { status: 'working', msg: 'Leyendo la carta… la primera vez descarga el lector de texto (unos segundos).', preview: URL.createObjectURL(file), info: '', raw: '', results: null });
  paintScan(true);
  const fail = (msg) => { if (seq === scanSeq) { Object.assign(sc, { status: 'error', msg, results: null }); paintScan(true); } };
  let text;
  try {
    const canvas = await toCanvas(file);
    text = await readCard(canvas, (label) => { if (seq === scanSeq) { sc.msg = label; paintScan(false); } });
  } catch {
    return fail('No se pudo leer la imagen. Comprueba tu conexión (el lector de texto se descarga una vez) e inténtalo de nuevo.');
  }
  if (seq !== scanSeq) return;
  sc.raw = text;
  const parsed = parseCardText(text);
  const info = [parsed.number ? `${parsed.number}/${parsed.total}` : null, parsed.names[0]].filter(Boolean).join(' · ');
  if (!parsed.names.length && !(parsed.number && parsed.total)) return fail('No pude leer el nombre ni el número. Prueba con más luz, la carta plana y más cerca.');
  // 1) por nombre en varios idiomas (la carta puede estar en alemán, español…); 2) por número y total impreso.
  let data = [];
  let netFail = false;
  try {
    for (const name of parsed.names.slice(0, 2)) {
      data = (await searchByName(name, { langs: CONFIG.scanLangs, number: parsed.number, cache: state.cards })).cards;
      if (seq !== scanSeq) return;
      if (data.length) break;
    }
  } catch { netFail = true; }
  if (!data.length && parsed.number && parsed.total) {
    try { data = await findByNumber(parsed.number, parsed.total, { cache: state.cards }); netFail = false; } catch { netFail = true; }
  }
  if (seq !== scanSeq) return;
  if (!data.length && netFail) {
    return fail(`Leí la carta (${info || 'sin datos claros'}) pero TCGdex no respondió: ${net.lastError ?? 'sin conexión'}. Inténtalo de nuevo o usa Buscar.`);
  }
  Object.assign(sc, { status: 'done', msg: '', info, results: rankMatches(data, text) });
  paintScan(true);
}

// ---------- Alertas: comprobación ----------

function notify(ids) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  for (const id of ids) {
    const a = state.alerts[id], c = state.cards[id];
    if (!a || !c) continue;
    try { new Notification('PokéPrice', { body: `${c.name}: ${alertText(a)} → ${money(a.triggered.value)}` }); } catch { /* algunos móviles exigen service worker */ }
  }
}

function applyAlertCheck() {
  const r = checkAlerts(state.alerts, state.cards);
  state.alerts = r.alerts;
  if (r.fired.length) { save(); notify(r.fired); }
  return r.fired;
}

let checking = false;
async function checkAllAlerts() {
  if (checking) return;
  const pending = Object.keys(state.alerts);
  if (!pending.length) return;
  checking = true;
  try {
    const { ok } = await loadCards(pending, state.cards);
    if (!ok) return;
    const fired = applyAlertCheck();
    save();
    const route = location.hash || '#/';
    if (route.startsWith('#/alertas')) $app.innerHTML = viewAlerts() + tabs('alertas');
    else if (fired.length) {
      // Solo actualizamos la pestaña (contador), sin tocar la vista en curso.
      const nav = document.querySelector('.tabs');
      const tab = route.startsWith('#/buscar') ? 'buscar' : route.startsWith('#/escanear') ? 'escanear' : 'coleccion';
      if (nav) { const tmp = document.createElement('div'); tmp.innerHTML = tabs(tab); nav.replaceWith(tmp.firstElementChild); }
    }
  } catch { /* sin conexión: se reintenta en el próximo ciclo */ } finally { checking = false; }
}

setInterval(checkAllAlerts, CHECK_EVERY_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAllAlerts(); });

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'alert-form') return;
  e.preventDefault();
  const id = e.target.dataset.id;
  const target = parseTarget(e.target.elements.target.value);
  if (target == null) { state.alertErr = 'Escribe un importe válido, por ejemplo 250 o 96,40.'; render(); return; }
  state.alerts[id] = { dir: e.target.elements.dir.value === 'above' ? 'above' : 'below', target, createdAt: Date.now(), triggered: null };
  state.alertForm = null; state.alertErr = '';
  applyAlertCheck();
  save();
  render();
});

document.addEventListener('change', (e) => {
  if ((e.target.id === 'scan-file' || e.target.id === 'scan-cam') && e.target.files?.[0]) {
    const f = e.target.files[0];
    e.target.value = '';
    scanFile(f);
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'back') location.hash = prevHash;
  const act = btn.dataset.action;
  if (act === 'alert-open') { state.alertForm = btn.dataset.id; state.alertErr = ''; render(); }
  if (act === 'alert-cancel') { state.alertForm = null; state.alertErr = ''; render(); }
  if (act === 'alert-del') { delete state.alerts[btn.dataset.id]; save(); render(); }
  if (act === 'alert-rearm') { const a = state.alerts[btn.dataset.id]; if (a) { a.triggered = null; applyAlertCheck(); save(); render(); } }
  if (act === 'notif') Notification.requestPermission().then(() => render());
  if (btn.dataset.action === 'toggle') {
    const id = btn.dataset.id;
    if (state.owned[id] > 0) delete state.owned[id]; else state.owned[id] = 1;
    save();
    render();
  }
});

window.addEventListener('hashchange', render);
render();
