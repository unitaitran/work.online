// Header an toàn cho mọi phản hồi, CORS chỉ cho nguồn được phép, kiểm tra Origin của WebSocket.
import type { IncomingMessage } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config';

/** CSP chặt: chỉ tài nguyên cùng nguồn, không script nội tuyến, không nhúng khung. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Vite chèn style nội tuyến khi dev; bản build dùng file CSS. Thuộc tính style do JS đặt
  // (CSSOM) không bị CSP chặn.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Trang quản trị nhỏ có script nội tuyến: CSP riêng cho đúng trang đó. */
export const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

export function registerSecurity(app: FastifyInstance, config: ServerConfig): void {
  const allowed = new Set(config.corsOrigins);

  app.addHook('onRequest', (request, reply, done) => {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && allowed.has(origin)) {
      void reply.header('access-control-allow-origin', origin);
      void reply.header('vary', 'Origin');
      void reply.header('access-control-allow-headers', 'authorization, content-type');
      void reply.header('access-control-allow-methods', 'GET, POST, PUT, DELETE');
      void reply.header('access-control-max-age', '600');
      if (request.method === 'OPTIONS') {
        void reply.code(204).send();
        return;
      }
    }
    done();
  });

  app.addHook('onSend', (request, reply, payload, done) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) void reply.header(name, value);
    if (!reply.hasHeader('content-security-policy')) {
      void reply.header('content-security-policy', CONTENT_SECURITY_POLICY);
    }
    // API không cache.
    if (request.url.startsWith('/api/')) void reply.header('cache-control', 'no-store');
    done(null, payload);
  });
}

/**
 * WebSocket: trình duyệt luôn gửi Origin. Chỉ nhận cùng nguồn (host trùng) hoặc nguồn trong
 * CORS_ORIGINS; không có Origin (bot, công cụ) thì vẫn cần token như thường.
 */
export function websocketOriginAllowed(request: IncomingMessage, config: ServerConfig): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  if (config.corsOrigins.includes(origin)) return true;
  try {
    const host = request.headers['x-forwarded-host'] ?? request.headers.host;
    return new URL(origin).host === (Array.isArray(host) ? host[0] : host);
  } catch {
    return false;
  }
}
