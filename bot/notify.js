// Avisos: siempre por consola; por Telegram si hay TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.
const eur = (n) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export function formatDeal(d) {
  const tag = d.kind === 'zero' ? '🚨 PRECIO ~0 €' : d.kind === 'error' ? '⚠️ POSIBLE ERROR DE PRECIO' : `🔥 -${d.discount}%`;
  const was = d.reference != null ? ` (antes ${eur(d.reference)}, -${d.discount}%)` : '';
  const price = d.price != null ? `\n${eur(d.price)}${was}` : '';
  return `${tag}\n${d.name || '(sin nombre)'}${price}\n${d.url}`;
}

export async function notifyText(text, env = process.env) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = env;
  if (!token || !chat) { console.warn('Telegram no configurado (faltan los secretos).'); return; }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text }),
  });
  if (!res.ok) console.error(`Telegram ${res.status}`);
}

export async function notify(deals, env = process.env) {
  for (const d of deals) {
    console.log(`\n${formatDeal(d)}`);
    await notifyText(formatDeal(d), env);
  }
}
