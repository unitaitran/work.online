import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  OFFICE_FLOOR,
  WS_PATH,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { AppContext } from '../app';
import type { Presence } from '../http/routes';
import { publicProfile } from '../rooms/profile';
import type { Connection, Room } from '../rooms/room';
import { RoomManager } from '../rooms/roomManager';
import { createTokenBucket, type TokenBucketOptions } from './rateLimit';
import { websocketOriginAllowed } from '../http/security';

/** 10 vị trí/giây + biểu cảm, câu nhanh, ping: cho dồn 40, hồi 20/giây. */
export const DEFAULT_WS_RATE_LIMIT: TokenBucketOptions = { capacity: 40, refillPerSecond: 20 };
/** Gửi sai định dạng quá chừng này lần thì đóng kết nối. */
const MAX_BAD_MESSAGES = 20;
const HEARTBEAT_MS = 15_000;

export interface GatewayOptions {
  /** Đồng hồ server (mili giây). Cho phép thay khi test. */
  now?: () => number;
  rateLimit?: TokenBucketOptions;
  /** Tắt nhịp tự động (test gọi tick bằng tay). */
  manualTick?: boolean;
}

/** Xử lý thêm cho các loại tin ngoài phòng (Phase 4C trở đi: hành động, cửa hàng...). */
export type MessageHandler = (session: Session, message: ClientMessage) => boolean;

export interface Session {
  userId: string;
  /** Phòng hiện tại (đổi khi chuyển phòng). */
  room: Room;
  send(message: ServerMessage): void;
}

export type SessionListener = (session: Session) => void;

export interface RoomAccess {
  canEnter(userId: string, kind: string): boolean;
  capacity(kind: string): number;
  /** Chủ công ty: có thẻ vào phòng CEO trong phòng công ty. */
  isCeo?(userId: string, kind: string): boolean;
  /**
   * Phòng của nơi đang làm: "company:<id>" (chủ hoặc thành viên công ty) hoặc "office"
   * (văn phòng chung Mây Hồng). Người chơi chỉ được vào phòng này.
   */
  homeRoom?(userId: string): string;
}

export interface Gateway extends Presence {
  rooms: RoomManager;
  /** Đăng ký xử lý thêm; trả true nếu đã xử lý tin. */
  addHandler(handler: MessageHandler): void;
  /** Phiên đang mở của một người (để đẩy tin từ REST/sự kiện). */
  sessionOf(userId: string): Session | null;
  /** Mọi phiên đang mở. */
  sessions(): Session[];
  /** Gọi mỗi khi một người vừa vào phòng. */
  onSession(listener: SessionListener): void;
  /** Gọi khi một phiên đóng. */
  onSessionEnd(listener: SessionListener): void;
  /** Quyền vào phòng riêng (công ty, Phase 6): theo loại phòng "company:<id>". */
  setAccess(access: RoomAccess): void;
  /** Đưa một người đang ở phòng riêng về văn phòng chung. */
  sendToOffice(userId: string): void;
}

/**
 * Gắn WebSocket (thư viện ws, chế độ noServer) vào HTTP server của Fastify tại WS_PATH.
 * Xác thực token ở query khi nâng cấp; mọi tin qua giới hạn kích thước, tần suất và schema zod.
 */
