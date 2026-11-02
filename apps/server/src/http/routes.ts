// REST: tài khoản, nhân vật, tiến độ, thông tin công khai. Mọi body qua zod; endpoint ghi có
// giới hạn tần suất theo IP và theo tài khoản.
import {
  BALANCE,
  BRANCHES,
  BRANCH_NAMES,
  checkText,
  createAccountRequestSchema,
  DEPARTMENTS,
  DEPARTMENT_NAMES,
  importRequestSchema,
  MAX_LEVEL,
  NAME_MAX_LENGTH,
  PROTOCOL_VERSION,
  recoverRequestSchema,
  saveCharacterRequestSchema,
  setTimeZoneRequestSchema,
  titleMinLevel,
  titleName,
  TITLE_COUNT,
  type AccountCreatedResponse,
  type ApiError,
  type ApiErrorCode,
  type CapacityResponse,
  type MeResponse,
  type MetaResponse,
  type RecoverResponse,
} from '@dilam/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { playerCodeOf } from '../auth/secrets';
import type { ServerConfig } from '../config';
import type { Repositories, UserRecord } from '../db/repositories';
import type { AccountService } from '../game/accounts';
import { isFresh, validateImport } from '../game/importProgress';
import { KeyedLimiter } from './keyedLimiter';

export interface Presence {
  online(): number;
}

export interface ApiContext {
  config: ServerConfig;
  repos: Repositories;
  accounts: AccountService;
  presence: Presence;
  now: () => number;
}

const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function sendError(
  reply: FastifyReply,
  status: number,
  error: ApiErrorCode,
  reason?: string,
): FastifyReply {
  const body: ApiError = reason ? { error, reason } : { error };
  return reply.code(status).send(body);
}

/** Lấy token từ header "Authorization: Bearer <token>". */
export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(header);
  return match?.[1] ?? null;
}

export interface AuthedHelpers {
  /** Xác thực; sai hoặc hết hạn thì đã trả 401 và trả về null. */
  requireUser(request: FastifyRequest, reply: FastifyReply): UserRecord | null;
  /** Giới hạn tần suất ghi theo IP và tài khoản; vượt thì đã trả 429 và trả về false. */
  allowWrite(request: FastifyRequest, reply: FastifyReply, userId?: string): boolean;
  parse<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null;
}

