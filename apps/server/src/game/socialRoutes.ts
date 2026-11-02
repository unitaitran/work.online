// REST cho Phase 5B: xếp hạng, tường than thở chung (lọc, báo cáo, tự ẩn), trang quản trị
// (khoá trong biến môi trường), bản đồ toà nhà.
import { timingSafeEqual } from 'node:crypto';
import {
  checkText,
  dayKey,
  leaderboardQuerySchema,
  periodStart,
  privacyRequestSchema,
  titleFor,
  WALL_MAX_LENGTH,
  WALL_REPORTS_TO_HIDE,
  wallPostRequestSchema,
  type BuildingResponse,
  type LeaderboardResponse,
  type LeaderboardRow,
  type RoomInfo,
  type WallPost,
} from '@dilam/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../app';
import { sendError } from '../http/routes';
import type { Gateway } from '../ws/gateway';
import { ADMIN_PAGE } from './adminPage';

/** Xếp hạng tính theo giờ Việt Nam (tuần bắt đầu thứ Hai 0 giờ). */
const BOARD_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const BOARD_OFFSET_MS = 7 * 3_600_000;
const BOARD_SIZE = 20;

export function roomInfo(
  info: { id: string; kind: string; online: number; capacity: number },
  name: string,
): RoomInfo {
  const n = Number(/-(\d+)$/.exec(info.id)?.[1] ?? 1);
  return {
    id: info.id,
    kind: info.kind,
    floor: info.kind === 'office' ? 6 + n : 0,
    name,
    online: info.online,
    capacity: info.capacity,
    private: info.kind !== 'office',
  };
}

export function registerSocialRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  gateway: Gateway,
): void {
  const { repos, helpers } = ctx;

  // ---------- Xếp hạng ----------
  app.get('/api/leaderboard', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user) return reply;
    const query = leaderboardQuerySchema.safeParse(request.query);
    if (!query.success) return sendError(reply, 400, 'bad_request');
    const { period, department } = query.data;
    const today = dayKey(new Date(ctx.now()), BOARD_TIME_ZONE);
    const since = periodStart(today, period);
    const [y = 0, m = 1, d = 1] = since.split('-').map(Number);
    const sinceMs = Date.UTC(y, m - 1, d) - BOARD_OFFSET_MS;
    const entries = repos.social.leaderboard(sinceMs, department === 'all' ? null : department);
    const toRow = (entry: (typeof entries)[number], index: number): LeaderboardRow => ({
      rank: index + 1,
      name: entry.name,
      title: titleFor(entry.totalXp),
      branch: entry.branch === 'manager' || entry.branch === 'specialist' ? entry.branch : null,
      xp: entry.xp,
      me: entry.userId === user.id,
    });
    const rows = entries.slice(0, BOARD_SIZE).map(toRow);
    const myIndex = entries.findIndex((entry) => entry.userId === user.id);
    const myEntry = myIndex >= 0 ? entries[myIndex] : undefined;
    const response: LeaderboardResponse = {
      period,
      department,
      since,
      rows,
      mine: myEntry ? toRow(myEntry, myIndex) : null,
      hidden: repos.social.isLeaderboardHidden(user.id),
    };
    return reply.send(response);
  });

  app.put('/api/me/privacy', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user || !helpers.allowWrite(request, reply, user.id)) return reply;
    const body = helpers.parse(privacyRequestSchema, request.body, reply);
    if (!body) return reply;
    repos.social.setLeaderboardHidden(user.id, body.hideFromLeaderboard);
    return reply.send({ hideFromLeaderboard: body.hideFromLeaderboard });
  });

  // ---------- Tường than thở chung ----------
  const wallView = (userId: string): WallPost[] => {
    const rows = repos.wall.visible(50);
    const reported = repos.wall.reportedBy(
      userId,
      rows.map((row) => row.id),
    );
    // KHÔNG trả về ai đăng (ẩn danh), chỉ cho biết bài nào của chính mình.
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      day: row.day,
      mine: row.userId === userId,
      reportedByMe: reported.has(row.id),
    }));
  };

  app.get('/api/wall', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user) return reply;
    return reply.send({ posts: wallView(user.id) });
  });

  app.post('/api/wall', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user || !helpers.allowWrite(request, reply, user.id)) return reply;
    const body = helpers.parse(wallPostRequestSchema, request.body, reply);
    if (!body) return reply;
    const checked = checkText(body.text, { maxLength: WALL_MAX_LENGTH, blockBrands: true });
    if (!checked.ok) return sendError(reply, 422, 'rejected', checked.reason);
    const today = app.game.engine.today(user.id, user.timeZone);
    if (!repos.wall.add(user.id, today, checked.text, ctx.now())) {
      return sendError(reply, 409, 'conflict', 'one_per_day');
    }
    return reply.code(201).send({ posts: wallView(user.id) });
  });

  app.post<{ Params: { id: string } }>('/api/wall/:id/report', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user || !helpers.allowWrite(request, reply, user.id)) return reply;
    const id = Number(request.params.id);
    const post = Number.isInteger(id) ? repos.wall.get(id) : null;
    if (!post || post.hidden) return sendError(reply, 404, 'not_found');
    if (post.userId === user.id) return sendError(reply, 403, 'forbidden');
    const reports = repos.wall.report(id, user.id, ctx.now());
    if (reports === null) return sendError(reply, 409, 'conflict', 'already_reported');
    if (reports >= WALL_REPORTS_TO_HIDE) repos.wall.setHidden(id, true);
    return reply.send({ posts: wallView(user.id) });
  });

  // ---------- Quản trị (chỉ khi có ADMIN_KEY) ----------
  const adminKey = ctx.config.adminKey;
  const isAdmin = (request: FastifyRequest): boolean => {
    if (!adminKey) return false;
    const given = request.headers['x-admin-key'];
    if (typeof given !== 'string') return false;
    const a = Buffer.from(given);
    const b = Buffer.from(adminKey);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const requireAdmin = (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (!adminKey) {
      void sendError(reply, 404, 'not_found');
      return false;
    }
    if (!isAdmin(request)) {
      void sendError(reply, 401, 'unauthorized');
      return false;
    }
    return true;
  };

  app.get('/admin', (_request, reply) => {
    if (!adminKey) return sendError(reply, 404, 'not_found');
    return reply.type('text/html; charset=utf-8').send(ADMIN_PAGE);
  });
  app.get('/api/admin/wall', (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return reply.send({
      posts: repos.wall.reported(100).map((row) => ({
        id: row.id,
        text: row.text,
        day: row.day,
        reports: row.reports,
        hidden: row.hidden,
      })),
    });
  });
  app.delete<{ Params: { id: string } }>('/api/admin/wall/:id', (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    repos.wall.delete(Number(request.params.id));
    return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>('/api/admin/wall/:id/restore', (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    repos.wall.setHidden(Number(request.params.id), false);
    return reply.code(204).send();
  });

  // ---------- Bản đồ toà nhà ----------
  app.get('/api/building', (request, reply) => {
    const user = helpers.requireUser(request, reply);
    if (!user) return reply;
    const response: BuildingResponse = {
      rooms: gateway.rooms
        .list()
        .filter((info) => info.kind === 'office')
        .map((info) => roomInfo(info, ''))
        .sort((a, b) => a.floor - b.floor),
      current: gateway.sessionOf(user.id)?.room.id ?? null,
    };
    return reply.send(response);
  });
}
