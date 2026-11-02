// Luật XP: hàm thuần, dùng chung client (Phase 3) và server (Phase 4).
// Không tin số liệu trong sự kiện khi tự tính được (chuỗi chấm công, thời lượng...).
import type { ActivityEvent } from './activityEvents';
import { BALANCE } from './balance';
import { levelFor, type Department } from './levels';
import {
  MISSION_TEMPLATES,
  pickMission,
  progressMission,
  startMission,
  type Mission,
} from './missions';
import { emptyDaily, type CheckInState, type LogEntry, type ProgressState } from './progress';
import { daysBetween } from './time';

// ---------------------------------------------------------------------------
// Chấm công theo ngày lịch
// ---------------------------------------------------------------------------

export type CheckInStatus = 'checked' | 'already';

/**
 * Cách lần trước đúng 1 ngày lịch: chuỗi +1; từ 2 ngày: chuỗi về 1.
 * Cùng ngày hoặc ngày lịch lùi lại (đổi sang múi giờ chậm hơn): coi như đã chấm.
 */
export function checkInOnDay(
  state: CheckInState,
  today: string,
  at: number,
): { status: CheckInStatus; state: CheckInState } {
  if (state.lastDay !== null) {
    const diff = daysBetween(state.lastDay, today);
    if (!(diff > 0)) return { status: 'already', state };
    return {
      status: 'checked',
      state: {
        lastDay: today,
        lastAt: at,
        streak: diff === 1 ? state.streak + 1 : 1,
        total: state.total + 1,
      },
    };
  }
  return {
    status: 'checked',
    state: { lastDay: today, lastAt: at, streak: 1, total: state.total + 1 },
  };
}

// ---------------------------------------------------------------------------
// XP gốc của một sự kiện
// ---------------------------------------------------------------------------

export type XpCategory =
  | 'checkin'
  | 'focus'
  | 'lines'
  | 'task'
  | 'coffeeGift'
  | 'chore'
  | 'fortune'
  | 'meeting'
  | 'mission';

/** Phòng ban nào được ưu đãi loại hoạt động nào (x departmentBuff). */
export const DEPARTMENT_BUFFS: Readonly<Record<Department, readonly XpCategory[]>> = {
  dev: ['focus'],
  sales: ['coffeeGift', 'task'],
  marketing: ['lines', 'fortune'],
  // Kế toán: chỉ phần thưởng chuỗi chấm công (xem xpFor).
  accounting: [],
  hr: ['chore', 'coffeeGift'],
};

export function buffed(xp: number, category: XpCategory, department: Department | null): number {
  if (!department || !DEPARTMENT_BUFFS[department].includes(category)) return xp;
  return Math.round(xp * BALANCE.departmentBuff);
}

export interface XpContext {
  department: Department | null;
  /** Chuỗi chấm công SAU khi chấm (chỉ dùng cho sự kiện checkin hợp lệ). */
  streak: number;
  /** Số lần đã được tính hôm nay theo loại giới hạn. */
  countToday(key: keyof typeof BALANCE.perDayLimits): number;
  fortuneClaimed: boolean;
  linesCarry: number;
}

export interface XpResult {
  xp: number;
  /** Dòng kinh công sở còn dư sau khi quy đổi. */
  linesCarry: number;
  /** Các phần cộng lại (để ghi nhật ký / kiểm tra). */
  parts: { category: XpCategory; xp: number }[];
}

/**
 * XP gốc (đã nhân ưu đãi phòng ban, CHƯA áp giới hạn ngày) của một sự kiện.
 * Sự kiện checkin chỉ được gọi khi chấm công hợp lệ (status 'checked').
 */
