import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './server/api.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

createServer(async (request, response) => {
  const origin = `http://${host}:${port}`;
  if (request.headers.host !== `${host}:${port}`) {
    response.writeHead(403).end('Local terminal only');
    return;
  }
  const pathname = new URL(request.url || '/', origin).pathname;
  if (await handleApi(request, response, pathname, origin)) return;
  if (pathname === '/app') {
    response.writeHead(308, { location: '/app/', 'cache-control': 'no-store' }).end();
    return;
  }
  if (pathname === '/deployment.preview.json') {
    const manifest = await readFile(path.resolve(root, '../../deployment.preview.json'));
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(manifest);
    return;
  }
  const relativePath = pathname === '/' ? 'index.html'
    : pathname === '/app/' ? 'app/index.html'
      : pathname === '/favicon.svg' ? 'public/favicon.svg'
        : pathname.startsWith('/src/') || pathname.startsWith('/app/') ? pathname.slice(1) : null;
  if (!relativePath) { response.writeHead(404).end('Not found'); return; }
  const resolvedPath = path.resolve(root, relativePath);
  if (!resolvedPath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(resolvedPath);
    response.writeHead(200, {
      'content-type': types[path.extname(resolvedPath)] || 'application/octet-stream',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    }).end(body);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') console.error(error);
    response.writeHead(404).end('Not found');
  }
}).listen(port, host, () => console.log(`PayDrip web: http://${host}:${port}`));
