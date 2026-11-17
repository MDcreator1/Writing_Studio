import { createServer } from 'node:https';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm'
};

export async function createLanServer(api, { cert, key }) {
  const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
  const assets = resolve(root, 'assets') + sep;
  const apiHandler = api.listeners('request')[0];
  const server = createServer({ cert: await readFile(cert), key: await readFile(key) }, async (req, res) => {
    const route = req.url.split('?')[0];
    if (route.startsWith('/api/v1/')) return apiHandler(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    try {
      const path = route === '/' ? '/home.html' : decodeURIComponent(route);
      const entryPage = /^\/[a-z0-9-]+\.html$/i.test(path);
      const asset = /^\/assets\/(?:[a-z0-9_-][a-z0-9_.-]*\/)*[a-z0-9_-][a-z0-9_.-]*$/i.test(path);
      if (!entryPage && !asset) { res.writeHead(404).end(); return; }
      const file = await realpath(resolve(root, path.slice(1)));
      if (asset ? !file.startsWith(assets) : file !== resolve(root, path.slice(1))) {
        res.writeHead(404).end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, {
        'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') res.end();
      else await pipeline(createReadStream(file), res);
    } catch {
      if (!res.headersSent) res.writeHead(404).end();
      else res.destroy();
    }
  });
  server.requestTimeout = api.requestTimeout;
  server.headersTimeout = api.headersTimeout;
  return server;
}
