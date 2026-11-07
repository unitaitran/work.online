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
import type { ItemBuff, ItemBuffType } from './shop';
import type { CompanyPerk } from './companyShop';
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

export function sumBuffPercent(buffs: readonly ItemBuff[] | undefined, type: ItemBuffType): number {
  if (!buffs || buffs.length === 0) return 0;
  return buffs.reduce((sum, b) => (b.type === type && b.percent ? sum + b.percent : sum), 0);
}

export interface XpContext {
  department: Department | null;
  /** Chuỗi chấm công SAU khi chấm (chỉ dùng cho sự kiện checkin hợp lệ). */
  streak: number;
  /** Số lần đã được tính hôm nay theo loại giới hạn. */
  countToday(key: keyof typeof BALANCE.perDayLimits): number;
  fortuneClaimed: boolean;
  linesCarry: number;
  /** Danh sách buff từ trang bị đang dùng của người chơi. */
  itemBuffs?: readonly ItemBuff[] | undefined;
  /** Đặc quyền công ty (nếu đang ở phòng công ty). */
  companyPerks?: readonly CompanyPerk[] | undefined;
  /** Đang mặc đồng phục công ty (nếu có). */
  wearingUniform?: boolean | undefined;
}

export interface XpResult {
  xp: number;
  /** Dòng thư công sở còn dư sau khi quy đổi. */
  linesCarry: number;
  /** Các phần cộng lại (để ghi nhật ký / kiểm tra). `minutes`: số phút ngồi được tính (giới hạn ngày). */
  parts: { category: XpCategory; xp: number; minutes?: number }[];
}

/**
 * XP gốc (đã nhân ưu đãi phòng ban & trang bị, CHƯA áp giới hạn ngày) của một sự kiện.
 * Sự kiện checkin chỉ được gọi khi chấm công hợp lệ (status 'checked').
 */