export function xpFor(event: ActivityEvent, ctx: XpContext): XpResult {
  const parts: XpResult['parts'] = [];
  let linesCarry = ctx.linesCarry;
  const limits = BALANCE.perDayLimits;
  const add = (category: XpCategory, xp: number): void => {
    if (xp > 0) parts.push({ category, xp: buffed(xp, category, ctx.department) });
  };

  switch (event.type) {
    case 'checkin': {
      const { base, perStreakDay, streakCap } = BALANCE.checkIn;
      const streakBonus = perStreakDay * Math.min(Math.max(ctx.streak, 0), streakCap);
      const bonus =
        ctx.department === 'accounting'
          ? Math.round(streakBonus * BALANCE.departmentBuff)
          : streakBonus;
      parts.push({ category: 'checkin', xp: base + bonus });
      break;
    }
    case 'focus-typing': {
      const { plannedMs, completed, lines } = event.detail;
      const minutes = Math.round(plannedMs / 60_000);
      const actualMs = Math.min(event.durationMs, plannedMs);
      const sessionXp =
        completed && actualMs >= plannedMs
          ? (BALANCE.focus.completed[minutes] ?? 0)
          : Math.floor(actualMs / 60_000) * BALANCE.focus.partialPerMinute;
      add('focus', sessionXp);
      // Dòng kinh công sở: cộng dồn, mỗi đủ mốc thì quy ra XP.
      linesCarry += Math.max(0, Math.floor(lines));
      const chunks = Math.floor(linesCarry / BALANCE.lines.per);
      linesCarry -= chunks * BALANCE.lines.per;
      add('lines', chunks * BALANCE.lines.xp);
      break;
    }
    case 'task-flip':
      if (event.detail.completed && ctx.countToday('taskDone') < limits.taskDone)
        add('task', BALANCE.taskDone);
      break;
    case 'coffee-gift':
      if (ctx.countToday('coffeeGift') < limits.coffeeGift) add('coffeeGift', BALANCE.coffeeGift);
      break;
    case 'chore':
      if (ctx.countToday('chore') < limits.chore) add('chore', BALANCE.chore);
      break;
    case 'kpi-fortune':
      if (!event.detail.repeat && !ctx.fortuneClaimed) add('fortune', BALANCE.fortune);
      break;
    case 'meeting': {
      const used = ctx.countToday('meetingMinutes');
      const minutes = Math.min(
        Math.floor(event.durationMs / 60_000),
        BALANCE.meeting.maxMinutesPerSession,
        Math.max(0, limits.meetingMinutes - used),
      );
      add('meeting', minutes * BALANCE.meeting.perMinute);
      break;
    }
    default:
      break;
  }
  return { xp: parts.reduce((sum, part) => sum + part.xp, 0), linesCarry, parts };
}

// ---------------------------------------------------------------------------
// Giới hạn mềm mỗi ngày
// ---------------------------------------------------------------------------

/** Phần dưới giới hạn nhận đủ; phần vượt chỉ nhận `overCapRate` (làm tròn xuống). */
export function applyDailyCap(
  earnedToday: number,
  xp: number,
  cap: number = BALANCE.dailySoftCap,
  rate: number = BALANCE.overCapRate,
): number {
  if (xp <= 0) return 0;
  const room = Math.max(0, cap - earnedToday);
  const full = Math.min(xp, room);
  return full + Math.floor((xp - full) * rate);
}

// ---------------------------------------------------------------------------
// Sang ngày mới
// ---------------------------------------------------------------------------

/**
 * Mở "rổ" ngày mới nếu `today` đứng sau ngày hiện tại. Ngày lịch lùi lại (đổi múi giờ)
 * thì giữ nguyên rổ cũ để không được nhận giới hạn ngày hai lần.
 */
