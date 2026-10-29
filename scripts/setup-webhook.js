const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicUrl = process.env.PUBLIC_URL;

if (!token || token === 'REEMPLAZAR') throw new Error('Configura TELEGRAM_BOT_TOKEN en .env.');
if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret) || secret === 'REEMPLAZAR_POR_SECRETO_ALEATORIO') {
  throw new Error('Configura TELEGRAM_WEBHOOK_SECRET aleatorio (letras/numeros/guion/guion bajo).');
}
if (!publicUrl) throw new Error('Configura PUBLIC_URL en .env.');
const base = new URL(publicUrl);
if (base.protocol !== 'https:') throw new Error('PUBLIC_URL debe usar HTTPS.');
const url = new URL('/api/telegram', base).toString();

async function telegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(`Error de Telegram (${method}): ${data.description || res.status}`);
  return data;
}

await telegram('setWebhook', {
  url,
  secret_token: secret,
  allowed_updates: ['message'],
  max_connections: 10,
  drop_pending_updates: false
});
await telegram('setMyCommands', {
  commands: [
    { command: 'start', description: 'Instrucciones' },
    { command: 'bin', description: 'Consultar BIN de 6 u 8 dígitos' },
    { command: 'id', description: 'Ver tu ID de Telegram' },
    { command: 'ayuda', description: 'Ayuda del bot' }
  ]
});
console.log(`Webhook y comandos configurados correctamente: ${url}`);
