#!/usr/bin/env node
/**
 * popups.fyi — a static file server that answers like GitHub Pages.
 *
 * `npm run seo:check` and local previews use it so they see the same status
 * codes as the live site. (`vite preview` answers every unknown path with
 * index.html and a 200, which would hide a missing page.) The rules:
 *
 *   /x    -> the file x, else x.html (200), even when a folder x/ also exists
 *   /x/   -> x/index.html (200)
 *   /x    -> 301 to /x/ when there's only a folder x/ with an index.html
 *   else  -> 404.html with status 404
 *
 *   node scripts/serve-pages.mjs [dir=dist] [--port 4173] [--host 127.0.0.1]
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

// Decide what GitHub Pages would answer for a URL path:
// { status: 200, file } | { status: 301, location } | { status: 400 | 404 }.
export async function resolvePagesPath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return { status: 400 };
  }
  if (decoded.includes('\0')) return { status: 400 };
  const target = path.resolve(root, `.${decoded}`);
  // Never serve anything outside the site folder (../ or encoded backslashes).
  if (target !== root && !target.startsWith(root + path.sep)) return { status: 404 };

  if (decoded.endsWith('/')) {
    const index = path.join(target, 'index.html');
    return (await isFile(index)) ? { status: 200, file: index } : { status: 404 };
  }
  if (await isFile(target)) return { status: 200, file: target };
  if (await isFile(`${target}.html`)) return { status: 200, file: `${target}.html` };
  if (await isFile(path.join(target, 'index.html'))) return { status: 301, location: `${urlPath}/` };
  return { status: 404 };
}

export function createPagesServer(dir) {
  const root = path.resolve(dir);
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const found = await resolvePagesPath(root, url.pathname);
      if (found.status === 301) {
        res.writeHead(301, { Location: `${found.location}${url.search}` }).end();
        return;
      }
      let file = found.file;
      if (found.status !== 200) {
        const notFound = path.join(root, '404.html');
        if (found.status !== 404 || !(await isFile(notFound))) {
          res.writeHead(found.status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${found.status}\n`);
          return;
        }
        file = notFound;
      }
      res.writeHead(found.status, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        // Local previews should always show the latest build.
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(file).pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}

// Start on a port and resolve with the server's base URL.
export function listen(server, { port = 4173, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve(`http://${host}:${address.port}`);
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const options = { port: 4173, host: '127.0.0.1' };
  let dir = 'dist';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') options.port = Number(args[++i]);
    else if (args[i] === '--host') options.host = args[++i];
    else dir = args[i];
  }
  const base = await listen(createPagesServer(dir), options);
  console.log(`Serving ${path.resolve(dir)} like GitHub Pages at ${base}/`);
}
