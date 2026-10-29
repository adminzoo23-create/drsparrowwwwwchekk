import { handleWebhook } from '../src/webhook.js';

// Web standard Vercel Function: https://TU-DOMINIO.vercel.app/api/telegram
export default { fetch: handleWebhook };
