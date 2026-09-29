import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', `http://${host}:${port}`).pathname;
  const relativePath = pathname === '/' ? 'index.html' : pathname === '/favicon.svg' ? 'public/favicon.svg' : pathname.slice(1);
  const resolvedPath = path.resolve(root, relativePath);
  if (!resolvedPath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(resolvedPath);
    response.writeHead(200, { 'content-type': types[path.extname(resolvedPath)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') console.error(error);
    response.writeHead(404).end('Not found');
  }
}).listen(port, host, () => console.log(`PayDrip web: http://${host}:${port}`));
