// Phục vụ bản build client cùng nguồn (khi đặt CLIENT_DIST). Tài nguyên băm tên (/assets/*)
// cache lâu; HTML, service worker, manifest không cache. Chặn đường dẫn ra ngoài thư mục.
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Đường dẫn tệp an toàn bên trong `root`, hoặc null. */
export function safeJoin(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?', 1)[0] ?? '/');
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = resolve(root);
  const full = resolve(join(base, normalize(decoded)));
  return full === base || full.startsWith(base + sep) ? full : null;
}

export function registerStatic(app: FastifyInstance, root: string): void {
  const send = (reply: FastifyReply, file: string, cache: string): FastifyReply => {
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    return reply.header('cache-control', cache).type(type).send(readFileSync(file));
  };

  app.get('/*', (request, reply) => {
    const path = request.url.split('?', 1)[0] ?? '/';
    if (path.startsWith('/api/') || path === '/ws') {
      reply.callNotFound();
      return reply;
    }
    const target = path === '/' ? '/index.html' : path;
    const file = safeJoin(root, target);
    if (!file) return reply.code(404).send({ error: 'not_found' });
    try {
      if (!statSync(file).isFile()) return reply.code(404).send({ error: 'not_found' });
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
    const immutable = target.startsWith('/assets/');
    return send(reply, file, immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  });
}
