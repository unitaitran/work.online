// Chấm công: mỗi ngày (theo lịch địa phương) một lần, có chuỗi ngày liên tiếp.
import { z } from 'zod';
import type { KeyValueStore } from '../../storage';
import { daysBetween, dayKey, isDayKey } from '../dayKey';

export interface CheckInState {
  /** Ngày chấm công gần nhất (khoá ngày địa phương), null nếu chưa từng. */
  lastDay: string | null;
  /** Thời điểm chấm gần nhất (ms, UTC) để hiển thị giờ. */
  lastAt: number | null;
  streak: number;
  total: number;
}

export const EMPTY_CHECK_IN: CheckInState = { lastDay: null, lastAt: null, streak: 0, total: 0 };

export type CheckInResult =
  | { status: 'checked'; state: CheckInState; day: string }
  | { status: 'already'; state: CheckInState; day: string };

/**
 * Quy tắc (ghi trong docs/DECISIONS.md):
 * - "Một ngày" là ngày lịch ở múi giờ hiện tại của máy lúc quẹt thẻ.
 * - Cách lần trước đúng 1 ngày lịch: chuỗi +1. Cách từ 2 ngày trở lên: chuỗi về 1.
 * - Cùng ngày, hoặc ngày lịch hiện tại *đứng trước* lần trước (vừa đổi sang múi giờ chậm hơn):
 *   coi như đã chấm, không đổi gì. Đổi múi giờ không thể làm mất chuỗi hay chấm hai lần một ngày.
 */
export function checkIn(state: CheckInState, now: Date, timeZone?: string): CheckInResult {
  const today = dayKey(now, timeZone);
  if (state.lastDay !== null) {
    const diff = daysBetween(state.lastDay, today);
    if (!(diff > 0)) return { status: 'already', state, day: today };
    const streak = diff === 1 ? state.streak + 1 : 1;
    return {
      status: 'checked',
      day: today,
      state: { lastDay: today, lastAt: now.getTime(), streak, total: state.total + 1 },
    };
  }
  return {
    status: 'checked',
    day: today,
    state: { lastDay: today, lastAt: now.getTime(), streak: 1, total: state.total + 1 },
  };
}

/** Chuỗi đang hiển thị: nếu đã bỏ lỡ từ 2 ngày, chuỗi coi như về 0 cho tới lần quẹt tới. */
export function visibleStreak(state: CheckInState, now: Date, timeZone?: string): number {
  if (state.lastDay === null) return 0;
  const diff = daysBetween(state.lastDay, dayKey(now, timeZone));
  return diff <= 1 ? state.streak : 0;
}

export function hasCheckedInToday(state: CheckInState, now: Date, timeZone?: string): boolean {
  if (state.lastDay === null) return false;
  return !(daysBetween(state.lastDay, dayKey(now, timeZone)) > 0);
}

export const CHECK_IN_KEY = 'dilam.checkin.v1';

const schema = z.object({
  lastDay: z.string().refine(isDayKey).nullable(),
  lastAt: z.number().nullable(),
  streak: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export function loadCheckIn(store: KeyValueStore | null): CheckInState {
  try {
    const raw = store?.getItem(CHECK_IN_KEY);
    if (!raw) return { ...EMPTY_CHECK_IN };
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...EMPTY_CHECK_IN };
  } catch {
    return { ...EMPTY_CHECK_IN };
  }
}

export function saveCheckIn(store: KeyValueStore | null, state: CheckInState): boolean {
  try {
    if (!store) return false;
    store.setItem(CHECK_IN_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
