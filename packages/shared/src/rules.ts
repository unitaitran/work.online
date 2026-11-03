// Luật XP: hàm thuần, dùng chung client (Phase 3) và server (Phase 4).
// Không tin số liệu trong sự kiện khi tự tính được (chuỗi chấm công, thời lượng...).
import type { ActivityEvent } from './activityEvents';
import { BALANCE } from './balance';
import { levelFor, titleForLevel, type Department } from './levels';
import {
  CEO_MEETING_MISSION,
  MISSION_TEMPLATES,
  pickMission,
  progressMission,
  startMission,
  type Mission,
} from './missions';
import {
  EMPTY_DAILY_STATS,
  emptyDaily,
  type CheckInState,
  type LogEntry,
  type ProgressState,
} from './progress';
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
  | 'event'
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
  /** Dòng thư công sở còn dư sau khi quy đổi. */
  linesCarry: number;
  /** Các phần cộng lại (để ghi nhật ký / kiểm tra). `minutes`: số phút ngồi được tính (giới hạn ngày). */
  parts: { category: XpCategory; xp: number; minutes?: number }[];
}

/**
 * XP gốc (đã nhân ưu đãi phòng ban, CHƯA áp giới hạn ngày) của một sự kiện.
 * Sự kiện checkin chỉ được gọi khi chấm công hợp lệ (status 'checked').
 */
export function xpFor(event: ActivityEvent, ctx: XpContext): XpResult {
  const parts: XpResult['parts'] = [];
  let linesCarry = ctx.linesCarry;
  const limits = BALANCE.perDayLimits;
  const add = (category: XpCategory, xp: number, minutes?: number): void => {
    if (xp > 0) {
      parts.push({
        category,
        xp: buffed(xp, category, ctx.department),
        ...(minutes !== undefined ? { minutes } : {}),
      });
    }
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
      // XP theo phút đã nhỏ giọt trong lúc ngồi (work-tick); hết phiên trọn vẹn thì thêm thưởng.
      const { plannedMs, completed, lines } = event.detail;
      const minutes = Math.round(plannedMs / 60_000);
      if (completed && event.durationMs >= plannedMs) {
        add('focus', BALANCE.focus.completed[minutes] ?? 0);
      }
      // Dòng thư công sở: cộng dồn, mỗi đủ mốc thì quy ra XP.
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
    case 'company-promotion':
      if (ctx.countToday('companyPromotion') < limits.companyPromotion) {
        add('event', BALANCE.companyPromotion);
      }
      break;
    case 'room-event':
      if (ctx.countToday('roomEvent') < limits.roomEvent) add('event', BALANCE.roomEvent);
      break;
    case 'milk-tea':
      if (ctx.countToday('milkTea') < limits.milkTea) add('event', BALANCE.milkTea);
      break;
    case 'work-tick': {
      // Mỗi phút trọn đang ngồi máy / họp (server đo), trong giới hạn phút mỗi ngày.
      const meeting = event.detail.kind === 'meeting';
      const used = ctx.countToday(meeting ? 'meetingMinutes' : 'deskMinutes');
      const limit = meeting ? limits.meetingMinutes : limits.deskMinutes;
      const minutes = Math.min(
        Math.max(0, Math.floor(event.detail.minutes)),
        Math.max(0, limit - used),
      );
      add(meeting ? 'meeting' : 'focus', minutes * BALANCE.work[event.detail.kind], minutes);
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
  /** Chức danh trước và sau (tự lên theo cấp). */
  titleBefore: number;
  titleAfter: number;
  /** Xu nhận được. */
  coins: number;
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
  const titleBefore = titleForLevel(levelBefore);
  let checkInStatus: CheckInStatus | null = null;
  let counts = state.daily.counts;

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
        titleBefore,
        titleAfter: titleBefore,
        coins: 0,
        checkIn: 'already',
        completedMission: null,
      };
    }
    state = { ...state, checkIn: result.state };
  }

  const xp = xpFor(event, {
    department: state.department,
    streak: state.checkIn.streak,
    countToday: (key) => counts[key] ?? 0,
    fortuneClaimed: state.daily.fortuneClaimed,
    linesCarry: state.linesCarry,
  });

  // Đếm số lần đã tính (chỉ khi thật sự được XP).
  let fortuneClaimed = state.daily.fortuneClaimed;
  for (const part of xp.parts) {
    if (part.category === 'task') counts = bump(counts, 'taskDone');
    if (part.category === 'coffeeGift') counts = bump(counts, 'coffeeGift');
    if (part.category === 'chore') counts = bump(counts, 'chore');
    if (part.category === 'fortune') fortuneClaimed = true;
    if (part.category === 'event') {
      counts = bump(
        counts,
        event.type === 'company-promotion'
          ? 'companyPromotion'
          : event.type === 'milk-tea'
            ? 'milkTea'
            : 'roomEvent',
      );
    }
    if (part.minutes !== undefined) {
      counts = bump(
        counts,
        part.category === 'meeting' ? 'meetingMinutes' : 'deskMinutes',
        part.minutes,
      );
    }
  }
  // Uy tín: mỗi lần giúp đồng nghiệp được tính.
  const helped = xp.parts.some(
    (part) => part.category === 'coffeeGift' || part.category === 'chore',
  );

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

  // Xu: một phần XP thực nhận + thưởng việc sếp giao. XP uống trà sữa không sinh xu
  // (cốc trà sữa thật sự tốn 5 xu, chỉ được XP).
  const coinXp = event.type === 'milk-tea' ? granted - grantedEvent : granted;
  const coins =
    Math.floor(coinXp * BALANCE.coins.perXp) + (missionXp > 0 ? BALANCE.coins.missionBonus : 0);

  // Số liệu trong ngày cho thẻ khoe thành tích.
  const stats = { ...(state.daily.stats ?? EMPTY_DAILY_STATS) };
  if (event.type === 'focus-typing') stats.keys += event.detail.scoredKeys;
  if (event.type === 'coffee-gift' || event.type === 'coffee-drink') stats.coffees += 1;
  if (event.type === 'meeting' && event.durationMs >= 60_000) stats.meetings += 1;
  if (event.type === 'room-event' && event.detail.kind === 'boss_walk') stats.dodged += 1;

  state = {
    ...state,
    xp: state.xp + granted,
    coins: state.coins + coins,
    reputation: state.reputation + (helped ? BALANCE.reputationPerHelp : 0),
    linesCarry: xp.linesCarry,
    daily: {
      ...state.daily,
      earned: state.daily.earned + granted,
      counts,
      fortuneClaimed,
      missions,
      nextMissionAt,
      stats,
    },
    log: log.slice(-BALANCE.log.maxEntries),
  };

  return {
    state,
    granted,
    base,
    levelBefore,
    levelAfter: levelFor(state.xp),
    titleBefore,
    titleAfter: titleForLevel(levelFor(state.xp)),
    coins,
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

/** Đang có việc "Họp với sếp" chưa xong: được vào phòng sếp (cả ở văn phòng chung). */
export function hasCeoMeeting(state: ProgressState): boolean {
  return activeMission(state)?.templateId === CEO_MEETING_MISSION;
}
