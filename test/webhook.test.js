import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWebhook } from '../src/webhook.js';
import { processUpdate, formatBinResult } from '../src/bot.js';

const secret = '123456abcdef';
const message = (text, id = 123) => ({ message: { message_id: 8, text, chat: { id: 123, type: 'private' }, from: { id, is_bot: false } } });
const request = (update, token = secret) => new Request('https://example.vercel.app/api/telegram', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': token },
  body: JSON.stringify(update)
});

test('webhook rechaza peticiones sin secreto', async () => {
  const response = await handleWebhook(request(message('/start'), 'incorrecto'), { env: { TELEGRAM_WEBHOOK_SECRET: secret } });
  assert.equal(response.status, 403);
});

test('webhook devuelve respuesta sendMessage para Telegram', async () => {
  const response = await handleWebhook(request(message('/bin 999999')), { env: { TELEGRAM_WEBHOOK_SECRET: secret, BIN_PROVIDER: 'demo' } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.method, 'sendMessage');
  assert.equal(body.chat_id, 123);
  assert.match(body.text, /RESULTADO DE PRUEBA/);
});

test('solo un usuario autorizado puede consultar; /id sigue disponible', async () => {
  const env = { ALLOWED_USER_IDS: '999', BIN_PROVIDER: 'demo' };
  const denied = await processUpdate(message('/bin 999999'), { env });
  assert.match(denied.text, /No estás autorizado/);
  const id = await processUpdate(message('/id'), { env });
  assert.match(id.text, /123/);
});

test('mensaje con tarjeta completa se rechaza antes de consultar', async () => {
  let calls = 0;
  const result = await processUpdate(message('/bin 4111111111111111'), { env: { BIN_PROVIDER: 'binlist' }, fetchImpl: async () => { calls++; } });
  assert.match(result.text, /únicamente 6 u 8/);
  assert.doesNotMatch(result.text, /4111111111111111/);
  assert.equal(calls, 0);
});

test('niveles ausentes se muestran como no disponibles', () => {
  const result = formatBinResult({ bin: '123456', network: 'Visa', level: null, type: null, issuer: null, country: null, flag: null, currency: null, prepaid: null, commercial: null, simulated: false, provider: 'BINTable' });
  assert.match(result, /Nivel \/ categoría: No disponible/);
  assert.match(result, /no informó el nivel/);
});

test('en grupos ignora números sueltos', async () => {
  const update = message('123456');
  update.message.chat.type = 'group';
  assert.equal(await processUpdate(update, { env: { BIN_PROVIDER: 'demo' } }), null);
});