export function registerApiRoutes(app: FastifyInstance, ctx: ApiContext): AuthedHelpers {
  const { repos, accounts, config, now } = ctx;
  const ipWrites = new KeyedLimiter({ capacity: 60, refillPerSecond: 1 }, now);
  const accountWrites = new KeyedLimiter({ capacity: 30, refillPerSecond: 0.5 }, now);
  const accountCreates = new KeyedLimiter({ capacity: 5, refillPerSecond: 1 / 600 }, now);
  const recoveries = new KeyedLimiter({ capacity: 8, refillPerSecond: 1 / 60 }, now);

  const tooMany = (reply: FastifyReply): FastifyReply => {
    void reply.header('Retry-After', '30');
    return sendError(reply, 429, 'rate_limited');
  };

  const helpers: AuthedHelpers = {
    requireUser(request, reply) {
      const token = bearerToken(request);
      const user = token ? accounts.authenticate(token) : null;
      if (!user) {
        void sendError(reply, 401, 'unauthorized');
        return null;
      }
      return user;
    },
    allowWrite(request, reply, userId) {
      const ok =
        ipWrites.consume(request.ip) && (userId === undefined || accountWrites.consume(userId));
      if (!ok) tooMany(reply);
      return ok;
    },
    parse(schema, body, reply) {
      const result = schema.safeParse(body ?? {});
      if (!result.success) {
        void sendError(reply, 400, 'bad_request');
        return null;
      }
      return result.data;
    },
  };

  const me = (user: UserRecord): MeResponse => {
    const progress = repos.progress.get(user.id);
    if (!progress) throw new Error('missing progress');
    return {
      userId: user.id,
      playerCode: playerCodeOf(user.id),
      timeZone: user.timeZone,
      character: repos.characters.get(user.id),
      progress: progress.state,
      imported: progress.imported,
    };
  };

  // ---------- Công khai ----------

  app.get('/api/health', () => ({ ok: true }));

  app.get('/api/capacity', (): CapacityResponse => {
    const online = ctx.presence.online();
    return {
      online,
      limit: config.serverCapacity,
      busy: online >= config.serverCapacity * 0.9,
    };
  });

  const meta: MetaResponse = {
    departments: DEPARTMENTS.map((id) => ({ id, name: DEPARTMENT_NAMES[id] })),
    branches: BRANCHES.map((id) => ({ id, name: BRANCH_NAMES[id] })),
    titles: Array.from({ length: TITLE_COUNT }, (_, i) => ({
      title: i + 1,
      minLevel: titleMinLevel(i + 1),
      manager: titleName(i + 1, 'manager'),
      specialist: titleName(i + 1, 'specialist'),
    })),
    maxLevel: MAX_LEVEL,
    companyUnlockLevel: BALANCE.company.unlockLevel,
    protocolVersion: PROTOCOL_VERSION,
  };
  app.get('/api/meta', () => meta);

  // ---------- Tài khoản ----------

  app.post('/api/accounts', (request, reply) => {
    if (!helpers.allowWrite(request, reply)) return reply;
    if (!accountCreates.consume(request.ip)) return tooMany(reply);
    const body = helpers.parse(createAccountRequestSchema, request.body, reply);
    if (!body) return reply;
    const created = accounts.create(body.timeZone ?? DEFAULT_TIME_ZONE);
    const response: AccountCreatedResponse = created;
    return reply.code(201).send(response);
  });

  app.post('/api/accounts/recover', (request, reply) => {
    if (!helpers.allowWrite(request, reply)) return reply;
    if (!recoveries.consume(request.ip)) return tooMany(reply);
    const body = helpers.parse(recoverRequestSchema, request.body, reply);
    if (!body) return reply;
    const result = accounts.recover(body.recoveryCode);
    if (!result) return sendError(reply, 401, 'unauthorized');
    const response: RecoverResponse = result;
    return reply.send(response);
  });

  app.get('/api/me', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user) return reply;
    return reply.send(me(user));
  });

  app.put('/api/me/character', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user || !helpers.allowWrite(request, reply, user.id)) return reply;
    const body = helpers.parse(saveCharacterRequestSchema, request.body, reply);
    if (!body) return reply;
    const name = checkText(body.name, { maxLength: NAME_MAX_LENGTH, blockBrands: false });
    if (!name.ok) return sendError(reply, 422, 'rejected', name.reason);
    repos.characters.save(user.id, { name: name.text, appearance: body.appearance }, now());
    return reply.send(me(user));
  });

  app.put('/api/me/timezone', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user || !helpers.allowWrite(request, reply, user.id)) return reply;
    const body = helpers.parse(setTimeZoneRequestSchema, request.body, reply);
    if (!body) return reply;
    repos.users.setTimeZone(user.id, body.timeZone);
    return reply.send(me({ ...user, timeZone: body.timeZone }));
  });

  app.post('/api/me/import', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user || !helpers.allowWrite(request, reply, user.id)) return reply;
    const body = helpers.parse(importRequestSchema, request.body, reply);
    if (!body) return reply;
    const current = repos.progress.get(user.id);
    if (!current) return sendError(reply, 404, 'not_found');
    if (current.imported) return sendError(reply, 409, 'conflict', 'already_imported');
    if (!isFresh(current.state)) return sendError(reply, 409, 'conflict', 'not_fresh');
    const result = validateImport(body.saveCode, now());
    if (!result.ok) return sendError(reply, 422, 'rejected', result.error);
    repos.transaction(() => {
      repos.progress.save(user.id, result.state, now());
      repos.progress.markImported(user.id);
      repos.activity.add({
        userId: user.id,
        at: now(),
        kind: 'import',
        xp: result.state.xp,
        coins: result.state.coins,
      });
    });
    return reply.send(me(user));
  });

  return helpers;
}
