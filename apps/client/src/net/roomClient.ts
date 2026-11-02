// Kết nối phòng qua WebSocket: tự kết nối lại với chờ lùi dần, gửi vị trí ~10 lần/giây
// (chỉ khi đổi), gửi hành động kèm khoá chống trùng và chờ server trả lời.
import {
  parseServerMessage,
  STATE_SEND_HZ,
  type Action,
  type ActionOutcome,
  type ActionRejectReason,
  type ClientMessage,
  type KickReason,
  type Pose,
  type ProgressState,
  type ServerMessage,
} from '@dilam/shared';
import { buildWsUrl } from './wsUrl';

export type RoomStatus = 'connecting' | 'online' | 'offline' | 'kicked';

export interface RoomClientOptions {
  token: string;
  onMessage(message: ServerMessage): void;
  onStatus(status: RoomStatus, info?: { kick?: KickReason; retryInMs?: number }): void;
  /** Thay WebSocket khi test. */
  createSocket?: (url: string) => WebSocket;
  now?: () => number;
}

export type ActionReply =
  | { ok: true; state: ProgressState; outcome: ActionOutcome | null; today: string }
  | { ok: false; reason: ActionRejectReason | 'offline' | 'timeout' };

const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 15_000;
const ACTION_TIMEOUT_MS = 8000;
/** Đứng yên vẫn gửi lại vị trí thưa thớt (giữ đồng bộ sau khi bị kéo về). */
const STATE_KEEPALIVE_MS = 3000;

/** Chờ lùi dần có chút ngẫu nhiên để nhiều người không cùng kết nối lại một lúc. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + random() * 0.5));
}

export function newActionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class RoomClient {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private retryTimer: number | undefined;
  private stopped = false;
  private status: RoomStatus = 'offline';
  private lastState = '';
  private lastStateAt = 0;
  private readonly pending = new Map<
    string,
    { resolve: (reply: ActionReply) => void; timer: number }
  >();
  private readonly now: () => number;

  constructor(private readonly o: RoomClientOptions) {
    this.now = o.now ?? Date.now;
  }

  get connected(): boolean {
    return this.status === 'online';
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.retryTimer);
    this.send({ type: 'leave' });
    this.socket?.close(1000, 'leave');
    this.socket = null;
    this.failPending('offline');
  }

  /** Vào lại sau khi bị đá (đứng yên lâu, mở tab khác). */
  reconnect(): void {
    window.clearTimeout(this.retryTimer);
    this.socket?.close();
    this.attempt = 0;
    this.stopped = false;
    this.open();
  }

  send(message: ClientMessage): boolean {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  /** Gửi vị trí; gọi mỗi khung hình được, tự giới hạn ~10 lần/giây và chỉ gửi khi đổi. */
  sendState(x: number, z: number, facing: number, pose: Pose): void {
    const now = this.now();
    if (now - this.lastStateAt < 1000 / STATE_SEND_HZ) return;
    const key = `${x.toFixed(2)},${z.toFixed(2)},${facing.toFixed(2)},${pose}`;
    if (key === this.lastState && now - this.lastStateAt < STATE_KEEPALIVE_MS) return;
    if (this.send({ type: 'state', x, z, facing, pose })) {
      this.lastState = key;
      this.lastStateAt = now;
    }
  }

  /** Gửi một hành động; server trả lời tiến độ mới hoặc lý do từ chối. */
  action(action: Action): Promise<ActionReply> {
    const id = newActionId();
    if (!this.send({ type: 'action', id, action })) {
      return Promise.resolve({ ok: false, reason: 'offline' });
    }
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, reason: 'timeout' });
      }, ACTION_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
    });
  }

  private open(): void {
    this.setStatus('connecting');
    const url = `${buildWsUrl(window.location)}?token=${encodeURIComponent(this.o.token)}`;
    let socket: WebSocket;
    try {
      socket = this.o.createSocket ? this.o.createSocket(url) : new WebSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    let kicked: KickReason | null = null;
    socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') return;
      const parsed = parseServerMessage(event.data);
      if (!parsed.ok) return;
      const message = parsed.value;
      if (message.type === 'welcome') {
        this.attempt = 0;
        this.lastState = '';
        this.setStatus('online');
      } else if (message.type === 'kicked') {
        kicked = message.reason;
      } else if (message.type === 'progress' && message.id) {
        this.resolve(message.id, {
          ok: true,
          state: message.state,
          outcome: message.outcome ?? null,
          today: message.today,
        });
      } else if (message.type === 'action_rejected') {
        this.resolve(message.id, { ok: false, reason: message.reason });
      }
      this.o.onMessage(message);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.failPending('offline');
      if (this.stopped) return;
      // Bị đá vì đứng yên lâu / mở tab khác: không tự vào lại, chờ người chơi bấm.
      if (kicked && kicked !== 'full' && kicked !== 'shutdown') {
        this.setStatus('kicked', { kick: kicked });
        return;
      }
      this.scheduleRetry();
    });
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.setStatus('offline', { retryInMs: delay });
    this.retryTimer = window.setTimeout(() => {
      this.open();
    }, delay);
  }

  private resolve(id: string, reply: ActionReply): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(reply);
  }

  private failPending(reason: 'offline'): void {
    for (const [id, pending] of this.pending) {
      window.clearTimeout(pending.timer);
      pending.resolve({ ok: false, reason });
      this.pending.delete(id);
    }
  }

  private setStatus(status: RoomStatus, info?: { kick?: KickReason; retryInMs?: number }): void {
    this.status = status;
    this.o.onStatus(status, info);
  }
}
