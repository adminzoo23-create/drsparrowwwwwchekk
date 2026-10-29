export default {
  fetch(request) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    return Response.json({ ok: true, service: 'bin-checker-telegram', provider: process.env.BIN_PROVIDER || 'bintable' }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }
};
