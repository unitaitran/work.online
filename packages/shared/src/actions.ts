// Hành động người chơi gửi lên server (Phase 4C). Client KHÔNG gửi XP, thời lượng hay chuỗi:
// server tự đo giờ, kiểm tra vị trí rồi tính bằng luật trong rules.ts.
import { z } from 'zod';
import type { CheckInStatus } from './rules';
import type { Mission } from './missions';
import type { ProgressState } from './progress';
import { BRANCHES, DEPARTMENTS, type Branch, type Department } from './levels';
import { hashString } from './rng';
import { MICRO_TASK_COUNT } from './tasks';

export const FOCUS_MINUTES = [1, 3, 5] as const;
/** Thời gian pha cà phê (ms), bằng BREW_MS ở client. */
export const COFFEE_BREW_MS = 3500;
/** Khoảng cách tối đa (m) từ người chơi tới vật khi dùng vật (server kiểm tra). */
export const USE_DISTANCE = 2.5;
/** Tối đa số phím được tính mỗi giây (chống gõ máy), bằng giới hạn ở client (120 ms/phím). */
export const MAX_KEYS_PER_SECOND = 8.5;

/** Số quẻ KPI (danh sách nội dung nằm ở client); quẻ chọn theo ngày + mã nhân viên. */
export const KPI_FORTUNE_COUNT = 60;

export function fortuneIndex(day: string, playerCode: string, count = KPI_FORTUNE_COUNT): number {
  return hashString(`kpi|${day}|${playerCode}`) % count;
}

const id = z.string().min(1).max(40);
const count = z.number().int().min(0).max(100_000);
const taskIdSchema = z
  .number()
  .int()
  .min(0)
  .max(MICRO_TASK_COUNT - 1);

export const actionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('checkin') }),
  z.strictObject({ kind: z.literal('fortune') }),
  // Bảng task: nhận việc đã lật, xác nhận xong (ở bảng, sau thời gian làm tối thiểu), bỏ việc.
  z.strictObject({ kind: z.literal('task_accept'), taskId: taskIdSchema }),
  z.strictObject({ kind: z.literal('task_done'), taskId: taskIdSchema }),
  z.strictObject({ kind: z.literal('task_drop'), taskId: taskIdSchema }),
  z.strictObject({ kind: z.literal('coffee_brew') }),
  // Người nhận: id NPC, hoặc "player:<mã nhân viên>" khi tặng người chơi khác cùng phòng.
  z.strictObject({ kind: z.literal('coffee_gift'), npcId: id }),
  z.strictObject({ kind: z.literal('coffee_drink') }),
  z.strictObject({ kind: z.literal('chore'), target: id }),
  z.strictObject({ kind: z.literal('print') }),
  z.strictObject({ kind: z.literal('meeting_start'), seatId: id }),
  z.strictObject({ kind: z.literal('meeting_end') }),
  z.strictObject({
    kind: z.literal('focus_start'),
    minutes: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  }),
  z.strictObject({
    kind: z.literal('focus_end'),
    presses: count,
    scoredKeys: count,
    lines: count,
  }),
  z.strictObject({
    kind: z.literal('vent'),
    length: z.number().int().min(1).max(200),
    anonymous: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('choose_department'),
    department: z.enum(DEPARTMENTS as [Department, ...Department[]]),
  }),
  z.strictObject({
    kind: z.literal('choose_branch'),
    branch: z.enum(BRANCHES as [Branch, ...Branch[]]),
  }),
]);
export type Action = z.infer<typeof actionSchema>;
export type ActionKind = Action['kind'];

/** Tin client gửi: một hành động kèm khoá chống gửi trùng (idempotency). */
export const clientActionSchema = z.strictObject({
  type: z.literal('action'),
  id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  action: actionSchema,
});

export type ActionRejectReason =
  'too_fast' | 'too_far' | 'not_started' | 'invalid' | 'duplicate' | 'not_allowed';

/** Kết quả server trả về sau khi áp một hành động. */
export interface ActionOutcome {
  granted: number;
  base: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  titleBefore: number;
  titleAfter: number;
  checkIn: CheckInStatus | null;
  completedMission: Mission | null;
  /** Quẻ KPI hôm nay (xin quẻ). */
  fortune?: { id: number; repeat: boolean };
}

export type ActionServerMessage =
  | {
      type: 'progress';
      state: ProgressState;
      /** Hành động vừa xử lý (nếu tin này trả lời một hành động). */
      id?: string;
      outcome?: ActionOutcome;
      /** Ngày lịch của server cho người chơi này (theo múi giờ đã lưu). */
      today: string;
    }
  | { type: 'action_rejected'; id: string; reason: ActionRejectReason }
  | {
      type: 'mission_assigned';
      mission: Mission;
      /** Chủ công ty giao (không phải sếp NPC). */ fromCeo?: boolean;
    };
