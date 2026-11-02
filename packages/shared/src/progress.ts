// Trạng thái tiến độ của một người chơi + đọc dữ liệu cũ (migrate).
// Phase 3 lưu trên máy; Phase 4 server dùng đúng cấu trúc và luật này.
import { z } from 'zod';
import { BALANCE } from './balance';
import { BRANCHES, DEPARTMENTS, type Branch, type Department } from './levels';
import type { Mission } from './missions';
import { isDayKey } from './time';

export const PROGRESS_VERSION = 2;

export interface CheckInState {
  lastDay: string | null;
  lastAt: number | null;
  streak: number;
  total: number;
}

export interface DailyState {
  /** Ngày lịch của "rổ" hôm nay; null = chưa có. */
  day: string | null;
  /** XP đã nhận hôm nay (dùng cho giới hạn mềm). */
  earned: number;
  /** Đếm số lần mỗi loại hoạt động đã được tính XP hôm nay. */
  counts: Record<string, number>;
  fortuneClaimed: boolean;
  missions: Mission[];
  /** Thời điểm sếp giao việc kế tiếp (null = chưa hẹn). */
  nextMissionAt: number | null;
}

export type ReviewCheckId = 'level' | 'checkins' | 'focus' | 'helps' | 'branch';

export interface ReviewState {
  /** Ngày bắt đầu kỳ đánh giá hiện tại. */
  periodStart: string | null;
  checkInDays: string[];
  focusMs: number;
  helps: number;
  last: { day: string; passed: boolean; missing: ReviewCheckId[]; fromTitle: number } | null;
}

export interface Personality {
  diligence: number;
  sociability: number;
  creativity: number;
}

export interface LogEntry {
  at: number;
  /** Loại sự kiện hoặc 'mission'. */
  source: string;
  xp: number;
  /** XP trước giới hạn ngày. */
  base: number;
  note?: string;
}

export interface ProgressState {
  version: typeof PROGRESS_VERSION;
  xp: number;
  title: number;
  branch: Branch | null;
  department: Department | null;
  /** Công ty đang làm; null = đã nghỉ (điều kiện để mở công ty riêng). */
  employer: string | null;
  checkIn: CheckInState;
  daily: DailyState;
  /** Số dòng kinh công sở chưa đủ mốc để quy ra XP. */
  linesCarry: number;
  review: ReviewState;
  personality: Personality;
  log: LogEntry[];
  createdAt: number;
}

export function createProgress(now: number): ProgressState {
  return {
    version: PROGRESS_VERSION,
    xp: 0,
    title: 1,
    branch: null,
    department: null,
    employer: BALANCE.company.defaultEmployer,
    checkIn: { lastDay: null, lastAt: null, streak: 0, total: 0 },
    daily: emptyDaily(null),
    linesCarry: 0,
    review: { periodStart: null, checkInDays: [], focusMs: 0, helps: 0, last: null },
    personality: { diligence: 0, sociability: 0, creativity: 0 },
    log: [],
    createdAt: now,
  };
}

export function emptyDaily(day: string | null): DailyState {
  return { day, earned: 0, counts: {}, fortuneClaimed: false, missions: [], nextMissionAt: null };
}

// ---------------------------------------------------------------------------
// Schema & migrate
// ---------------------------------------------------------------------------

const dayKeySchema = z.string().refine(isDayKey);
const nonNegInt = z.number().int().nonnegative();

const checkInSchema = z.object({
  lastDay: dayKeySchema.nullable(),
  lastAt: z.number().nullable(),
  streak: nonNegInt,
  total: nonNegInt,
});

const goalSchema = z.union([
  z.object({
    kind: z.enum(['focusMinutes', 'lines', 'meetingMinutes']),
    amount: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('count'),
    event: z.enum(['coffee-gift', 'chore', 'print', 'task-flip', 'kpi-fortune', 'checkin']),
    amount: z.number().int().positive(),
  }),
]);

const missionSchema = z.object({
  templateId: z.string(),
  text: z.string(),
  goalText: z.string(),
  goal: goalSchema,
  progress: nonNegInt,
  assignedAt: z.number(),
  completedAt: z.number().nullable(),
});

const progressV2Schema = z.object({
  version: z.literal(2),
  xp: nonNegInt,
  title: z.number().int().min(1).max(10),
  branch: z.enum(BRANCHES as [Branch, ...Branch[]]).nullable(),
  department: z.enum(DEPARTMENTS as [Department, ...Department[]]).nullable(),
  employer: z.string().nullable(),
  checkIn: checkInSchema,
  daily: z.object({
    day: dayKeySchema.nullable(),
    earned: nonNegInt,
    counts: z.record(z.string(), nonNegInt),
    fortuneClaimed: z.boolean(),
    missions: z.array(missionSchema).max(10),
    nextMissionAt: z.number().nullable(),
  }),
  linesCarry: nonNegInt,
  review: z.object({
    periodStart: dayKeySchema.nullable(),
    checkInDays: z.array(dayKeySchema).max(31),
    focusMs: nonNegInt,
    helps: nonNegInt,
    last: z
      .object({
        day: dayKeySchema,
        passed: z.boolean(),
        missing: z.array(z.enum(['level', 'checkins', 'focus', 'helps', 'branch'])),
        fromTitle: z.number().int(),
      })
      .nullable(),
  }),
  personality: z.object({ diligence: nonNegInt, sociability: nonNegInt, creativity: nonNegInt }),
  log: z
    .array(
      z.object({
        at: z.number(),
        source: z.string(),
        xp: nonNegInt,
        base: nonNegInt,
        note: z.string().optional(),
      }),
    )
    .max(500),
  createdAt: z.number(),
});

/**
 * Phiên bản 1: dữ liệu rời rạc của Phase 2B (chỉ có thẻ chấm công + ngày xin quẻ),
 * được gom lại thành `{ version: 1, checkIn, fortuneDay }` khi đọc lần đầu.
 */
const progressV1Schema = z.object({
  version: z.literal(1),
  checkIn: checkInSchema,
  fortuneDay: dayKeySchema.nullable().optional(),
  createdAt: z.number().optional(),
});

export type MigrateResult =
  | { ok: true; state: ProgressState; migratedFrom: number | null }
  | { ok: false; reason: 'unknown_version' | 'invalid' };

/** Đọc dữ liệu tiến độ mọi phiên bản đã biết, nâng lên phiên bản hiện tại. */
export function migrateProgress(raw: unknown, now: number): MigrateResult {
  const version =
    typeof raw === 'object' && raw !== null && 'version' in raw ? raw.version : undefined;

  if (version === 1) {
    const parsed = progressV1Schema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'invalid' };
    const base = createProgress(parsed.data.createdAt ?? now);
    // Chuỗi chấm công cũ được giữ nguyên; XP bắt đầu từ 0 vì Phase 2B chưa tính XP.
    return { ok: true, migratedFrom: 1, state: { ...base, checkIn: parsed.data.checkIn } };
  }
  if (version === 2) {
    const parsed = progressV2Schema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'invalid' };
    return { ok: true, migratedFrom: null, state: parsed.data as ProgressState };
  }
  return { ok: false, reason: typeof version === 'number' ? 'unknown_version' : 'invalid' };
}
