import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 5173);
const root = process.cwd();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function resolvePath(url) {
  const path = new URL(url, `http://localhost:${port}`).pathname;
  const requested = path === '/' ? '/index.html' : decodeURIComponent(path);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  return join(root, safePath);
}

createServer(async (req, res) => {
  try {
    const filePath = resolvePath(req.url || '/');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}).listen(port, () => {
  console.log(`Galata Turnos listo en http://localhost:${port}`);
});
