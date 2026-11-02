import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from './config';
import { openDatabase } from './db/database';
import { createSqliteRepositories, type Repositories } from './db/repositories';
import { createAccountService, type AccountService } from './game/accounts';
import { attachGameService, type GameService } from './game/gameService';
import { registerApiRoutes, type AuthedHelpers, type Presence } from './http/routes';
import { attachWebSocketGateway, type Gateway, type GatewayOptions } from './ws/gateway';

export interface AppOptions {
  config: ServerConfig;
  /** Dùng repository có sẵn (test); mặc định mở SQLite theo config.dbPath. */
  repos?: Repositories;
  now?: () => number;
  gateway?: GatewayOptions;
}

export interface AppContext {
  config: ServerConfig;
  repos: Repositories;
  accounts: AccountService;
  helpers: AuthedHelpers;
  now: () => number;
}

declare module 'fastify' {
  interface FastifyInstance {
    gateway: Gateway;
    game: GameService;
  }
}

export function buildApp(options: AppOptions): FastifyInstance {
  const { config } = options;
  const now = options.now ?? Date.now;
  const app = Fastify({
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            // Bỏ hostname mặc định của pino (tên máy).
            base: { pid: process.pid },
            // Không ghi IP, hostname, header hay query string (token): chỉ method và đường dẫn.
            serializers: {
              req: (request: { method: string; url: string }) => ({
                method: request.method,
                path: request.url.split('?', 1)[0],
              }),
            },
          },
    bodyLimit: 64 * 1024,
    trustProxy: config.trustProxy,
  });

  let db: ReturnType<typeof openDatabase> | null = null;
  let repos = options.repos;
  if (!repos) {
    db = openDatabase(config.dbPath);
    repos = createSqliteRepositories(db);
  }
  const accounts = createAccountService(repos, { tokenTtlDays: config.tokenTtlDays, now });

  let presence: Presence = { online: () => 0 };
  const helpers = registerApiRoutes(app, {
    config,
    repos,
    accounts,
    now,
    presence: { online: () => presence.online() },
  });

  const context: AppContext = { config, repos, accounts, helpers, now };
  const gateway = attachWebSocketGateway(app, context, options.gateway);
  presence = gateway;
  app.decorate('gateway', gateway);
  app.decorate('game', attachGameService(app, context, gateway));

  app.addHook('onClose', (_instance, done) => {
    db?.close();
    done();
  });

  return app;
}
