// Gói tin WebSocket client <-> server (xem docs/PROTOCOL.md). Mọi tin vào server qua zod.
import { z } from 'zod';
import { clientActionSchema, type ActionServerMessage } from './actions';
import type { Appearance } from './character';
import type { RoomEventKind, RoomEventView } from './social';
import type { Branch } from './levels';
import type { JobTag } from './job';
import type { MilkTeaInviteError, MilkTeaReplyError, MilkTeaRoundView } from './milkTea';

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

export const POSES = ['stand', 'walk', 'sit', 'type', 'lie'] as const;
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
  'tea',
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
  /** Chức danh theo nơi làm: CEO, vị trí ở công ty người chơi, hoặc null (thang chức danh chung). */
  job?: JobTag;
  /** Đồ đang mặc và thú cưng (Phase 5A). */
  equipped?: string[];
  /** Đang mặc đồng phục công ty: màu áo (hex), đè lên áo đang mặc. */
  uniform?: number;
}

export interface PlayerSnapshot extends PlayerProfile {
  x: number;
  z: number;
  facing: number;
  pose: Pose;
}

/** Cây người chơi đã tưới, ở lại trong phòng (Phase 5A). */
export interface PlantView {
  id: number;
  x: number;
  z: number;
  /** Loại hoa (0..PLANT_KINDS-1). */
  kind: number;
  owner: string;
}
export const PLANT_KINDS = 4;
/** Tối đa số cây mỗi loại phòng; cây cũ nhất tự mất. */
export const MAX_ROOM_PLANTS = 30;

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

export const clientChatSchema = z.strictObject({
  type: z.literal('chat'),
  text: z.string().trim().min(1).max(100),
  targetSid: z.number().int().optional(),
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

/** Tham gia sự kiện phòng đang diễn ra (giả vờ bận, gõ router, đổ hạt cà phê...). */
export const clientEventRespondSchema = z.strictObject({
  type: z.literal('event_respond'),
  id: z.number().int().nonnegative(),
});

/** Rủ cả phòng hoặc 1 người uống trà sữa (mỗi người tự trả MILK_TEA.price xu, uống xong được XP). */
export const clientTeaInviteSchema = z.strictObject({
  type: z.literal('tea_invite'),
  targetSid: z.number().int().optional(),
});

/** Nhận lời (tự trả một cốc) / từ chối lời rủ uống trà sữa. */
export const clientTeaReplySchema = z.strictObject({
  type: z.literal('tea_reply'),
  id: z.number().int().nonnegative(),
  accept: z.boolean(),
});

/** Chuyển sang phòng khác (bản đồ toà nhà). */
export const clientSwitchRoomSchema = z.strictObject({
  type: z.literal('switch_room'),
  roomId: z.string().min(1).max(64),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  clientStateSchema,
  clientEmoteSchema,
  clientQuickChatSchema,
  clientChatSchema,
  clientPingSchema,
  clientActiveSchema,
  clientLeaveSchema,
  clientProfileChangedSchema,
  clientActionSchema,
  clientEventRespondSchema,
  clientSwitchRoomSchema,
  clientTeaInviteSchema,
  clientTeaReplySchema,
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
  | { type: 'chat'; sid: number; text: string; isDirect?: boolean | undefined; targetSid?: number | undefined }
  /** Vị trí gửi lên không hợp lệ (đi quá nhanh, xuyên tường): kéo về chỗ này. */
  | { type: 'correct'; x: number; z: number }
  | { type: 'idle_check'; deadline: number }
  | { type: 'kicked'; reason: KickReason }
  | { type: 'pong'; t: number; serverTime: number }
  | { type: 'error'; code: ServerErrorCode }
  | { type: 'room_event'; event: RoomEventView }
  | { type: 'room_event_progress'; id: number; progress: number }
  | {
      type: 'room_event_end';
      id: number;
      kind: RoomEventKind;
      success: boolean;
      /** Mình có được thưởng không. */
      rewarded: boolean;
    }
  | { type: 'switch_failed'; reason: 'full' | 'not_found' | 'forbidden' }
  | { type: 'room_plants'; plants: PlantView[] }
  | { type: 'plant_added'; plant: PlantView }
  | { type: 'plant_removed'; ids: number[] }
  /** Phòng công ty đổi tên / mua đồ: tải lại biển hiệu và đồ trong phòng. */
  | { type: 'company_refresh' }
  /** Gửi CEO: công ty vừa hoàn thành một dự án (ở đâu trong game cũng nhận). */
  | {
      type: 'project_done';
      industry: string;
      nameIndex: number;
      difficulty: number;
      reward: number;
      reputation: number;
      /** Gửi nhân viên: phần thưởng mình nhận (không có: tin cho CEO). Thực tập sinh: intern. */
      bonus?: { coins: number; xp: number; intern?: boolean };
      /** Gửi CEO: đã thưởng bao nhiêu nhân viên, tổng bao nhiêu xu từ quỹ. */
      paid?: { people: number; coins: number };
    }
  /** Người chơi khác vừa tặng mình một ly cà phê. */
  | { type: 'coffee_received'; fromSid: number; fromName: string }
  /** Có người rủ cả phòng uống trà sữa (gửi cho mọi người trừ người rủ). */
  | { type: 'tea_round'; round: MilkTeaRoundView }
  /** Người rủ: lượt của mình đã mở (đã trả cốc của mình, `xp` được cộng). */
  | { type: 'tea_started'; round: MilkTeaRoundView; xp: number }
  | { type: 'tea_failed'; reason: MilkTeaInviteError }
  /** Kết quả trả lời của mình. */
  | {
      type: 'tea_replied';
      id: number;
      accept: boolean;
      ok: boolean;
      reason?: MilkTeaReplyError;
      /** XP được cộng khi uống. */
      xp?: number;
    }
  /** Một người nhận lời (cả phòng thấy). */
  | { type: 'tea_served'; id: number; sid: number; cups: number }
  /** Lượt rủ kết thúc: tổng số cốc (gồm cốc người rủ). */
  | { type: 'tea_end'; id: number; cups: number; hostSid: number }
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
