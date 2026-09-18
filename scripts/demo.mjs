import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const fixtures = new URL('../tests/fixtures/', import.meta.url);
const port = Number(process.env.PORT ?? 4177);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be an integer between 1024 and 65535.');
const allowedFiles = new Set(['index.html', 'next.html']);
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!allowedFiles.has(filename)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(fileURLToPath(new URL(filename, fixtures)));
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Length': body.length,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  }
  catch (error) {
    console.error(error);
    response.writeHead(500).end('Could not load the local fixture.');
  }
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Demo with fictional data: http://127.0.0.1:${port}\nStop with Ctrl+C.`));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
