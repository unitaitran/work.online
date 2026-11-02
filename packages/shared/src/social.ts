// Phase 5B: sự kiện phòng, xếp hạng, tường than thở chung, bản đồ toà nhà, lịch theo ngày.
import { z } from 'zod';
import type { CompanyPublic } from './companyApi';
import { DEPARTMENTS, type Department } from './levels';

// ---------------------------------------------------------------------------
// Sự kiện ngẫu nhiên theo phòng (không phạt ai)
// ---------------------------------------------------------------------------

export type RoomEventKind = 'boss_walk' | 'wifi_down' | 'coffee_out' | 'surprise_meeting';
export const ROOM_EVENT_KINDS: readonly RoomEventKind[] = [
  'boss_walk',
  'wifi_down',
  'coffee_out',
  'surprise_meeting',
];

/** Khoảng cách giữa hai sự kiện trong một phòng (ms). */
export const ROOM_EVENT_INTERVAL = { min: 5 * 60_000, max: 10 * 60_000 } as const;

/** Thời gian mở của từng loại sự kiện (ms). */
export const ROOM_EVENT_DURATION: Readonly<Record<RoomEventKind, number>> = {
  boss_walk: 3000,
  wifi_down: 45_000,
  coffee_out: 60_000,
  surprise_meeting: 60_000,
};

export interface RoomEventView {
  id: number;
  kind: RoomEventKind;
  endsAt: number;
  /** Mất wifi: tổng số lần gõ router cần (cả phòng cùng làm). */
  goal?: number;
  progress?: number;
}

/** Số lần gõ router cần: theo số người, tối thiểu 5, tối đa 40. */
export function wifiGoal(online: number): number {
  return Math.min(40, Math.max(5, online * 4));
}

// ---------------------------------------------------------------------------
// Xếp hạng
// ---------------------------------------------------------------------------

export type LeaderboardPeriod = 'week' | 'month';
export const leaderboardQuerySchema = z.object({
  period: z.enum(['week', 'month']).default('week'),
  department: z.enum(['all', ...(DEPARTMENTS as [Department, ...Department[]])]).default('all'),
});

export interface LeaderboardRow {
  rank: number;
  name: string;
  title: number;
  branch: 'specialist' | 'manager' | null;
  xp: number;
  me: boolean;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  department: Department | 'all';
  /** Ngày bắt đầu kỳ (khoá ngày). */
  since: string;
  rows: LeaderboardRow[];
  /** Hạng của mình (null nếu đã ẩn mình hoặc chưa có XP trong kỳ). */
  mine: LeaderboardRow | null;
  hidden: boolean;
}

export const privacyRequestSchema = z.strictObject({ hideFromLeaderboard: z.boolean() });

/** Thứ Hai đầu tuần và ngày 1 đầu tháng (theo khoá ngày). */
export function periodStart(today: string, period: LeaderboardPeriod): string {
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  if (period === 'month') return `${String(y)}-${String(m).padStart(2, '0')}-01`;
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7; // 0 = thứ Hai
  date.setUTCDate(date.getUTCDate() - dow);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tường than thở chung
// ---------------------------------------------------------------------------

export const WALL_MAX_LENGTH = 140;
/** Đủ chừng này báo cáo thì bài tự ẩn. */
export const WALL_REPORTS_TO_HIDE = 3;

export const wallPostRequestSchema = z.strictObject({ text: z.string().min(1).max(600) });

export interface WallPost {
  id: number;
  text: string;
  /** Khoá ngày đăng. */
  day: string;
  mine: boolean;
  reportedByMe: boolean;
}

// ---------------------------------------------------------------------------
// Bản đồ toà nhà
// ---------------------------------------------------------------------------

export interface RoomInfo {
  id: string;
  kind: string;
  /** Số tầng hiển thị. */
  floor: number;
  name: string;
  online: number;
  capacity: number;
  /** Phòng riêng (công ty): chỉ thành viên vào được. */
  private: boolean;
}

export interface BuildingResponse {
  rooms: RoomInfo[];
  current: string | null;
  /** Toà đang xem (toà có công ty của mình, mặc định toà 1). */
  building: number;
  /** Các công ty người chơi đặt trong toà này, theo tầng. */
  companies: CompanyPublic[];
}

// ---------------------------------------------------------------------------
// Lịch theo ngày
// ---------------------------------------------------------------------------

export type DayMood = 'tet' | 'payday' | 'monday' | 'friday' | 'weekend' | 'normal';

/** Mùng 1 Tết âm lịch (dương lịch) các năm gần đây. */
const TET_DAYS: Readonly<Record<number, string>> = {
  2025: '2025-01-29',
  2026: '2026-02-17',
  2027: '2027-02-06',
  2028: '2028-01-26',
  2029: '2029-02-13',
  2030: '2030-02-03',
};

/** Ngày lương trong game: ngày 5 và ngày 20 hằng tháng. */
export const PAYDAYS = [5, 20] as const;

/** Không khí của một ngày (đổi nhạc, ánh sáng, lời thoại). Ưu tiên: Tết > lương > thứ. */
export function dayMood(dayKey: string): DayMood {
  const [y = 0, m = 1, d = 1] = dayKey.split('-').map(Number);
  const tet = TET_DAYS[y];
  if (tet) {
    const tetDate = Date.UTC(y, Number(tet.slice(5, 7)) - 1, Number(tet.slice(8, 10)));
    const diff = Math.round((Date.UTC(y, m - 1, d) - tetDate) / 86_400_000);
    // Từ 2 ngày trước Tết tới mùng 3.
    if (diff >= -2 && diff <= 2) return 'tet';
  }
  if ((PAYDAYS as readonly number[]).includes(d)) return 'payday';
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 1) return 'monday';
  if (dow === 5) return 'friday';
  if (dow === 0 || dow === 6) return 'weekend';
  return 'normal';
}
