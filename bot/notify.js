// Avisos: siempre por consola; por Telegram si hay TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.
const eur = (n) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export function formatDeal(d) {
  const tag = d.kind === 'zero' ? '🚨 PRECIO ~0 €' : `🔥 -${d.discount}%`;
  const was = d.reference != null ? ` (antes ${eur(d.reference)}, -${d.discount}%)` : '';
  return `${tag}\n${d.name || '(sin nombre)'}\n${eur(d.price)}${was}\n${d.url}`;
}

export async function notify(deals, env = process.env) {
  for (const d of deals) console.log(`\n${formatDeal(d)}`);
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = env;
  if (!token || !chat) return;
  for (const d of deals) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: formatDeal(d), disable_web_page_preview: false }),
    });
    if (!res.ok) console.error(`Telegram ${res.status}`);
  }
}
