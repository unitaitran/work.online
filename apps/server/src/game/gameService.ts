// Nối bộ tính điểm với WebSocket: nhận hành động, trả tiến độ, sếp giao việc định kỳ,
// và (chỉ khi DEV_TOOLS) các API dev để thử vòng chơi nhanh.
import {
  buyRequestSchema,
  equipRequestSchema,
  hashString,
  MAX_ROOM_PLANTS,
  OFFICE_FLOOR,
  officeInteractables,
  PLANT_KINDS,
  seededRng,
  type PlantView,
} from '@dilam/shared';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app';
import { playerCodeOf } from '../auth/secrets';
import { publicProfile } from '../rooms/profile';
import type { Gateway, Session } from '../ws/gateway';
import { ProgressEngine, type PlayerContext } from './progressEngine';
import { ShopService } from './shop';
import { RoomEventDirector } from './roomEvents';
import { registerSocialRoutes, roomInfo } from './socialRoutes';
import { CompanyService } from '../company/companyService';
import { registerCompanyRoutes } from '../company/companyRoutes';
import type { RoomPlant } from '../db/repositories';
import { sendError } from '../http/routes';

const MISSION_TICK_MS = 3000;
const PRUNE_ACTIONS_MS = 60 * 60_000;
/** Giữ khoá chống gửi trùng trong 2 ngày. */
const ACTION_KEEP_MS = 2 * 86_400_000;

export interface GameService {
  engine: ProgressEngine;
  shop: ShopService;
  events: RoomEventDirector;
  company: CompanyService;
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
  const shop = new ShopService(ctx.repos, ctx.now);
  const plantSpots = new Map(
    officeInteractables(OFFICE_FLOOR)
      .filter((item) => item.kind === 'plant')
      .map((item) => [item.id, item.approach]),
  );
  const toView = (p: RoomPlant): PlantView => ({
    id: p.id,
    x: p.x,
    z: p.z,
    kind: p.kind,
    owner: p.ownerName,
  });
  /** Gửi cho mọi phòng cùng loại (cây dùng chung cho mọi phòng văn phòng). */
  const broadcastKind = (kind: string, message: Parameters<Session['send']>[0]): void => {
    for (const info of gateway.rooms.list()) {
      if (info.kind === kind) gateway.rooms.get(info.id)?.broadcastAll(message);
    }
  };
  /** Tưới cây xong: một khóm hoa mọc cạnh chậu, mọi người trong phòng thấy. */
  const growPlant = (session: Session, target: string): void => {
    const spot = plantSpots.get(target);
    if (!spot) return;
    const kind = session.room.kind;
    const at = ctx.now();
    const rng = seededRng(hashString(`${target}|${String(at)}`));
    const angle = rng() * Math.PI * 2;
    const radius = 0.35 + rng() * 0.45;
    const plant = ctx.repos.plants.add(kind, {
      x: spot.x + Math.cos(angle) * radius,
      z: spot.z + Math.sin(angle) * radius,
      kind: Math.floor(rng() * PLANT_KINDS),
      ownerName: ctx.repos.characters.get(session.userId)?.name ?? '',
      at,
    });
    const removed = ctx.repos.plants.trim(kind, MAX_ROOM_PLANTS);
    broadcastKind(kind, { type: 'plant_added', plant: toView(plant) });
    if (removed.length > 0) broadcastKind(kind, { type: 'plant_removed', ids: removed });
  };

  const contextFor = (userId: string): PlayerContext => {
    const user = ctx.repos.users.byId(userId);
    return {
      userId,
      playerCode: playerCodeOf(userId),
      timeZone: user?.timeZone ?? 'Asia/Ho_Chi_Minh',
      position: () => gateway.sessionOf(userId)?.room.positionOf(userId) ?? null,
      coffeeOut: () => {
        const room = gateway.sessionOf(userId)?.room;
        return room ? events.coffeeOut(room.id) : false;
      },
    };
  };

