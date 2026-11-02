import Fastify, { type FastifyInstance } from 'fastify';
import type { LogLevel } from './config';
import { attachWebSocketGateway, type GatewayOptions } from './ws/gateway';

export interface AppOptions {
  logLevel: LogLevel;
  gateway?: GatewayOptions;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({
    logger:
      options.logLevel === 'silent'
        ? false
        : {
            level: options.logLevel,
            // Bỏ hostname mặc định của pino (tên máy).
            base: { pid: process.pid },
            // Không ghi IP, hostname, header hay query string: chỉ method và đường dẫn.
            serializers: {
              req: (request: { method: string; url: string }) => ({
                method: request.method,
                path: request.url.split('?', 1)[0],
              }),
            },
          },
    bodyLimit: 16 * 1024,
  });

  app.get('/api/health', () => ({ ok: true }));

  attachWebSocketGateway(app, options.gateway);

  return app;
}