export function rollDay(state: ProgressState, today: string): ProgressState {
  let next = state;
  if (next.daily.day === null || daysBetween(next.daily.day, today) > 0) {
    next = { ...next, daily: emptyDaily(today) };
  }
  if (next.review.periodStart === null) {
    next = { ...next, review: { ...next.review, periodStart: today } };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Áp một sự kiện vào tiến độ
// ---------------------------------------------------------------------------

export interface ApplyContext {
  /** Ngày lịch hiện tại của người chơi. */
  today: string;
  now: number;
}

export interface ApplyResult {
  state: ProgressState;
  /** XP thực nhận (sau giới hạn ngày). */
  granted: number;
  /** XP trước giới hạn ngày. */
  base: number;
  levelBefore: number;
  levelAfter: number;
  checkIn: CheckInStatus | null;
  completedMission: Mission | null;
}

function bump(counts: Record<string, number>, key: string, by = 1): Record<string, number> {
  return { ...counts, [key]: (counts[key] ?? 0) + by };
}

export function applyEvent(
  input: ProgressState,
  event: ActivityEvent,
  ctx: ApplyContext,
): ApplyResult {
  let state = rollDay(input, ctx.today);
  const levelBefore = levelFor(state.xp);
  let checkInStatus: CheckInStatus | null = null;
  let counts = state.daily.counts;
  let review = state.review;

  // Chấm công: tự tính lại từ trạng thái, không tin streak trong sự kiện.
  if (event.type === 'checkin') {
    const result = checkInOnDay(state.checkIn, ctx.today, event.startedAt);
    checkInStatus = result.status;
    if (result.status === 'already') {
      return {
        state,
        granted: 0,
        base: 0,
        levelBefore,
        levelAfter: levelBefore,
        checkIn: 'already',
        completedMission: null,
      };
    }
    state = { ...state, checkIn: result.state };
    if (!review.checkInDays.includes(ctx.today)) {
      review = { ...review, checkInDays: [...review.checkInDays, ctx.today] };
    }
  }

  const xp = xpFor(event, {
    department: state.department,
    streak: state.checkIn.streak,
    countToday: (key) => counts[key] ?? 0,
    fortuneClaimed: state.daily.fortuneClaimed,
    linesCarry: state.linesCarry,
  });

  // Đếm số lần đã tính (chỉ khi thật sự được XP) và chỉ số cho kỳ đánh giá.
  let fortuneClaimed = state.daily.fortuneClaimed;
  for (const part of xp.parts) {
    if (part.category === 'task') counts = bump(counts, 'taskDone');
    if (part.category === 'coffeeGift') counts = bump(counts, 'coffeeGift');
    if (part.category === 'chore') counts = bump(counts, 'chore');
    if (part.category === 'fortune') fortuneClaimed = true;
    // Họp không có ưu đãi phòng ban nên XP / perMinute = số phút đã tính.
    if (part.category === 'meeting') {
      counts = bump(counts, 'meetingMinutes', Math.round(part.xp / BALANCE.meeting.perMinute));
    }
  }
  if (event.type === 'focus-typing') {
    review = {
      ...review,
      focusMs: review.focusMs + Math.min(event.durationMs, event.detail.plannedMs),
    };
  }
  if (xp.parts.some((part) => part.category === 'coffeeGift' || part.category === 'chore')) {
    review = { ...review, helps: review.helps + 1 };
  }

  // Việc sếp giao.
  let missionXp = 0;
  let completedMission = null as Mission | null;
  const missions = state.daily.missions.map((mission) => {
    const updated = progressMission(mission, event, ctx.now);
    if (mission.completedAt === null && updated.completedAt !== null) {
      completedMission = updated;
      missionXp += BALANCE.mission;
    }
    return updated;
  });
  let nextMissionAt = state.daily.nextMissionAt;
  if (missionXp > 0) nextMissionAt = ctx.now + BALANCE.missions.cooldownMs;

  const base = xp.xp + missionXp;
  const granted = applyDailyCap(state.daily.earned, base);
  // Nhật ký tách phần của hoạt động và phần thưởng việc sếp giao.
  const grantedEvent = applyDailyCap(state.daily.earned, xp.xp);
  const log: LogEntry[] = [...state.log];
  if (xp.xp > 0) log.push({ at: ctx.now, source: event.type, xp: grantedEvent, base: xp.xp });
  if (missionXp > 0) {
    log.push({ at: ctx.now, source: 'mission', xp: granted - grantedEvent, base: missionXp });
  }

  state = {
    ...state,
    xp: state.xp + granted,
    linesCarry: xp.linesCarry,
    review,
    daily: {
      ...state.daily,
      earned: state.daily.earned + granted,
      counts,
      fortuneClaimed,
      missions,
      nextMissionAt,
    },
    log: log.slice(-BALANCE.log.maxEntries),
  };

  return {
    state,
    granted,
    base,
    levelBefore,
    levelAfter: levelFor(state.xp),
    checkIn: checkInStatus,
    completedMission,
  };
}

// ---------------------------------------------------------------------------
// Sếp giao việc
// ---------------------------------------------------------------------------

/** Việc đang làm (chưa xong) hôm nay, nếu có. */
export function activeMission(state: ProgressState): Mission | null {
  return state.daily.missions.find((mission) => mission.completedAt === null) ?? null;
}

/**
 * Gọi định kỳ khi người chơi đang ở văn phòng. Sếp giao việc mới khi: hết việc đang làm,
 * chưa đủ số việc trong ngày, và đã qua thời gian nghỉ. Trả về việc vừa giao (nếu có).
 */
export function tickBossMissions(
  input: ProgressState,
  ctx: ApplyContext & { playerId: string },
): { state: ProgressState; assigned: Mission | null } {
  let state = rollDay(input, ctx.today);
  const daily = state.daily;
  if (activeMission(state) || daily.missions.length >= BALANCE.missions.perDay) {
    return { state, assigned: null };
  }
  if (daily.nextMissionAt === null) {
    state = {
      ...state,
      daily: { ...daily, nextMissionAt: ctx.now + BALANCE.missions.firstDelayMs },
    };
    return { state, assigned: null };
  }
  if (ctx.now < daily.nextMissionAt) return { state, assigned: null };

  // Không giao việc đã giao hôm nay, hay việc hôm nay không còn làm được.
  const excluded = new Set(daily.missions.map((mission) => mission.templateId));
  if (daily.fortuneClaimed) excluded.add('fortune');
  if (state.checkIn.lastDay !== null && !(daysBetween(state.checkIn.lastDay, ctx.today) > 0)) {
    excluded.add('checkin');
  }
  const template = pickMission(ctx.today, ctx.playerId, daily.missions.length, excluded);
  if (!template) return { state, assigned: null };
  const mission = startMission(template, ctx.now);
  state = {
    ...state,
    daily: { ...daily, missions: [...daily.missions, mission], nextMissionAt: null },
  };
  return { state, assigned: mission };
}

export { MISSION_TEMPLATES };
