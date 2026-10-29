import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupBin, isValidBin, BinLookupError } from '../src/bin-client.js';

const mockFetch = (payload, status = 200) => async () => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

test('acepta exclusivamente BIN de 6 u 8 dígitos', () => {
  assert.equal(isValidBin('123456'), true);
  assert.equal(isValidBin('12345678'), true);
  assert.equal(isValidBin('1234567'), false);
  assert.equal(isValidBin('4111111111111111'), false);
  assert.equal(isValidBin('123 456'), false);
  assert.equal(isValidBin('123456-'), false);
});

test('BINTable extrae franquicia, banco y categoria sin inferencias', async () => {
  let requestedUrl;
  const fetchImpl = async url => {
    requestedUrl = url;
    return Response.json({ result: 200, data: { card: { scheme: 'Visa', type: 'Debit', category: 'Classic' }, bank: { name: 'BANCO EJEMPLO' }, country: { name: 'Colombia', code: 'co', flag: '🇨🇴', currency_code: 'COP' } } });
  };
  const result = await lookupBin('12345678', { env: { BIN_PROVIDER: 'bintable', BINTABLE_API_KEY: 'privada&123' }, fetchImpl });
  assert.equal(result.level, 'Classic');
  assert.equal(result.network, 'Visa');
  assert.equal(result.issuer, 'BANCO EJEMPLO');
  assert.equal(result.currency, 'COP');
  assert.match(requestedUrl, /api_key=privada%26123/);
});

test('BINTable deja nivel como desconocido cuando no existe', async () => {
  const result = await lookupBin('123456', { env: { BIN_PROVIDER: 'bintable', BINTABLE_API_KEY: 'test' }, fetchImpl: mockFetch({ result: 200, data: { card: { scheme: 'Visa', category: '' } } }) });
  assert.equal(result.level, null);
});

test('VeriSec normaliza el nivel y marca el entorno de prueba', async () => {
  const result = await lookupBin('123456', { env: { BIN_PROVIDER: 'verisec', VERISEC_API_KEY: 'sk_test_example' }, fetchImpl: mockFetch({ bin: '123456', network: 'Mastercard', level: 'World Elite', funding: 'credit', issuer: 'Banco de prueba', is_prepaid: false, is_commercial: true }) });
  assert.equal(result.level, 'World Elite');
  assert.equal(result.simulated, true);
  assert.equal(result.commercial, true);
});

test('Binlist informa básico y no inventa nivel desde brand', async () => {
  const result = await lookupBin('123456', { env: { BIN_PROVIDER: 'binlist' }, fetchImpl: mockFetch({ scheme: 'visa', type: 'debit', brand: 'Visa Infinite', bank: { name: 'Banco' } }) });
  assert.equal(result.level, null);
});

test('rechaza un numero completo sin efectuar llamadas', async () => {
  let calls = 0;
  await assert.rejects(() => lookupBin('4111111111111111', { fetchImpl: async () => { calls++; } }), e => e instanceof BinLookupError && e.code === 'INVALID_BIN');
  assert.equal(calls, 0);
});

test('clasifica fallos de cupo del proveedor', async () => {
  await assert.rejects(() => lookupBin('123456', { env: { BIN_PROVIDER: 'binlist' }, fetchImpl: mockFetch({ error: 'limit' }, 429) }), e => e.code === 'RATE_LIMIT');
});

test('demo solo para uso local y BIN ficticio', async () => {
  const result = await lookupBin('999999', { env: { BIN_PROVIDER: 'demo' } });
  assert.equal(result.simulated, true);
  await assert.rejects(() => lookupBin('999999', { env: { BIN_PROVIDER: 'demo', VERCEL: '1' } }), e => e.code === 'DEMO_NOT_ALLOWED');
});
