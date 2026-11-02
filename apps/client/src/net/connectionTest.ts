import { parseServerMessage, type ClientMessage, type ServerErrorCode } from '@dilam/shared';

export type ConnectionTestResult =
  | { ok: true; text: string; serverTime: number; roundTripMs: number }
  | { ok: false; reason: 'connect_failed' | 'timeout' | 'bad_reply' }
  | { ok: false; reason: 'server_error'; code: ServerErrorCode };

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Mở WebSocket, gửi một tin echo, chờ server trả lời rồi đóng kết nối.
 * Không bao giờ reject: mọi lỗi đều thành một ConnectionTestResult.
 */
export function runConnectionTest(
  url: string,
  text: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ConnectionTestResult> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      resolve({ ok: false, reason: 'connect_failed' });
      return;
    }

    const startedAt = performance.now();
    let settled = false;

    const finish = (result: ConnectionTestResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    socket.addEventListener('open', () => {
      const message: ClientMessage = { type: 'echo', text };
      socket.send(JSON.stringify(message));
    });

    socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed =
        typeof event.data === 'string' ? parseServerMessage(event.data) : { ok: false as const };
      if (!parsed.ok) {
        finish({ ok: false, reason: 'bad_reply' });
        return;
      }
      const reply = parsed.value;
      if (reply.type === 'error') {
        finish({ ok: false, reason: 'server_error', code: reply.code });
        return;
      }
      finish({
        ok: true,
        text: reply.text,
        serverTime: reply.serverTime,
        roundTripMs: Math.round(performance.now() - startedAt),
      });
    });

    socket.addEventListener('error', () => {
      finish({ ok: false, reason: 'connect_failed' });
    });
    socket.addEventListener('close', () => {
      finish({ ok: false, reason: 'connect_failed' });
    });
  });
}
