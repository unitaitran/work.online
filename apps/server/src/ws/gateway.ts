import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  WS_PATH,
  parseClientMessage,
  type ServerErrorCode,
  type ServerMessage,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app';
import type { Presence } from '../http/routes';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { createTokenBucket, type TokenBucketOptions } from './rateLimit';

export const DEFAULT_WS_RATE_LIMIT: TokenBucketOptions = { capacity: 10, refillPerSecond: 5 };

export interface GatewayOptions {
  /** Đồng hồ server (mili giây). Cho phép thay khi test. */
  now?: () => number;
  rateLimit?: TokenBucketOptions;
}

/**
 * Gắn WebSocket (thư viện ws, chế độ noServer) vào HTTP server của Fastify tại WS_PATH.
 * Mọi tin nhận vào đều qua giới hạn kích thước, giới hạn tần suất và schema zod.
 */
export function attachWebSocketGateway(
  app: FastifyInstance,
  _ctx: AppContext,
  options: GatewayOptions = {},
): Presence {
  const now = options.now ?? Date.now;
  const rateLimit = options.rateLimit ?? DEFAULT_WS_RATE_LIMIT;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_CLIENT_MESSAGE_BYTES,
    perMessageDeflate: false,
  });

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (getPathname(request.url) !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  };
  app.server.on('upgrade', onUpgrade);

  wss.on('connection', (ws: WebSocket) => {
    const bucket = createTokenBucket(rateLimit, now);
    let warnedRateLimit = false;

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (!bucket.tryConsume()) {
        // Chỉ báo một lần cho mỗi đợt gửi dồn, các tin thừa bị bỏ qua.
        if (!warnedRateLimit) {
          warnedRateLimit = true;
          sendError(ws, 'rate_limited');
        }
        return;
      }
      warnedRateLimit = false;

      if (isBinary) {
        sendError(ws, 'bad_message');
        return;
      }

      const parsed = parseClientMessage(rawDataToString(data));
      if (!parsed.ok) {
        sendError(ws, 'bad_message');
        return;
      }

      // Phase 0 chỉ có một loại tin (echo). Khi thêm loại tin mới, đổi chỗ này thành switch theo `type`.
      const message = parsed.value;
      send(ws, { type: 'echo', text: message.text, serverTime: now() });
    });

    ws.on('error', (error: Error & { code?: string }) => {
      // Ví dụ: tin vượt maxPayload. ws tự đóng kết nối; chỉ ghi mã lỗi, không ghi nội dung.
      app.log.debug({ code: error.code }, 'websocket error');
    });
  });

  app.addHook('preClose', (done) => {
    app.server.off('upgrade', onUpgrade);
    for (const client of wss.clients) {
      client.terminate();
    }
    wss.close(() => {
      done();
    });
  });

  return { online: () => wss.clients.size };
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, code: ServerErrorCode): void {
  send(ws, { type: 'error', code });
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return data.toString('utf8');
}

function getPathname(url: string | undefined): string {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return '';
  }
}
