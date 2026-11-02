// Nối bộ tính điểm với WebSocket: nhận hành động, trả tiến độ, sếp giao việc định kỳ,
// và (chỉ khi DEV_TOOLS) các API dev để thử vòng chơi nhanh.
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app';
import { playerCodeOf } from '../auth/secrets';
import { publicProfile } from '../rooms/profile';
import type { Gateway, Session } from '../ws/gateway';
import { ProgressEngine, type PlayerContext } from './progressEngine';

const MISSION_TICK_MS = 3000;
const PRUNE_ACTIONS_MS = 60 * 60_000;
/** Giữ khoá chống gửi trùng trong 2 ngày. */
const ACTION_KEEP_MS = 2 * 86_400_000;

export interface GameService {
  engine: ProgressEngine;
  /** Đẩy trạng thái tiến độ mới nhất cho người chơi (sau khi công cụ khác sửa). */
  push(userId: string): void;
  contextFor(userId: string): PlayerContext;
}

export function attachGameService(
  app: FastifyInstance,
  ctx: AppContext,
  gateway: Gateway,
): GameService {
  const engine = new ProgressEngine(ctx.repos, ctx.now);

  const contextFor = (userId: string): PlayerContext => {
    const user = ctx.repos.users.byId(userId);
    return {
      userId,
      playerCode: playerCodeOf(userId),
      timeZone: user?.timeZone ?? 'Asia/Ho_Chi_Minh',
      position: () => gateway.sessionOf(userId)?.room.positionOf(userId) ?? null,
    };
  };

  const push = (userId: string): void => {
    const session = gateway.sessionOf(userId);
    if (!session) return;
    const player = contextFor(userId);
    session.send({
      type: 'progress',
      state: engine.state(userId),
      today: engine.today(userId, player.timeZone),
    });
  };

  gateway.onSession((session: Session) => {
    push(session.userId);
  });
  gateway.onSessionEnd((session: Session) => {
    engine.forget(session.userId);
  });

  gateway.addHandler((session, message) => {
    if (message.type !== 'action') return false;
    const player = contextFor(session.userId);
    const result = engine.handle(player, message.id, message.action);
    if (!result.ok) {
      session.send({ type: 'action_rejected', id: message.id, reason: result.reason });
      return true;
    }
    session.send({
      type: 'progress',
      id: message.id,
      state: result.state,
      today: result.today,
      ...(result.outcome ? { outcome: result.outcome } : {}),
    });
    // Đổi chức danh / nhánh thì cả phòng thấy nhãn mới.
    if (
      message.action.kind === 'choose_branch' ||
      (result.outcome && result.outcome.titleAfter !== result.outcome.titleBefore)
    ) {
      session.room.updateProfile(session.userId, publicProfile(ctx.repos, session.userId));
    }
    return true;
  });

  const missionTimer = setInterval(() => {
    for (const session of gateway.sessions()) {
      const ticked = engine.tickMissions(contextFor(session.userId));
      if (!ticked) continue;
      if (ticked.assigned) session.send({ type: 'mission_assigned', mission: ticked.assigned });
      push(session.userId);
    }
  }, MISSION_TICK_MS);
  missionTimer.unref();
  const pruneTimer = setInterval(() => {
    ctx.repos.actions.pruneBefore(ctx.now() - ACTION_KEEP_MS);
  }, PRUNE_ACTIONS_MS);
  pruneTimer.unref();
  app.addHook('onClose', (_instance, done) => {
    clearInterval(missionTimer);
    clearInterval(pruneTimer);
    done();
  });

  if (ctx.config.devTools) registerDevRoutes(app, ctx, engine, push);

  return { engine, push, contextFor };
}

const devShiftSchema = z.strictObject({ days: z.number().int().min(-30).max(400) });
const devGrantSchema = z.strictObject({
  xp: z.number().int().min(0).max(1_000_000).optional(),
  coins: z.number().int().min(0).max(10_000_000).optional(),
});

/** API chỉ dùng khi phát triển: tua ngày, cộng XP/xu. KHÔNG bật ở môi trường thật. */
function registerDevRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  engine: ProgressEngine,
  push: (userId: string) => void,
): void {
  app.post('/api/dev/shift-day', (request, reply) => {
    const user = ctx.helpers.requireUser(request, reply);
    if (!user) return reply;
    const body = ctx.helpers.parse(devShiftSchema, request.body, reply);
    if (!body) return reply;
    engine.shiftDays(user.id, body.days);
    push(user.id);
    return reply.send({ ok: true, today: engine.today(user.id, user.timeZone) });
  });
  app.post('/api/dev/grant', (request, reply) => {
    const user = ctx.helpers.requireUser(request, reply);
    if (!user) return reply;
    const body = ctx.helpers.parse(devGrantSchema, request.body, reply);
    if (!body) return reply;
    const state = engine.state(user.id);
    engine.save(user.id, {
      ...state,
      xp: state.xp + (body.xp ?? 0),
      coins: state.coins + (body.coins ?? 0),
    });
    push(user.id);
    app.gateway.sessionOf(user.id)?.room.updateProfile(user.id, publicProfile(ctx.repos, user.id));
    return reply.send({ ok: true });
  });
}
