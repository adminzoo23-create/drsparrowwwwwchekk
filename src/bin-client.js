/**
 * Proveedores de información pública BIN/IIN. Nunca recibe PAN completo, CVV o expiración.
 * Las respuestas se normalizan sin inventar categorías/niveles.
 */
export class BinLookupError extends Error {
  constructor(code) {
    super(code);
    this.name = 'BinLookupError';
    this.code = code;
  }
}

export function isValidBin(bin) {
  return typeof bin === 'string' && /^(?:[0-9]{6}|[0-9]{8})$/.test(bin);
}

const value = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function mapHttpError(status) {
  if (status === 404) return new BinLookupError('NOT_FOUND');
  if (status === 401 || status === 402 || status === 403 || status === 422)
    return new BinLookupError('API_ACCESS');
  if (status === 429) return new BinLookupError('RATE_LIMIT');
  return new BinLookupError('UPSTREAM_ERROR');
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new BinLookupError('UPSTREAM_ERROR');
  }
}

async function requestJson(url, options, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(7000),
      cache: 'no-store'
    });
  } catch {
    throw new BinLookupError('UPSTREAM_ERROR');
  }
  if (!response.ok) throw mapHttpError(response.status);
  return await readJson(response);
}

async function lookupBintable(bin, env, fetchImpl) {
  if (!env.BINTABLE_API_KEY || env.BINTABLE_API_KEY === 'REEMPLAZAR') {
    throw new BinLookupError('MISSING_API_KEY');
  }
  // El proveedor exige la llave como parametro query; nunca registrar la URL.
  const url = `https://api.bintable.com/v1/${bin}?api_key=${encodeURIComponent(env.BINTABLE_API_KEY)}`;
  const body = await requestJson(url, { headers: { Accept: 'application/json' } }, fetchImpl);
  if (body?.result !== 200 || !body?.data?.card) {
    throw mapHttpError(Number(body?.result) || 502);
  }
  const data = body.data;
  return {
    bin,
    network: value(data.card?.scheme),
    type: value(data.card?.type),
    level: value(data.card?.category),
    issuer: value(data.bank?.name),
    country: value(data.country?.name),
    flag: value(data.country?.flag),
    currency: value(data.country?.currency_code),
    prepaid: null,
    commercial: null,
    provider: 'BINTable',
    simulated: false
  };
}

async function lookupVerisec(bin, env, fetchImpl) {
  if (!env.VERISEC_API_KEY) throw new BinLookupError('MISSING_API_KEY');
  const data = await requestJson(`https://verisec.dev/v2/bin/${bin}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${env.VERISEC_API_KEY}`
    }
  }, fetchImpl);
  if (!data || typeof data !== 'object' || !data.bin) {
    throw new BinLookupError('UPSTREAM_ERROR');
  }
  return {
    bin,
    network: value(data.network),
    type: value(data.type) ?? value(data.funding),
    level: value(data.level),
    issuer: value(data.issuer) ?? value(data.bank?.resolved?.name) ?? value(data.bank?.read?.name),
    country: value(data.country_name) ?? value(data.country),
    flag: value(data.flag),
    currency: value(data.currency),
    prepaid: typeof data.is_prepaid === 'boolean' ? data.is_prepaid : null,
    commercial: typeof data.is_commercial === 'boolean' ? data.is_commercial : null,
    provider: 'VeriSec (entorno de pruebas)',
    simulated: true
  };
}

async function lookupBinlist(bin, fetchImpl) {
  const data = await requestJson(`https://lookup.binlist.net/${bin}`, {
    headers: { 'Accept-Version': '3', Accept: 'application/json' }
  }, fetchImpl);
  if (!data || typeof data !== 'object' || !data.scheme) {
    throw new BinLookupError('UPSTREAM_ERROR');
  }
  return {
    bin,
    network: value(data.scheme),
    type: value(data.type),
    level: null, // Binlist no tiene campo oficial de nivel; no inferirlo desde brand.
    issuer: value(data.bank?.name),
    country: value(data.country?.name),
    flag: value(data.country?.emoji),
    currency: value(data.country?.currency),
    prepaid: typeof data.prepaid === 'boolean' ? data.prepaid : null,
    commercial: null,
    provider: 'Binlist (nivel no incluido)',
    simulated: false
  };
}

function lookupDemo(bin) {
  if (bin !== '999999') throw new BinLookupError('NOT_FOUND');
  return {
    bin,
    network: 'Visa',
    type: 'Crédito',
    level: 'Infinite',
    issuer: 'Banco de demostración (ficticio)',
    country: 'Colombia',
    flag: '🇨🇴',
    currency: 'COP',
    prepaid: false,
    commercial: false,
    provider: 'DEMO: información inventada',
    simulated: true
  };
}

export async function lookupBin(bin, { env = process.env, fetchImpl = fetch } = {}) {
  if (!isValidBin(bin)) throw new BinLookupError('INVALID_BIN');
  const provider = (env.BIN_PROVIDER || 'bintable').toLowerCase();
  if (provider === 'bintable') return lookupBintable(bin, env, fetchImpl);
  if (provider === 'verisec') return lookupVerisec(bin, env, fetchImpl);
  if (provider === 'binlist') return lookupBinlist(bin, fetchImpl);
  if (provider === 'demo') {
    if (env.VERCEL || env.NODE_ENV === 'production') throw new BinLookupError('DEMO_NOT_ALLOWED');
    return lookupDemo(bin);
  }
  throw new BinLookupError('UNKNOWN_PROVIDER');
}
