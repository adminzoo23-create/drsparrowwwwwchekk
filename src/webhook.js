import { timingSafeEqual } from 'node:crypto';
import { processUpdate } from './bot.js';

function safeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function handleWebhook(request, { env = process.env, fetchImpl = fetch } = {}) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || secret === 'REEMPLAZAR_POR_SECRETO_ALEATORIO') return json({ error: 'Not configured' }, 503);
  const supplied = request.headers.get('x-telegram-bot-api-secret-token');
  if (!safeEquals(supplied, secret)) return json({ error: 'Forbidden' }, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Unsupported content type' }, 415);
  }
  let update;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return json({ error: 'Payload too large' }, 413);
    update = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  // Respondemos con sendMessage dentro del webhook de Telegram: sin otro request a Telegram.
  const message = await processUpdate(update, { env, fetchImpl });
  if (!message) return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  return json({
    method: 'sendMessage',
    chat_id: message.chatId,
    text: message.text,
    reply_parameters: { message_id: message.replyTo, allow_sending_without_reply: true }
  });
}
