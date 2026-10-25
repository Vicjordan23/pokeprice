// Bot de chollos: recorre las páginas de config.json, detecta precios ~0 € o descuentos enormes y avisa.
// Uso: node bot/run.js [--loop] [--config bot/config.json]
import { readFile, writeFile } from 'node:fs/promises';
import { classify } from './detect.js';
import { extractProducts } from './extract.js';
import { parseFeed, analyzeItem, shipsToSpain } from './rss.js';
import { notify, notifyText } from './notify.js';

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const configPath = arg('--config', new URL('./config.json', import.meta.url).pathname);
const statePath = new URL('./state.json', import.meta.url).pathname;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p, def) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return def; } };

const robotsCache = new Map();
async function allowedByRobots(url, ua) {
  const { origin, pathname } = new URL(url);
  if (!robotsCache.has(origin)) {
    let rules = [];
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': ua } });
      if (res.ok) rules = parseRobots(await res.text());
    } catch { /* sin robots.txt accesible: se asume permitido */ }
    robotsCache.set(origin, rules);
  }
  const hit = robotsCache.get(origin).filter((p) => pathname.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  return !hit;
}

function parseRobots(txt) {
  const disallow = [];
  let applies = false;
  for (const line of txt.split('\n')) {
    const [k, ...v] = line.split('#')[0].split(':');
    const key = k.trim().toLowerCase(), val = v.join(':').trim();
    if (key === 'user-agent') applies = val === '*';
    else if (applies && key === 'disallow' && val) disallow.push(val);
  }
  return disallow;
}

async function scanOnce(config, state) {
  const ua = config.userAgent ?? 'PriceErrorWatch/0.1 (+personal use)';
  const found = [];
  for (const page of config.pages) {
    try {
      if (!(await allowedByRobots(page.url, ua))) { console.warn(`robots.txt no permite ${page.url}`); continue; }
      const res = await fetch(page.url, { headers: { 'user-agent': ua, 'accept-language': 'es-ES,es;q=0.9' } });
      if (!res.ok) { console.warn(`${res.status} ${page.url}`); continue; }
      if (page.type === 'rss') {
        const items = parseFeed(await res.text());
        console.log(`${page.store ?? ''} ${page.url}: ${items.length} chollos leídos`);
        for (const it of items) {
          if (page.onlySpainStores && !shipsToSpain(it)) continue;
          const deal = analyzeItem(it, config.thresholds);
          if (deal && !state.alerted[it.link]) { state.alerted[it.link] = deal.price ?? 1; found.push(deal); }
        }
        await sleep(config.delayMs ?? 5000);
        continue;
      }
      const products = extractProducts(await res.text(), page.url);
      console.log(`${page.store ?? ''} ${page.url}: ${products.length} productos leídos`);
      for (const p of products) {
        const hist = state.prices[p.url] ?? {};
        // Referencia: precio tachado de la página o el precio "normal" más alto visto antes.
        const reference = p.reference ?? hist.max ?? null;
        const verdict = classify({ price: p.price, reference, inStock: p.inStock }, config.thresholds);
        state.prices[p.url] = { max: Math.max(hist.max ?? 0, p.price), last: p.price };
        if (verdict && state.alerted[p.url] !== p.price) {
          state.alerted[p.url] = p.price;
          found.push({ ...p, reference, ...verdict });
        }
      }
    } catch (e) {
      console.warn(`Error en ${page.url}: ${e.message}`);
    }
    await sleep(config.delayMs ?? 5000); // cortesía: no saturar las tiendas
  }
  return found;
}

async function main() {
  const config = await readJson(configPath, null);
  if (!config?.pages?.length) { console.error(`Falta ${configPath} (copia bot/config.example.json).`); process.exit(1); }
  const state = await readJson(statePath, { prices: {}, alerted: {} });
  do {
    const deals = await scanOnce(config, state);
    await writeFile(statePath, JSON.stringify(state, null, 1));
    if (deals.length) await notify(deals); else console.log(`${new Date().toISOString()} sin chollos`);
    if (args.includes('--test')) await notifyText('✅ Bot de chollos activo: la conexión con Telegram funciona.');
    if (!args.includes('--loop')) break;
    await sleep((config.intervalMinutes ?? 15) * 60_000);
  } while (true);
}

main();
