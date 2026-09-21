import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const api = new URL(process.env.API_ORIGIN ?? 'http://127.0.0.1:3100');
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = http.request({ hostname: api.hostname, port: api.port, path: req.url, method: req.method, headers: { ...req.headers, host: api.host } }, reply => {
      res.writeHead(reply.statusCode, { ...reply.headers, 'cache-control': 'no-store' }); reply.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ code: 'service_unavailable' })); });
    req.pipe(upstream); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!(pathname === '/' || pathname === '/index.html' || pathname.startsWith('/dist/') || pathname.startsWith('/src/styles/'))) throw Error();
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root)) throw Error();
    const body = await fs.readFile(filename);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(filename)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT ?? 8080), '127.0.0.1', () => console.log('Frontend: http://127.0.0.1:' + (process.env.PORT ?? 8080)));