export function xpFor(event: ActivityEvent, ctx: XpContext): XpResult {
  const parts: XpResult['parts'] = [];
  let linesCarry = ctx.linesCarry;
  const limits = BALANCE.perDayLimits;
  const add = (category: XpCategory, xp: number, minutes?: number): void => {
    if (xp > 0) {
      let finalXp = buffed(xp, category, ctx.department);
      if (ctx.wearingUniform && ctx.companyPerks?.includes('uniform')) {
        finalXp = Math.round(finalXp * 1.1);
      }
      parts.push({
        category,
        xp: finalXp,
        ...(minutes !== undefined ? { minutes } : {}),
      });
    }
  };

  switch (event.type) {
    case 'checkin': {
      const { base, perStreakDay, streakCap } = BALANCE.checkIn;
      const streakBuffPct = sumBuffPercent(ctx.itemBuffs, 'streak_bonus');
      const streakBonus = Math.round(
        perStreakDay * Math.min(Math.max(ctx.streak, 0), streakCap) * (1 + streakBuffPct / 100),
      );
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
        const focusBuffPct = sumBuffPercent(ctx.itemBuffs, 'focus_xp');
        const baseFocus = BALANCE.focus.completed[minutes] ?? 0;
        add('focus', Math.round(baseFocus * (1 + focusBuffPct / 100)));
      }
      // Dòng thư công sở: cộng dồn, mỗi đủ mốc thì quy ra XP.
      linesCarry += Math.max(0, Math.floor(lines));
      const chunks = Math.floor(linesCarry / BALANCE.lines.per);
      linesCarry -= chunks * BALANCE.lines.per;
      const linesBuffPct = sumBuffPercent(ctx.itemBuffs, 'lines_xp');
      add('lines', Math.round(chunks * BALANCE.lines.xp * (1 + linesBuffPct / 100)));
      break;
    }
    case 'task-flip':
      if (event.detail.completed && ctx.countToday('taskDone') < limits.taskDone) {
        const taskBuffPct = sumBuffPercent(ctx.itemBuffs, 'task_xp');
        add('task', Math.round(BALANCE.taskDone * (1 + taskBuffPct / 100)));
      }
      break;
    case 'coffee-gift':
      if (ctx.countToday('coffeeGift') < limits.coffeeGift) {
        const coffeeBuffPct = sumBuffPercent(ctx.itemBuffs, 'coffee_xp');
        add('coffeeGift', Math.round(BALANCE.coffeeGift * (1 + coffeeBuffPct / 100)));
      }
      break;
    case 'chore':
      if (ctx.countToday('chore') < limits.chore) {
        const choreBuffPct = sumBuffPercent(ctx.itemBuffs, 'chore_xp');
        add('chore', Math.round(BALANCE.chore * (1 + choreBuffPct / 100)));
      }
      break;
    case 'kpi-fortune':
      if (!event.detail.repeat && !ctx.fortuneClaimed) add('fortune', BALANCE.fortune);
      break;
    case 'company-promotion':
      if (ctx.countToday('companyPromotion') < limits.companyPromotion) {
        add('event', BALANCE.companyPromotion);
      }
      break;
    case 'company-project':
      if (ctx.countToday('companyProject') < limits.companyProject) {
        const d = Math.max(1, Math.min(5, Math.round(event.detail.difficulty)));
        add('event', BALANCE.companyProject.base + BALANCE.companyProject.perDifficulty * d);
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
      const idleBuffPct = meeting
        ? 0
        : sumBuffPercent(ctx.itemBuffs, 'idle_xp') +
          (ctx.companyPerks?.includes('massage') ? 15 : 0);
      const baseRate = BALANCE.work[event.detail.kind];
      const tickXp = Math.round(minutes * baseRate * (1 + idleBuffPct / 100));
      add(meeting ? 'meeting' : 'focus', tickXp, minutes);
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
  /** Danh sách buff từ trang bị đang mặc (nếu có). */
  itemBuffs?: readonly ItemBuff[] | undefined;
  /** Đặc quyền công ty (nếu đang ở phòng công ty). */
  companyPerks?: readonly CompanyPerk[] | undefined;
  /** Đang mặc đồng phục công ty (nếu có). */
  wearingUniform?: boolean | undefined;
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
    itemBuffs: ctx.itemBuffs,
    companyPerks: ctx.companyPerks,
    wearingUniform: ctx.wearingUniform,
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
            : event.type === 'company-project'
              ? 'companyProject'
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
  const repBuff =
    ctx.itemBuffs?.reduce(
      (sum, b) => (b.type === 'reputation' && b.flat ? sum + b.flat : sum),
      0,
    ) ?? 0;

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

  let stamina = state.stamina ?? {
    current: BALANCE.stamina.baseMax,
    max: BALANCE.stamina.baseMax,
    updatedAt: ctx.now,
    exhausted: false,
  };
  if (event.type === 'coffee-drink') {
    stamina = boostStamina(stamina, BALANCE.stamina.drinkBoost, ctx.now);
  } else if (event.type === 'work-tick' || event.type === 'focus-typing') {
    stamina = updateStamina(stamina, ctx.now, 'desk', ctx.companyPerks);
  }

  // Kiệt sức do làm việc liên tục quá 30 phút mà chưa nghỉ: không nhận thêm XP làm việc
  const isWorkEvent = event.type === 'work-tick' || event.type === 'focus-typing';
  const base = xp.xp + missionXp;
  const effectiveBase = stamina.exhausted && isWorkEvent ? missionXp : base;
  const granted = applyDailyCap(state.daily.earned, effectiveBase);
  // Nhật ký tách phần của hoạt động và phần thưởng việc sếp giao.
  const effectiveXp = stamina.exhausted && isWorkEvent ? 0 : xp.xp;
  const grantedEvent = applyDailyCap(state.daily.earned, effectiveXp);
  const log: LogEntry[] = [...state.log];
  if (effectiveXp > 0)
    log.push({ at: ctx.now, source: event.type, xp: grantedEvent, base: effectiveXp });
  if (missionXp > 0) {
    log.push({ at: ctx.now, source: 'mission', xp: granted - grantedEvent, base: missionXp });
  }

  // Xu: một phần XP thực nhận + thưởng việc sếp giao. XP uống trà sữa không sinh xu
  // (cốc trà sữa thật sự tốn 5 xu, chỉ được XP).
  const noCoins = event.type === 'milk-tea' || event.type === 'company-project';
  const coinXp = noCoins ? granted - grantedEvent : granted;
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
    reputation: state.reputation + (helped ? BALANCE.reputationPerHelp + repBuff : 0),
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
    stamina,
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
  const npcMissions = daily.missions.filter((mission) => mission.fromCeo !== true).length;
  if (activeMission(state) || npcMissions >= BALANCE.missions.perDay) {
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

// ---------------------------------------------------------------------------
// Thể lực (Stamina) - Giới hạn 30 phút làm việc liên tiếp
// ---------------------------------------------------------------------------

export type RestActivity = 'none' | 'desk' | 'window' | 'sofa' | 'massage' | 'console' | 'walking';

export function updateStamina(
  currentStamina: {
    current: number;
    max: number;
    updatedAt: number;
    exhausted?: boolean | undefined;
  },
  now: number,
  activity: RestActivity,
  companyPerks: readonly string[] = [],
): { current: number; max: number; updatedAt: number; exhausted: boolean } {
  const elapsedSeconds = Math.max(0, (now - currentStamina.updatedAt) / 1000);
  if (elapsedSeconds <= 0) {
    return {
      current: currentStamina.current,
      max: currentStamina.max,
      updatedAt: currentStamina.updatedAt,
      exhausted: currentStamina.exhausted ?? currentStamina.current <= 0,
    };
  }

  const hasUniform = companyPerks.includes('uniform');
  const targetMax = BALANCE.stamina.baseMax + (hasUniform ? 20 : 0);
  const max = Math.max(targetMax, currentStamina.max);

  let current = currentStamina.current;
  let exhausted = currentStamina.exhausted ?? current <= 0;

  if (activity === 'desk') {
    // Nếu thời gian trôi qua lớn (nghỉ ngơi > 5 phút, offline hoặc qua ngày mới), thể lực tự hồi đầy
    if (elapsedSeconds >= 300) {
      current = max;
      exhausted = false;
    } else {
      const hasDecor = companyPerks.includes('deskDecor');
      const drainMultiplier = hasDecor ? 0.8 : 1.0;
      const drain = elapsedSeconds * BALANCE.stamina.drainPerSecond * drainMultiplier;
      current = Math.max(0, current - drain);
      if (current <= 0) exhausted = true;
    }
  } else {
    let regenRate = BALANCE.stamina.passiveRegenPerSecond;
    if (activity === 'massage' || (activity === 'sofa' && companyPerks.includes('massage'))) {
      regenRate = BALANCE.stamina.massageRegenPerSecond;
    } else if (
      activity === 'console' ||
      (activity === 'sofa' && companyPerks.includes('console'))
    ) {
      regenRate = BALANCE.stamina.consoleRegenPerSecond;
    } else if (activity === 'sofa') {
      regenRate = BALANCE.stamina.breakroomRegenPerSecond;
    } else if (activity === 'window') {
      regenRate = BALANCE.stamina.windowRegenPerSecond;
    }
    const regen = elapsedSeconds * regenRate;
    current = Math.min(max, current + regen);
    if (current >= BALANCE.stamina.exhaustedThreshold) exhausted = false;
  }

  return {
    current: Math.round(current * 10) / 10,
    max,
    updatedAt: now,
    exhausted,
  };
}

export function boostStamina(
  stamina: { current: number; max: number; updatedAt: number; exhausted?: boolean | undefined },
  amount: number,
  now: number,
): { current: number; max: number; updatedAt: number; exhausted: boolean } {
  const current = Math.min(stamina.max, stamina.current + amount);
  return {
    current: Math.round(current * 10) / 10,
    max: stamina.max,
    updatedAt: now,
    exhausted: current < BALANCE.stamina.exhaustedThreshold ? (stamina.exhausted ?? false) : false,
  };
}