  // Sự kiện ngẫu nhiên theo phòng: thưởng qua đúng luật XP (có giới hạn mỗi ngày).
  const events = new RoomEventDirector({
    now: ctx.now,
    reward: (userId, _kind) => {
      engine.grantRoomEvent(contextFor(userId), _kind);
      push(userId);
    },
  });
  const eventTimer = setInterval(() => {
    events.tick(gateway.rooms.all());
  }, 1000);
  eventTimer.unref();

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
    const current = events.current(session.room.id);
    if (current) session.send({ type: 'room_event', event: current });
    session.send({
      type: 'room_plants',
      plants: ctx.repos.plants.list(session.room.kind).map(toView),
    });
  });
  gateway.onSessionEnd((session: Session) => {
    engine.forget(session.userId);
  });

  gateway.addHandler((session, message) => {
    if (message.type !== 'event_respond') return false;
    events.respond(session.room, session.userId, message.id);
    return true;
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
    if (message.action.kind === 'chore' && message.action.target.startsWith('plant-')) {
      growPlant(session, message.action.target);
    }
    // Làm việc trong phòng công ty: XP thực nhận thành điểm công việc cho dự án của công ty.
    if (result.outcome && result.outcome.granted > 0 && session.room.kind.startsWith('company:')) {
      company.contribute(
        session.userId,
        session.room.kind.slice('company:'.length),
        result.outcome.granted,
      );
    }
    // Đổi chức danh / nhánh thì cả phòng thấy nhãn mới.
    if (
      message.action.kind === 'choose_branch' ||
      (result.outcome && result.outcome.titleAfter !== result.outcome.titleBefore)
    ) {
      session.room.updateProfile(session.userId, publicProfile(ctx.repos, session.userId));
    }
    return true;
  });

  // XP nhỏ giọt: mỗi 15 giây xem ai đang ngồi máy / ngồi họp (server tự xác định từ vị trí + tư thế).
  const deskSeats = officeInteractables(OFFICE_FLOOR).filter(
    (i) => (i.kind === 'desk' || i.kind === 'ceodesk') && i.seat,
  );
  const meetingSeats = officeInteractables(OFFICE_FLOOR).filter(
    (i) => i.kind === 'meeting' && i.seat,
  );
  const near = (p: { x: number; z: number }, seats: typeof deskSeats): boolean =>
    seats.some((i) => i.seat && Math.hypot(i.seat.x - p.x, i.seat.z - p.z) <= 0.6);
  const seatOf = (session: Session): 'desk' | 'meeting' | null => {
    const pose = session.room.poseOf(session.userId);
    const p = session.room.positionOf(session.userId);
    if (!p || (pose !== 'type' && pose !== 'sit')) return null;
    if (near(p, deskSeats)) return 'desk';
    if (near(p, meetingSeats)) return 'meeting';
    return null;
  };
  const WORK_TICK_MS = 15_000;
  const workTimer = setInterval(() => {
    for (const session of gateway.sessions()) {
      const result = engine.accrueWork(contextFor(session.userId), seatOf(session), WORK_TICK_MS);
      if (!result) continue;
      session.send({
        type: 'progress',
        state: result.state,
        today: result.today,
        outcome: result.outcome,
      });
      if (result.outcome.granted > 0 && session.room.kind.startsWith('company:')) {
        company.contribute(
          session.userId,
          session.room.kind.slice('company:'.length),
          result.outcome.granted,
        );
      }
      if (result.outcome.titleAfter !== result.outcome.titleBefore) {
        session.room.updateProfile(session.userId, publicProfile(ctx.repos, session.userId));
      }
    }
  }, WORK_TICK_MS);
  workTimer.unref();

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
    clearInterval(workTimer);
    clearInterval(eventTimer);
    clearInterval(pruneTimer);
    done();
  });

  // ---------- Cửa hàng ----------
  app.get('/api/shop/inventory', (request, reply) => {
    const user = ctx.helpers.requireUser(request, reply);
    if (!user) return reply;
    return reply.send(shop.inventory(user.id));
  });
  app.post('/api/shop/buy', (request, reply) => {
    const user = ctx.helpers.requireUser(request, reply);
    if (!user || !ctx.helpers.allowWrite(request, reply, user.id)) return reply;
    const body = ctx.helpers.parse(buyRequestSchema, request.body, reply);
    if (!body) return reply;
    const result = shop.buy(user.id, body.itemId);
    if (!result.ok) return sendError(reply, 422, 'rejected', result.error);
    push(user.id);
    return reply.send(result.inventory);
  });
  app.post('/api/shop/equip', (request, reply) => {
    const user = ctx.helpers.requireUser(request, reply);
    if (!user || !ctx.helpers.allowWrite(request, reply, user.id)) return reply;
    const body = ctx.helpers.parse(equipRequestSchema, request.body, reply);
    if (!body) return reply;
    const result = shop.equip(user.id, body.itemId, body.equip);
    if (!result.ok) return sendError(reply, 422, 'rejected', result.error);
    // Người khác trong phòng thấy trang phục / thú cưng mới.
    gateway.sessionOf(user.id)?.room.updateProfile(user.id, publicProfile(ctx.repos, user.id));
    return reply.send(result.inventory);
  });
  app.get('/api/shop/ledger', (request, reply) => {
    const user = ctx.helpers.requireUser(request, reply);
    if (!user) return reply;
    return reply.send({ entries: ctx.repos.ledger.recent(user.id, 50) });
  });

  // ---------- Công ty (Phase 6) ----------
  const company = new CompanyService(ctx.repos, engine, ctx.now, {
    online: (companyId) =>
      gateway.rooms
        .list()
        .filter((info) => info.kind === `company:${companyId}`)
        .reduce((sum, info) => sum + info.online, 0),
    push,
    evict: (userId, companyId) => {
      if (gateway.sessionOf(userId)?.room.kind === `company:${companyId}`) {
        gateway.sendToOffice(userId);
      }
    },
    profileChanged: (userId) => {
      gateway.sessionOf(userId)?.room.updateProfile(userId, publicProfile(ctx.repos, userId));
    },
  });
  gateway.setAccess({
    canEnter: (userId, kind) => company.canEnter(userId, kind.slice('company:'.length)),
    capacity: (kind) => company.roomCapacity(kind.slice('company:'.length)),
    homeRoom: (userId) => {
      const mine = company.companyOf(userId);
      return mine ? `company:${mine.id}` : 'office';
    },
    // Phòng CEO chỉ mở trong phòng công ty, cho đúng chủ công ty đó.
    isCeo: (userId, kind) =>
      kind.startsWith('company:') &&
      ctx.repos.companies.get(kind.slice('company:'.length))?.ownerId === userId,
  });
  registerCompanyRoutes(app, ctx, company);
  registerSocialRoutes(
    app,
    ctx,
    gateway,
    (userId) => {
      // Bản đồ toà nhà: thêm tầng công ty của mình (phòng riêng).
      const mine = company.companyOf(userId);
      if (!mine) return [];
      const info = company.get(mine.id);
      if (!info) return [];
      return [
        {
          ...roomInfo(
            {
              id: `company:${mine.id}`,
              kind: `company:${mine.id}`,
              online: info.online,
              capacity: company.roomCapacity(mine.id),
            },
            info.name,
          ),
          floor: info.floor,
        },
      ];
    },
    (userId) => {
      const building = company.companyOf(userId)?.building ?? 1;
      return {
        building,
        companies: company.inBuilding(building).sort((a, b) => a.floor - b.floor),
      };
    },
  );

  if (ctx.config.devTools) {
    registerDevRoutes(app, ctx, engine, push);
    app.post('/api/dev/room-event', (request, reply) => {
      const user = ctx.helpers.requireUser(request, reply);
      if (!user) return reply;
      const body = ctx.helpers.parse(devEventSchema, request.body, reply);
      if (!body) return reply;
      const room = gateway.sessionOf(user.id)?.room;
      if (!room) return sendError(reply, 404, 'not_found');
      return reply.send({ event: events.start(room, body.kind) });
    });
  }

  return { engine, shop, events, company, push, contextFor };
}

const devEventSchema = z.strictObject({
  kind: z.enum(['boss_walk', 'wifi_down', 'coffee_out', 'surprise_meeting']),
});
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
    const coins = state.coins + (body.coins ?? 0);
    ctx.repos.transaction(() => {
      engine.save(user.id, { ...state, xp: state.xp + (body.xp ?? 0), coins });
      if (body.coins) ctx.repos.ledger.add(user.id, ctx.now(), body.coins, 'dev', coins);
    });
    push(user.id);
    app.gateway.sessionOf(user.id)?.room.updateProfile(user.id, publicProfile(ctx.repos, user.id));
    return reply.send({ ok: true });
  });
}
