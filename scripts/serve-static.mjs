// Servidor estatico minimo para las variantes dist-e2e/* (uso: node serve-static.mjs <dir> <port>).
import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const [dir, port] = process.argv.slice(2);
const root = resolve(dir);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml',
};

async function resolveFile(urlPath) {
  const p = normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, '');
  const base = join(root, p);
  if (!base.startsWith(root)) return null;
  for (const c of [base, join(base, 'index.html'), `${base}.html`]) {
    try {
      if ((await stat(c)).isFile()) return c;
    } catch { /* siguiente candidato */ }
  }
  return null;
}

// Opt-in (http e2e): API_ORIGIN=http://127.0.0.1:3001 forwards /api/* like `astro preview` does (ADR-013).
// Unset => behaviour unchanged (mock e2e variants never reach an API).
const API = process.env.API_ORIGIN ? new URL(process.env.API_ORIGIN) : null;

function proxy(req, res) {
  const up = httpRequest(
    { host: API.hostname, port: API.port, method: req.method, path: req.url, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  up.on('error', () => res.writeHead(502, { 'content-type': 'text/plain' }).end('bad gateway'));
  req.pipe(up);
}

createServer(async (req, res) => {
  if (API && (req.url ?? '').startsWith('/api/')) return proxy(req, res);
  const file = await resolveFile(new URL(req.url ?? '/', 'http://x').pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(Number(port), () => console.log(`serving ${root} on ${port}`));