export function attachWebSocketGateway(
  app: FastifyInstance,
  ctx: AppContext,
  options: GatewayOptions = {},
): Gateway {
  const now = options.now ?? ctx.now;
  const rateLimit = options.rateLimit ?? DEFAULT_WS_RATE_LIMIT;
  const rooms = new RoomManager({
    capacity: ctx.config.roomCapacity,
    now,
    isCeo: (userId, kind) => access.isCeo?.(userId, kind) ?? false,
  });
  if (!options.manualTick) rooms.start();
  const handlers: MessageHandler[] = [];
  const sessions = new Map<string, Session>();
  const perIp = new Map<string, number>();
  const joinListeners: SessionListener[] = [];
  let access: RoomAccess = { canEnter: () => false, capacity: () => 0 };
  const endListeners: SessionListener[] = [];

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_CLIENT_MESSAGE_BYTES,
    perMessageDeflate: false,
  });

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = parseUrl(request.url);
    if (url?.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    // Trình duyệt ở nguồn lạ không được mở kết nối thay người chơi.
    if (!websocketOriginAllowed(request, ctx.config)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    // Giới hạn số kết nối đồng thời từ một IP.
    const ip = clientIp(request, ctx.config.trustProxy);
    if ((perIp.get(ip) ?? 0) >= ctx.config.wsPerIp) {
      socket.end(
        'HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    const token = url.searchParams.get('token') ?? '';
    const user = ctx.accounts.authenticate(token);
    if (!user) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
      ws.once('close', () => {
        const left = (perIp.get(ip) ?? 1) - 1;
        if (left <= 0) perIp.delete(ip);
        else perIp.set(ip, left);
      });
      onConnection(ws, user.id);
    });
  };
  app.server.on('upgrade', onUpgrade);

  function onConnection(ws: WebSocket, userId: string): void {
    const send = (message: ServerMessage): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    };
    const conn: Connection = {
      send,
      close: (code, reason) => {
        ws.close(code, reason);
      },
    };

    // Hết chỗ toàn server (trừ người đang có chỗ giữ, được vào lại).
    if (!rooms.roomOf(userId) && rooms.online() >= ctx.config.serverCapacity) {
      send({ type: 'kicked', reason: 'full' });
      ws.close(1013, 'full');
      return;
    }

    // Vào thẳng phòng của nơi đang làm (cả khi kết nối lại): làm ở công ty nào thì vào công ty đó.
    const home = access.homeRoom?.(userId) ?? 'office';
    const room = home.startsWith('company:')
      ? rooms.assign(userId, home, OFFICE_FLOOR, access.capacity(home))
      : rooms.assign(userId);
    // Kết nối cũ của cùng tài khoản (tab khác) bị thay ở room.join.
    const session: Session = { userId, room, send };
    sessions.set(userId, session);
    room.join({ userId, profile: publicProfile(ctx.repos, userId) }, conn);
    for (const listener of joinListeners) listener(session);

    const bucket = createTokenBucket(rateLimit, now);
    let warnedRateLimit = false;
    let badMessages = 0;
    let alive = true;

    const bad = (): void => {
      badMessages += 1;
      app.log.debug('websocket bad message dropped');
      send({ type: 'error', code: 'bad_message' });
      if (badMessages >= MAX_BAD_MESSAGES) {
        app.log.warn('websocket closed: too many bad messages');
        session.room.remove(userId, 'abuse');
      }
    };

    ws.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, HEARTBEAT_MS);
    heartbeat.unref();

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (!bucket.tryConsume()) {
        // Chỉ báo một lần cho mỗi đợt gửi dồn, các tin thừa bị bỏ qua.
        if (!warnedRateLimit) {
          warnedRateLimit = true;
          send({ type: 'error', code: 'rate_limited' });
        }
        return;
      }
      warnedRateLimit = false;
      if (isBinary) {
        bad();
        return;
      }
      const parsed = parseClientMessage(rawDataToString(data));
      if (!parsed.ok) {
        bad();
        return;
      }
      handle(session, parsed.value);
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      if (sessions.get(userId) === session) {
        sessions.delete(userId);
        for (const listener of endListeners) listener(session);
      }
      session.room.disconnect(userId, conn);
    });

    ws.on('error', (error: Error & { code?: string }) => {
      // Ví dụ: tin vượt maxPayload. ws tự đóng kết nối; chỉ ghi mã lỗi, không ghi nội dung.
      app.log.debug({ code: error.code }, 'websocket error');
    });
  }

  function handle(session: Session, message: ClientMessage): void {
    const { room, userId } = session;
    switch (message.type) {
      case 'state':
        room.updateState(userId, message.x, message.z, message.facing, message.pose);
        return;
      case 'emote':
        room.emote(userId, message.emote);
        return;
      case 'quick_chat':
        room.quickChat(userId, message.index);
        return;
      case 'ping':
        session.send({ type: 'pong', t: message.t, serverTime: now() });
        return;
      case 'active':
        room.active(userId);
        return;
      case 'leave':
        room.remove(userId);
        return;
      case 'profile_changed':
        room.updateProfile(userId, publicProfile(ctx.repos, userId));
        return;
      case 'switch_room': {
        // Phòng riêng (công ty): roomId là loại phòng "company:<id>"; module công ty kiểm tra quyền.
        let roomId = message.roomId;
        if (roomId.startsWith('company:')) {
          if (!access.canEnter(userId, roomId)) {
            session.send({ type: 'switch_failed', reason: 'forbidden' });
            return;
          }
          roomId = rooms.ensure(roomId, access.capacity(roomId)).id;
        } else if (roomId === 'office') {
          // Đang làm ở công ty riêng thì không vào văn phòng chung Mây Hồng.
          if ((access.homeRoom?.(userId) ?? 'office') !== 'office') {
            session.send({ type: 'switch_failed', reason: 'forbidden' });
            return;
          }
          roomId = rooms.ensure('office', ctx.config.roomCapacity).id;
        } else if (rooms.get(roomId)?.kind !== 'office') {
          session.send({ type: 'switch_failed', reason: 'forbidden' });
          return;
        }
        const moved = rooms.move(userId, roomId, publicProfile(ctx.repos, userId));
        if (!moved.ok) {
          session.send({ type: 'switch_failed', reason: moved.reason });
          return;
        }
        session.room = moved.room;
        for (const listener of joinListeners) listener(session);
        return;
      }
      default:
        for (const handler of handlers) if (handler(session, message)) return;
    }
  }

  // Tắt êm: báo mọi người "bảo trì" và đóng 1001, chờ tối đa 1 giây cho khung đóng gửi đi,
  // rồi mới cắt hẳn các kết nối còn lại.
  app.addHook('preClose', (done) => {
    app.server.off('upgrade', onUpgrade);
    rooms.stop('shutdown');
    const finish = (): void => {
      for (const client of wss.clients) client.terminate();
      wss.close(() => {
        done();
      });
    };
    if (wss.clients.size === 0) {
      finish();
      return;
    }
    const timer = setTimeout(finish, 1000);
    let open = wss.clients.size;
    for (const client of wss.clients) {
      client.once('close', () => {
        open -= 1;
        if (open === 0) {
          clearTimeout(timer);
          finish();
        }
      });
    }
  });

  return {
    rooms,
    online: () => rooms.online(),
    addHandler(handler) {
      handlers.push(handler);
    },
    sessionOf: (userId) => sessions.get(userId) ?? null,
    sessions: () => [...sessions.values()],
    onSession(listener) {
      joinListeners.push(listener);
    },
    onSessionEnd(listener) {
      endListeners.push(listener);
    },
    setAccess(next) {
      access = next;
    },
    sendToOffice(userId) {
      const session = sessions.get(userId);
      if (!session || session.room.kind === 'office') return;
      const office = rooms.ensure('office', ctx.config.roomCapacity);
      const moved = rooms.move(userId, office.id, publicProfile(ctx.repos, userId));
      if (moved.ok) {
        session.room = moved.room;
        for (const listener of joinListeners) listener(session);
      }
    },
  };
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

/** IP người kết nối (sau reverse proxy thì lấy từ X-Forwarded-For khi đã bật TRUST_PROXY). */
function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? '';
  return request.socket.remoteAddress ?? '';
}

function parseUrl(url: string | undefined): URL | null {
  try {
    return new URL(url ?? '/', 'http://localhost');
  } catch {
    return null;
  }
}
