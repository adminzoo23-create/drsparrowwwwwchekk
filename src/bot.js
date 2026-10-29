import { isValidBin, lookupBin, BinLookupError } from './bin-client.js';

const clean = (v, fallback = 'No disponible') => {
  if (typeof v !== 'string' || !v.trim()) return fallback;
  return v.replace(/[\x00-\x1f\x7f\u2028\u2029]/g, ' ').trim().slice(0, 110) || fallback;
};

const boolLabel = (v) => v === null ? 'No disponible' : v ? 'Sí' : 'No';

export function formatBinResult(data) {
  const lines = [
    data.simulated ? '🧪 RESULTADO DE PRUEBA / DEMOSTRACIÓN' : '💳 CONSULTA BIN / IIN',
    '',
    `🔢 BIN: ${data.bin}`,
    `💳 Franquicia: ${clean(data.network)}`,
    `⭐ Nivel / categoría: ${clean(data.level)}`,
    `💰 Tipo: ${clean(data.type)}`,
    `🏦 Banco emisor: ${clean(data.issuer)}`,
    `🌎 País: ${clean(data.flag, '')} ${clean(data.country)}`.trim(),
    `💱 Moneda: ${clean(data.currency)}`
  ];
  if (data.prepaid !== null) lines.push(`🪙 Prepago: ${boolLabel(data.prepaid)}`);
  if (data.commercial !== null) lines.push(`🏢 Comercial: ${boolLabel(data.commercial)}`);
  lines.push('', `📚 Fuente: ${clean(data.provider)}`);
  if (!data.level) lines.push('ℹ️ El proveedor no informó el nivel. No se puede deducir con certeza.');
  if (data.simulated) lines.push('⚠️ Resultado de prueba: no usar para identificar tarjetas reales.');
  else lines.push('ℹ️ Son metadatos orientativos del BIN, no una verificación de la tarjeta.');
  return lines.join('\n');
}

const helpText = `🤖 BIN Checker — comandos

/bin 123456 — Consultar 6 dígitos
/bin 12345678 — Consultar 8 dígitos
/id — Ver tu ID para autorizarlo
/ayuda — Ver esta ayuda

En un chat privado también puedes enviar solo los 6 u 8 dígitos.

🔐 Nunca envíes un número completo de tarjeta, fecha de vencimiento ni CVV. Los resultados dependen del proveedor de información.`;

function userAllowed(userId, env) {
  const raw = env.ALLOWED_USER_IDS?.trim();
  if (!raw) return true;
  const allowed = raw.split(',').map(v => v.trim()).filter(Boolean);
  return allowed.includes(String(userId));
}

function parseText(text, isPrivate) {
  const s = text.trim();
  const match = /^\/(start|help|ayuda|id|bin)(?:@[A-Za-z][A-Za-z0-9_]{0,31})?(?:\s+([\s\S]*))?$/i.exec(s);
  if (match) return { command: match[1].toLowerCase(), arg: (match[2] || '').trim() };
  if (isPrivate) return { command: 'bin', arg: s };
  return null;
}

export async function processUpdate(update, { env = process.env, fetchImpl = fetch } = {}) {
  const message = update?.message;
  if (!message || typeof message.text !== 'string' || message.from?.is_bot) return null;
  if (!message.chat || !Number.isSafeInteger(message.chat.id) || !Number.isSafeInteger(message.message_id)) return null;
  const chatId = message.chat.id;
  const fromId = message.from?.id;
  const parsed = parseText(message.text, message.chat.type === 'private');
  if (!parsed) return null;

  const reply = (text) => ({ chatId, replyTo: message.message_id, text });
  if (parsed.command === 'id') return reply(`🆔 Tu ID de Telegram: ${String(fromId ?? 'desconocido')}`);
  if (!userAllowed(fromId, env)) return reply('⛔ No estás autorizado para usar este bot. Usa /id y solicita al administrador que habilite tu ID.');
  if (parsed.command === 'start' || parsed.command === 'help' || parsed.command === 'ayuda') return reply(helpText);
  if (parsed.command !== 'bin') return null;
  if (!parsed.arg) return reply('Escribe /bin 123456 o /bin 12345678. Solo los primeros 6 u 8 dígitos.');
  if (!isValidBin(parsed.arg)) return reply('❌ BIN no válido. Envía únicamente 6 u 8 dígitos numéricos. Nunca el número completo de una tarjeta.');

  try {
    const data = await lookupBin(parsed.arg, { env, fetchImpl });
    return reply(formatBinResult(data));
  } catch (error) {
    if (!(error instanceof BinLookupError)) return reply('⚠️ No fue posible completar la consulta. Intenta más tarde.');
    const messages = {
      NOT_FOUND: '🔎 No se encontró información para este BIN. Puedes probar con los primeros 8 dígitos si los tienes.',
      MISSING_API_KEY: '⚙️ El administrador debe configurar la clave del proveedor BIN en Vercel.',
      API_ACCESS: '⚠️ El proveedor no autorizó la consulta o se agotó el cupo. Contacta al administrador.',
      RATE_LIMIT: '⏳ Se alcanzó el límite de consultas del proveedor. Intenta más tarde.',
      UPSTREAM_ERROR: '⚠️ El proveedor BIN no está disponible en este momento.',
      DEMO_NOT_ALLOWED: '⚙️ El modo DEMO está deshabilitado en Vercel. Configura un proveedor real.',
      UNKNOWN_PROVIDER: '⚙️ El proveedor BIN no está configurado correctamente.'
    };
    return reply(messages[error.code] ?? '⚠️ Error consultando el BIN.');
  }
}
