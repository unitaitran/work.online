// Kỳ đánh giá thăng chức: mỗi 7 ngày lịch; điều kiện cứng + phỏng vấn.
// Chưa đạt thì KHÔNG mất cấp hay chức danh, chỉ chờ kỳ sau.
import { BALANCE } from './balance';
import { levelFor, titleMinLevel, TITLE_COUNT, type Branch, type Department } from './levels';
import type { Personality, ProgressState, ReviewCheckId } from './progress';
import { daysBetween } from './time';

export interface ReviewCheck {
  id: ReviewCheckId;
  current: number;
  target: number;
  met: boolean;
}

export interface ReviewStatus {
  periodStart: string | null;
  /** Số ngày đã qua của kỳ (0 = ngày đầu). */
  daysElapsed: number;
  daysLeft: number;
  /** Đã tới hạn đánh giá chưa. */
  due: boolean;
  /** Chức danh sẽ xét lên (null nếu đã tối đa). */
  nextTitle: number | null;
  checks: ReviewCheck[];
  /** Đủ mọi điều kiện cứng (để vào phỏng vấn). */
  eligible: boolean;
}

export function reviewStatus(state: ProgressState, today: string): ReviewStatus {
  const { periodDays, minCheckInDays, minFocusMinutes, minHelps } = BALANCE.review;
  const periodStart = state.review.periodStart;
  const daysElapsed = periodStart ? Math.max(0, daysBetween(periodStart, today)) : 0;
  const nextTitle = state.title < TITLE_COUNT ? state.title + 1 : null;
  const level = levelFor(state.xp);
  const focusMinutes = Math.floor(state.review.focusMs / 60_000);

  const checks: ReviewCheck[] = [];
  if (nextTitle !== null) {
    checks.push({
      id: 'level',
      current: level,
      target: titleMinLevel(nextTitle),
      met: level >= titleMinLevel(nextTitle),
    });
  }
  checks.push(
    {
      id: 'checkins',
      current: state.review.checkInDays.length,
      target: minCheckInDays,
      met: state.review.checkInDays.length >= minCheckInDays,
    },
    {
      id: 'focus',
      current: focusMinutes,
      target: minFocusMinutes,
      met: focusMinutes >= minFocusMinutes,
    },
    {
      id: 'helps',
      current: state.review.helps,
      target: minHelps,
      met: state.review.helps >= minHelps,
    },
  );
  // Lên chức danh 6 trở đi cần đã chọn nhánh (chọn khi đạt chức danh 5).
  if (nextTitle !== null && nextTitle > BALANCE.branchFromTitle) {
    checks.push({
      id: 'branch',
      current: state.branch ? 1 : 0,
      target: 1,
      met: state.branch !== null,
    });
  }

  return {
    periodStart,
    daysElapsed,
    daysLeft: Math.max(0, periodDays - daysElapsed),
    due: periodStart !== null && daysElapsed >= periodDays,
    nextTitle,
    checks,
    eligible: nextTitle !== null && checks.every((check) => check.met),
  };
}

/**
 * Kết thúc kỳ đánh giá. `passed` = đã qua phỏng vấn (chỉ hợp lệ khi đủ điều kiện).
 * Dù đạt hay chưa, kỳ mới bắt đầu từ hôm nay; chưa đạt thì giữ nguyên chức danh.
 */
export function completeReview(
  state: ProgressState,
  today: string,
  outcome: { passed: boolean; personality?: Personality },
): ProgressState {
  const status = reviewStatus(state, today);
  if (!status.due) return state;
  const passed = outcome.passed && status.eligible;
  const delta = passed ? outcome.personality : undefined;
  return {
    ...state,
    title: passed && status.nextTitle !== null ? status.nextTitle : state.title,
    personality: delta
      ? {
          diligence: state.personality.diligence + delta.diligence,
          sociability: state.personality.sociability + delta.sociability,
          creativity: state.personality.creativity + delta.creativity,
        }
      : state.personality,
    review: {
      periodStart: today,
      checkInDays: [],
      focusMs: 0,
      helps: 0,
      last: {
        day: today,
        passed,
        missing: status.checks.filter((check) => !check.met).map((check) => check.id),
        fromTitle: state.title,
      },
    },
  };
}

export function needsDepartment(state: ProgressState): boolean {
  return state.title >= BALANCE.departmentFromTitle && state.department === null;
}

export function needsBranch(state: ProgressState): boolean {
  return state.title >= BALANCE.branchFromTitle && state.branch === null;
}

export function chooseDepartment(state: ProgressState, department: Department): ProgressState {
  return needsDepartment(state) ? { ...state, department } : state;
}

export function chooseBranch(state: ProgressState, branch: Branch): ProgressState {
  return needsBranch(state) ? { ...state, branch } : state;
}
