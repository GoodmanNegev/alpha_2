#!/usr/bin/env node
// Minimal static file server for local development (no dependencies).
//   node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (url !== '/' && !/^\/(?:index\.html|src\/[a-zA-Z0-9_/-]+\.js|css\/[a-zA-Z0-9_/-]+\.css)$/.test(url)) {
    res.writeHead(404); res.end(); return;
  }
  let file = normalize(join(root, url === '/' ? '/index.html' : url));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const st = statSync(file);
    if (st.isDirectory()) file = join(file, 'index.html');
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`魔塔 dev server → http://localhost:${port}/\n`);
});
