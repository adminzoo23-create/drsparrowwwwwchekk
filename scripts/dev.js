import { createServer } from 'node:http';
import telegram from '../api/telegram.js';
import health from '../api/health.js';
const port = Number(process.env.PORT || 3000);

const server = createServer(async (req, res) => {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 20000) { res.writeHead(413); res.end('Payload too large'); return; }
    chunks.push(chunk);
  }
  const url = new URL(req.url, `http://localhost:${port}`);
  const handler = url.pathname === '/api/telegram' ? telegram : url.pathname === '/api/health' ? health : null;
  if (!handler) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      ...((req.method === 'GET' || req.method === 'HEAD') ? {} : { body: Buffer.concat(chunks) })
    });
    const response = await handler.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500); res.end('Internal server error');
  }
});
server.listen(port, () => console.log(`Servidor local: http://localhost:${port}/api/health`));
