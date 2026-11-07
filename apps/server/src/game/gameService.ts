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
  hasCeoMeeting,
  normalizeUsername,
  CEO_MEETING_SEAT_PREFIX,
} from '@dilam/shared';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../app';
import { devToolsAllowed } from '../config';
import { playerCodeOf } from '../auth/secrets';
import { careerUnlockOf, publicProfile } from '../rooms/profile';
import type { Gateway, Session } from '../ws/gateway';
import { PLAYER_GIFT_PREFIX, ProgressEngine, type PlayerContext } from './progressEngine';
import { ShopService } from './shop';
import { RoomEventDirector } from './roomEvents';
import { MilkTeaService } from './milkTea';
import { registerSocialRoutes, roomInfo } from './socialRoutes';
import { CompanyService } from '../company/companyService';
import { registerCompanyRoutes } from '../company/companyRoutes';
import type { RoomPlant, UserRecord } from '../db/repositories';
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
  // Tâm từng chậu cây (hoa mọc trong chậu, không phải chỗ người chơi đứng tưới).
  const plantSpots = new Map(OFFICE_FLOOR.plants.map((p, i) => [`plant-${String(i)}`, p]));
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
    // Mọc trong chậu cây vừa tưới (client đặt lên mặt đất trong chậu, quanh mép).
    const radius = 0.12 + rng() * 0.06;
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
      careerUnlock: () => careerUnlockOf(ctx.repos, userId),
      colleagueAt: (code) => {
        const room = gateway.sessionOf(userId)?.room;
        const other = room?.userIds().find((id) => playerCodeOf(id) === code);
        return room && other ? room.positionOf(other) : null;
      },
      companyPerks: () => {
        const room = gateway.sessionOf(userId)?.room;
        if (!room || !room.kind.startsWith('company:')) return [];
        const companyId = room.kind.slice('company:'.length);
        return ctx.repos.companies.get(companyId)?.economy.perks ?? [];
      },
      wearingUniform: () => {
        const room = gateway.sessionOf(userId)?.room;
        if (!room || !room.kind.startsWith('company:')) return false;
        const companyId = room.kind.slice('company:'.length);
        const co = ctx.repos.companies.get(companyId);
        if (!co) return false;
        return (co.economy.uniformOn ?? []).includes(playerCodeOf(userId));
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
  // Rủ cả phòng uống trà sữa: ai uống người nấy trả, server trừ xu (giao dịch + sổ cái), cộng XP.
  const tea = new MilkTeaService({
    now: ctx.now,
    charge: (userId, amount, reason) =>
      ctx.repos.transaction(() => {
        const record = ctx.repos.progress.get(userId);
        if (!record || record.state.coins < amount) return false;
        const at = ctx.now();
        const balance = record.state.coins - amount;
        ctx.repos.progress.save(userId, { ...record.state, coins: balance }, at);
        ctx.repos.ledger.add(userId, at, -amount, reason, balance);
        return true;
      }),
    reward: (userId) => engine.grantMilkTea(contextFor(userId)).granted,
    push: (userId) => {
      push(userId);
    },
  });
  const eventTimer = setInterval(() => {
    events.tick(gateway.rooms.all());
    tea.tick();
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
    // Việc "Họp với sếp" vừa giao / vừa xong: tính lại quyền vào phòng sếp.
    session.room.refreshCeo(userId);
  };

  gateway.onSession((session: Session) => {
    push(session.userId);
    const current = events.current(session.room.id);
    if (current) session.send({ type: 'room_event', event: current });
    const teaRound = tea.current(session.room.id);
    if (teaRound && teaRound.hostSid !== session.room.profileOf(session.userId)?.sid) {
      session.send({ type: 'tea_round', round: teaRound });
    }
    session.send({
      type: 'room_plants',
      plants: ctx.repos.plants.list(session.room.kind).map(toView),
    });
  });
  gateway.onSessionEnd((session: Session) => {
    engine.forget(session.userId);
  });

  gateway.addHandler((session, message) => {
    if (message.type === 'tea_invite') {
      const error = tea.invite(session.room, session.userId, message.targetSid);
      if (error) session.send({ type: 'tea_failed', reason: error });
      return true;
    }
    if (message.type === 'tea_reply') {
      tea.reply(session.room, session.userId, message.id, message.accept);
      return true;
    }
    return false;
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
    session.room.refreshCeo(session.userId);
    session.send({
      type: 'progress',
      id: message.id,
      state: result.state,
      today: result.today,
      ...(result.outcome ? { outcome: result.outcome } : {}),
    });
    // Tặng cà phê cho người chơi khác: báo cho người nhận.
    if (
      message.action.kind === 'coffee_gift' &&
      message.action.npcId.startsWith(PLAYER_GIFT_PREFIX)
    ) {
      const code = message.action.npcId.slice(PLAYER_GIFT_PREFIX.length);
      const receiver = session.room.userIds().find((id) => playerCodeOf(id) === code);
      const giver = session.room.profileOf(session.userId);
      if (receiver && giver) {
        session.room.sendTo(receiver, {
          type: 'coffee_received',
          fromSid: giver.sid,
          fromName: giver.name,
        });
      }
    }
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
    // Lên cấp (có thể đổi chức danh hoặc vị trí ở công ty) / chọn nhánh thì cả phòng thấy nhãn mới.
    if (
      message.action.kind === 'choose_branch' ||
      (result.outcome && result.outcome.levelAfter !== result.outcome.levelBefore)
    ) {
      session.room.updateProfile(session.userId, publicProfile(ctx.repos, session.userId));
    }
    return true;
  });

  // XP nhỏ giọt: mỗi 15 giây xem ai đang ngồi máy / ngồi họp (server tự xác định từ vị trí + tư thế).
  const deskSeats = officeInteractables(OFFICE_FLOOR).filter((i) => i.kind === 'desk' && i.seat);
  const ceoSeats = officeInteractables(OFFICE_FLOOR).filter((i) => i.kind === 'ceodesk' && i.seat);
  const meetingSeats = officeInteractables(OFFICE_FLOOR).filter(
    (i) => i.kind === 'meeting' && i.seat && !i.id.startsWith(CEO_MEETING_SEAT_PREFIX),
  );
  const ceoMeetingSeats = officeInteractables(OFFICE_FLOOR).filter(
    (i) => i.kind === 'meeting' && i.seat && i.id.startsWith(CEO_MEETING_SEAT_PREFIX),
  );
  const near = (p: { x: number; z: number }, seats: typeof deskSeats): boolean =>
    seats.some((i) => i.seat && Math.hypot(i.seat.x - p.x, i.seat.z - p.z) <= 0.6);
  const seatOf = (session: Session): 'desk' | 'meeting' | 'ceoMeeting' | null => {
    const pose = session.room.poseOf(session.userId);
    const p = session.room.positionOf(session.userId);
    if (!p || (pose !== 'type' && pose !== 'sit')) return null;
    if (near(p, deskSeats)) return 'desk';
    // Ghế CEO: chỉ chủ công ty (trong phòng công ty của mình) mới tính là ngồi làm việc.
    if (near(p, ceoSeats)) {
      const kind = session.room.kind;
      const owner =
        kind.startsWith('company:') &&
        ctx.repos.companies.get(kind.slice('company:'.length))?.ownerId === session.userId;
      return owner ? 'desk' : null;
    }
    if (near(p, ceoMeetingSeats)) return 'ceoMeeting';
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
      if (result.outcome.levelAfter !== result.outcome.levelBefore) {
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
    companyChanged: (companyId) => {
      for (const room of gateway.rooms.all()) {
        if (room.kind === `company:${companyId}`) room.broadcastAll({ type: 'company_refresh' });
      }
    },
    projectDone: (ownerId, message) => {
      gateway.sessionOf(ownerId)?.room.sendTo(ownerId, message);
    },
    missionAssigned: (userId, mission) => {
      gateway.sessionOf(userId)?.send({ type: 'mission_assigned', mission, fromCeo: true });
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
    // Thẻ vào phòng sếp: chủ công ty (phòng công ty của mình), hoặc đang có việc "Họp với sếp".
    isCeo: (userId, kind) =>
      (kind.startsWith('company:') &&
        ctx.repos.companies.get(kind.slice('company:'.length))?.ownerId === userId) ||
      hasCeoMeeting(engine.state(userId)),
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

  if (ctx.config.devTools || ctx.config.devUsers.length > 0) {
    registerDevRoutes(app, ctx, engine, push);
    // Xoá công ty / xoá tài khoản (chỉ tài khoản quản trị trong DEV_USERS).
    app.post('/api/dev/delete-company', (request, reply) => {
      const user = requireDevUser(ctx, request, reply);
      if (!user) return reply;
      const body = ctx.helpers.parse(devNameSchema, request.body, reply);
      if (!body) return reply;
      const found = company.findByName(body.name);
      if (!found) return sendError(reply, 404, 'not_found');
      company.dissolve(found.id);
      return reply.send({ ok: true, name: found.name });
    });
    app.post('/api/dev/delete-user', (request, reply) => {
      const user = requireDevUser(ctx, request, reply);
      if (!user) return reply;
      const body = ctx.helpers.parse(devNameSchema, request.body, reply);
      if (!body) return reply;
      const target = ctx.repos.users.byUsername(normalizeUsername(body.name));
      if (!target) return sendError(reply, 404, 'not_found');
      if (target.id === user.id) return sendError(reply, 400, 'bad_request');
      // Là chủ công ty: giải thể trước để nhân viên không bị kẹt ở công ty đã mất chủ.
      const owned = ctx.repos.companies.byOwner(target.id);
      if (owned) company.dissolve(owned.id);
      gateway.sessionOf(target.id)?.room.remove(target.id, 'unauthorized');
      ctx.accounts.remove(target.id);
      return reply.send({ ok: true });
    });
    app.post('/api/dev/room-event', (request, reply) => {
      const user = requireDevUser(ctx, request, reply);
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
/** Tên công ty / tên đăng nhập cho các lệnh xoá của công cụ dev. */
const devNameSchema = z.strictObject({ name: z.string().trim().min(1).max(60) });

/** Cộng xu / XP cho người khác (theo tên đăng nhập), tối đa 20 người một lần. */
const devGrantUsersSchema = z.strictObject({
  usernames: z.array(z.string().min(1).max(40)).min(1).max(20),
  xp: z.number().int().min(0).max(1_000_000).optional(),
  coins: z.number().int().min(0).max(10_000_000).optional(),
});

const devGrantSchema = z.strictObject({
  xp: z.number().int().min(0).max(1_000_000).optional(),
  coins: z.number().int().min(0).max(10_000_000).optional(),
});

/** Được dùng công cụ dev: bật DEV_TOOLS (chỉ khi phát triển) hoặc tên đăng nhập nằm trong DEV_USERS. */
function canUseDevTools(ctx: AppContext, userId: string): boolean {
  return devToolsAllowed(ctx.config, ctx.repos.users.account(userId));
}

/** Như requireUser, nhưng người không có quyền dev nhận 404 (không lộ là có API này). */
function requireDevUser(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
): UserRecord | null {
  const user = ctx.helpers.requireUser(request, reply);
  if (!user) return null;
  if (canUseDevTools(ctx, user.id)) return user;
  void sendError(reply, 404, 'not_found');
  return null;
}

/** API công cụ dev: tua ngày, cộng XP/xu. Chỉ cho người có quyền dev (xem canUseDevTools). */
function registerDevRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  engine: ProgressEngine,
  push: (userId: string) => void,
): void {
  app.post('/api/dev/shift-day', (request, reply) => {
    const user = requireDevUser(ctx, request, reply);
    if (!user) return reply;
    const body = ctx.helpers.parse(devShiftSchema, request.body, reply);
    if (!body) return reply;
    engine.shiftDays(user.id, body.days);
    push(user.id);
    return reply.send({ ok: true, today: engine.today(user.id, user.timeZone) });
  });
  app.post('/api/dev/grant', (request, reply) => {
    const user = requireDevUser(ctx, request, reply);
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
  // Cộng xu / XP cho vài người khác (công cụ dev của tài khoản quản trị).
  app.post('/api/dev/grant-users', (request, reply) => {
    const user = requireDevUser(ctx, request, reply);
    if (!user) return reply;
    const body = ctx.helpers.parse(devGrantUsersSchema, request.body, reply);
    if (!body) return reply;
    const granted: string[] = [];
    const missing: string[] = [];
    for (const raw of body.usernames) {
      const name = normalizeUsername(raw);
      const target = ctx.repos.users.byUsername(name);
      if (!target) {
        missing.push(name);
        continue;
      }
      const state = engine.state(target.id);
      const coins = state.coins + (body.coins ?? 0);
      ctx.repos.transaction(() => {
        engine.save(target.id, { ...state, xp: state.xp + (body.xp ?? 0), coins });
        if (body.coins) ctx.repos.ledger.add(target.id, ctx.now(), body.coins, 'dev:gift', coins);
      });
      push(target.id);
      app.gateway
        .sessionOf(target.id)
        ?.room.updateProfile(target.id, publicProfile(ctx.repos, target.id));
      granted.push(name);
    }
    return reply.send({ granted, missing });
  });
}
