// Gói tin WebSocket client <-> server (xem docs/PROTOCOL.md). Mọi tin vào server qua zod.
import { z } from 'zod';
import { clientActionSchema, type ActionServerMessage } from './actions';
import type { Appearance } from './character';
import type { Branch } from './levels';

/** Đường dẫn WebSocket trên server (dev: Vite chuyển tiếp tới server). Token ở query `?token=`. */
export const WS_PATH = '/ws';

/** Kích thước tối đa một tin client gửi lên (byte). Vượt thì server đóng kết nối (1009). */
export const MAX_CLIENT_MESSAGE_BYTES = 2048;

/** Client gửi vị trí khoảng 10 lần mỗi giây. */
export const STATE_SEND_HZ = 10;
/** Server phát thay đổi vị trí 5 lần mỗi giây. */
export const STATE_BROADCAST_HZ = 5;
/** Chỉ phát vị trí người trong bán kính này (m) - quản lý vùng quan tâm. */
export const INTEREST_RADIUS = 14;
/** Giữ chỗ cho người mất kết nối trong chừng này (ms) để kết nối lại vào đúng phòng, đúng chỗ. */
export const RESERVE_MS = 30_000;
/** Đứng yên quá lâu thì hỏi "Bạn còn ở đó không?"; không trả lời thì giải phóng chỗ. */
export const IDLE_CHECK_MS = 5 * 60_000;
export const IDLE_GRACE_MS = 60_000;
/** Tốc độ đi tối đa (m/s) server chấp nhận, bằng tốc độ đi ở client. */
export const MAX_WALK_SPEED = 2.6;

export const POSES = ['stand', 'walk', 'sit', 'type'] as const;
export type Pose = (typeof POSES)[number];

export const EMOTES = [
  'wave',
  'clap',
  'laugh',
  'heart',
  'think',
  'sleepy',
  'coffee',
  'cheer',
] as const;
export type Emote = (typeof EMOTES)[number];

/** Câu nhanh có sẵn (KHÔNG có chat tự do). Gửi theo chỉ số. */
export const QUICK_CHATS = [
  'Chào cả nhà!',
  'Cà phê không mọi người?',
  'Cố lên, sắp xong rồi!',
  'Họp chút không?',
  'Cảm ơn nha!',
  'Đi ăn trưa thôi!',
  'Deadline dí quá...',
  'Hôm nay làm tốt lắm!',
  'Mình về trước nhé!',
  'Ai cần giúp không?',
  'Tuyệt vời!',
  'Xin lỗi, mình nhầm.',
] as const;

/** Dữ liệu công khai của một người chơi trong phòng (gửi khi vào phòng hoặc khi đổi). */
export interface PlayerProfile {
  /** Mã phiên trong phòng (số nhỏ, tiết kiệm băng thông). */
  sid: number;
  /** Mã nhân viên công khai (để chặn/ẩn lâu dài). */
  code: string;
  name: string;
  appearance: Appearance;
  title: number;
  branch: Branch | null;
  /** Đồ đang mặc và thú cưng (Phase 5A). */
  equipped?: string[];
}

export interface PlayerSnapshot extends PlayerProfile {
  x: number;
  z: number;
  facing: number;
  pose: Pose;
}

/** Bản ghi vị trí gọn: [sid, x, z, hướng, chỉ số tư thế]. */
export type StateTuple = [number, number, number, number, number];

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

const coord = z.number().min(-1000).max(1000);

export const clientStateSchema = z.strictObject({
  type: z.literal('state'),
  x: coord,
  z: coord,
  facing: z.number().min(-100).max(100),
  pose: z.enum(POSES),
});

export const clientEmoteSchema = z.strictObject({
  type: z.literal('emote'),
  emote: z.enum(EMOTES),
});

export const clientQuickChatSchema = z.strictObject({
  type: z.literal('quick_chat'),
  index: z
    .number()
    .int()
    .min(0)
    .max(QUICK_CHATS.length - 1),
});

export const clientPingSchema = z.strictObject({
  type: z.literal('ping'),
  t: z.number(),
});

/** Trả lời "Bạn còn ở đó không?". */
export const clientActiveSchema = z.strictObject({ type: z.literal('active') });

export const clientLeaveSchema = z.strictObject({ type: z.literal('leave') });

/** Người chơi vừa đổi nhân vật hoặc trang bị: server đọc lại hồ sơ và báo cả phòng. */
export const clientProfileChangedSchema = z.strictObject({ type: z.literal('profile_changed') });

export const clientMessageSchema = z.discriminatedUnion('type', [
  clientStateSchema,
  clientEmoteSchema,
  clientQuickChatSchema,
  clientPingSchema,
  clientActiveSchema,
  clientLeaveSchema,
  clientProfileChangedSchema,
  clientActionSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

export type KickReason = 'idle' | 'replaced' | 'full' | 'unauthorized' | 'abuse' | 'shutdown';
export type ServerErrorCode = 'bad_message' | 'rate_limited';

export type ServerMessage =
  | {
      type: 'welcome';
      protocol: number;
      room: string;
      you: PlayerSnapshot;
      players: PlayerSnapshot[];
      serverTime: number;
    }
  | { type: 'player_join'; player: PlayerSnapshot }
  | { type: 'player_update'; player: PlayerProfile }
  | { type: 'player_leave'; sid: number }
  | { type: 'states'; s: StateTuple[] }
  | { type: 'emote'; sid: number; emote: Emote }
  | { type: 'quick_chat'; sid: number; index: number }
  /** Vị trí gửi lên không hợp lệ (đi quá nhanh, xuyên tường): kéo về chỗ này. */
  | { type: 'correct'; x: number; z: number }
  | { type: 'idle_check'; deadline: number }
  | { type: 'kicked'; reason: KickReason }
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'error'; code: ServerErrorCode }
  | ActionServerMessage;

// ---------------------------------------------------------------------------
// Đọc tin từ chuỗi JSON
// ---------------------------------------------------------------------------

export type ParseResult<T> = { ok: true; value: T } | { ok: false };

/** Server dùng: kiểm tra một tin thô từ client. Không bao giờ ném lỗi. */
export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const result = clientMessageSchema.safeParse(data);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

/**
 * Client dùng: đọc tin từ server (nguồn tin cậy, chỉ kiểm tra dạng tối thiểu).
 * Không bao giờ ném lỗi.
 */
export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  try {
    const data = JSON.parse(raw) as unknown;
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { type?: unknown }).type === 'string'
    ) {
      return { ok: true, value: data as ServerMessage };
    }
  } catch {
    // bỏ qua
  }
  return { ok: false };
}

export function poseIndex(pose: Pose): number {
  return POSES.indexOf(pose);
}

export function poseAt(index: number): Pose {
  return POSES[index] ?? 'stand';
}

/** Làm tròn toạ độ còn 2 chữ số (cm) để gói tin gọn. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
