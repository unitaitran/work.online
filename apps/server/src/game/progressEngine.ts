// Tính điểm ở server (Phase 4C). Client chỉ gửi hành động; server tự đo giờ (phiên tập trung,
// họp, pha cà phê), kiểm tra vị trí, chống gửi trùng/gửi quá nhanh, rồi áp đúng luật trong
// packages/shared/rules.ts. Không bao giờ tin số liệu XP, thời lượng hay chuỗi từ client.
import {
  applyEvent,
  BALANCE,
  rollDay,
  chooseBranch,
  chooseDepartment,
  COFFEE_BREW_MS,
  dayKey,
  fortuneIndex,
  makeEvent,
  MAX_KEYS_PER_SECOND,
  needsBranch,
  needsDepartment,
  OFFICE_FLOOR,
  officeInteractables,
  tickBossMissions,
  USE_DISTANCE,
  type Action,
  type ActionKind,
  type ActionOutcome,
  type ActionRejectReason,
  type ActivityEvent,
  type Interactable,
  type Mission,
  type ProgressState,
  type Vec2,
  type CareerUnlock,
  TASKS_HELD_MAX,
  taskWaitMs,
} from '@dilam/shared';
import type { Repositories } from '../db/repositories';
import { recordEarn } from './shop';

/** Ngày trong game bắt đầu lúc 4 giờ sáng giờ địa phương (chấm công, giới hạn, việc sếp giao). */
export const DAY_START_HOUR = 4;
const DAY_MS = 86_400_000;

/** Khoảng cách tối thiểu giữa hai hành động cùng loại (ms). */
const MIN_INTERVAL: Partial<Record<ActionKind, number>> = {
  checkin: 1000,
  fortune: 1000,
  task_accept: 500,
  task_done: 1500,
  task_drop: 500,
  chore: 2000,
  coffee_gift: 1500,
  coffee_brew: 1000,
  print: 2000,
  vent: 5000,
};
const DEFAULT_INTERVAL = 300;
/** Làm lại công quả ở cùng một chỗ sau chừng này (ms). */
const CHORE_COOLDOWN_MS = 5 * 60_000;
/** Sai số cho phép khi đo phiên tập trung kết thúc đúng giờ (trễ mạng). */
const FOCUS_TOLERANCE_MS = 2000;
/** Sai số cho phép khi xác nhận task đúng lúc hết thời gian làm tối thiểu. */
const TASK_TOLERANCE_MS = 1500;

export interface PlayerContext {
  userId: string;
  playerCode: string;
  timeZone: string;
  /** Vị trí hiện tại theo server (null nếu không ở phòng nào). */
  position(): Vec2 | null;
  /** Phòng đang có sự kiện "hết cà phê" (máy pha tạm nghỉ). */
  coffeeOut?(): boolean;
  /** Mốc chọn phòng ban / nhánh theo nơi làm (không có: mức chung). */
  careerUnlock?(): CareerUnlock | undefined;
  /** Vị trí của người chơi khác cùng phòng theo mã nhân viên (null nếu không có). */
  colleagueAt?(code: string): Vec2 | null;
}

/** Tặng cà phê cho người chơi khác: phải đứng gần (m, theo vị trí server). */
const PLAYER_GIFT_RANGE = 3;
export const PLAYER_GIFT_PREFIX = 'player:';

interface LiveState {
  focus: { minutes: number; startedAt: number } | null;
  meeting: { seatId: string; startedAt: number } | null;
  coffeeBrewAt: number | null;
  /** Thời gian ngồi máy / họp đã tích luỹ chưa đủ một phút (ms). */
  workMs: number;
  lastAt: Map<ActionKind, number>;
  chores: Map<string, number>;
}

export type HandleResult =
  | { ok: true; state: ProgressState; outcome: ActionOutcome | null; today: string }
  | { ok: false; reason: ActionRejectReason };

const ITEMS: ReadonlyMap<string, Interactable> = new Map(
  officeInteractables(OFFICE_FLOOR).map((item) => [item.id, item]),
);

export class ProgressEngine {
  private readonly live = new Map<string, LiveState>();
  /** Công cụ dev: tua đồng hồ riêng cho từng người (chỉ bật khi DEV_TOOLS). */
  private readonly devOffset = new Map<string, number>();

  constructor(
    private readonly repos: Repositories,
    private readonly clock: () => number,
  ) {}

  now(userId: string): number {
    return this.clock() + (this.devOffset.get(userId) ?? 0);
  }

  /** Ngày trong game theo múi giờ người chơi (đổi ngày lúc 4 giờ sáng). */
  today(userId: string, timeZone: string): string {
    return dayKey(new Date(this.now(userId) - DAY_START_HOUR * 3_600_000), timeZone);
  }

  shiftDays(userId: string, days: number): void {
    this.devOffset.set(userId, (this.devOffset.get(userId) ?? 0) + days * DAY_MS);
  }

  state(userId: string): ProgressState {
    const record = this.repos.progress.get(userId);
    if (!record) throw new Error('missing progress');
    return record.state;
  }

  /** Lưu trạng thái do công cụ khác sửa (cửa hàng, công ty, dev). */
  save(userId: string, state: ProgressState): void {
    this.repos.progress.save(userId, state, this.clock());
  }

  forget(userId: string): void {
    this.live.delete(userId);
  }

  private liveOf(userId: string): LiveState {
    let live = this.live.get(userId);
    if (!live) {
      live = {
        focus: null,
        meeting: null,
        coffeeBrewAt: null,
        workMs: 0,
        lastAt: new Map(),
        chores: new Map(),
      };
      this.live.set(userId, live);
    }
    return live;
  }

  handle(player: PlayerContext, actionId: string, action: Action): HandleResult {
    const { userId } = player;
    const now = this.now(userId);
    const live = this.liveOf(userId);

    const last = live.lastAt.get(action.kind);
    if (last !== undefined && now - last < (MIN_INTERVAL[action.kind] ?? DEFAULT_INTERVAL)) {
      return { ok: false, reason: 'too_fast' };
    }
    if (!this.repos.actions.claim(userId, actionId, this.clock())) {
      return { ok: false, reason: 'duplicate' };
    }

    const today = this.today(userId, player.timeZone);
    const state = this.state(userId);
    const near = (id: string, distance = USE_DISTANCE): boolean => {
      const item = ITEMS.get(id);
      const p = player.position();
      if (!item || !p) return false;
      return Math.hypot(item.approach.x - p.x, item.approach.z - p.z) <= distance;
    };

    let event: ActivityEvent | null = null;
    let fortune: ActionOutcome['fortune'];
    switch (action.kind) {
      case 'checkin':
        if (!near('gate')) return { ok: false, reason: 'too_far' };
        event = makeEvent('checkin', now, 0, { day: today, streak: 0, total: 0 });
        break;
      case 'fortune': {
        if (!near('fortune')) return { ok: false, reason: 'too_far' };
        const id = fortuneIndex(today, player.playerCode);
        const repeat = state.daily.day === today && state.daily.fortuneClaimed;
        fortune = { id, repeat };
        event = makeEvent('kpi-fortune', now, 0, { day: today, fortuneId: id, repeat });
        break;
      }
      case 'task_accept': {
        if (!near('taskboard')) return { ok: false, reason: 'too_far' };
        const held = state.tasks ?? [];
        if (held.length >= TASKS_HELD_MAX || held.some((t) => t.taskId === action.taskId)) {
          return { ok: false, reason: 'not_allowed' };
        }
        const next = { ...state, tasks: [...held, { taskId: action.taskId, acceptedAt: now }] };
        this.save(userId, next);
        live.lastAt.set(action.kind, now);
        return { ok: true, state: next, outcome: null, today };
      }
      case 'task_drop': {
        const held = state.tasks ?? [];
        if (!held.some((t) => t.taskId === action.taskId)) return { ok: false, reason: 'invalid' };
        const next = { ...state, tasks: held.filter((t) => t.taskId !== action.taskId) };
        this.save(userId, next);
        live.lastAt.set(action.kind, now);
        return { ok: true, state: next, outcome: null, today };
      }
      case 'task_done': {
        // Xác nhận ở bảng task, sau khi đã đi làm đủ thời gian tối thiểu.
        if (!near('taskboard')) return { ok: false, reason: 'too_far' };
        const held = state.tasks ?? [];
        const task = held.find((t) => t.taskId === action.taskId);
        if (!task) return { ok: false, reason: 'invalid' };
        if (taskWaitMs(task, now) > TASK_TOLERANCE_MS) return { ok: false, reason: 'not_started' };
        live.lastAt.set(action.kind, now);
        const without = { ...state, tasks: held.filter((t) => t.taskId !== action.taskId) };
        event = makeEvent('task-flip', task.acceptedAt, now - task.acceptedAt, {
          taskId: task.taskId,
          completed: true,
        });
        return {
          ok: true,
          ...this.applyAndSave(userId, without, event, today, now, fortune),
          today,
        };
      }
      case 'coffee_brew':
        if (!near('coffee')) return { ok: false, reason: 'too_far' };
        if (live.coffeeBrewAt !== null || player.coffeeOut?.()) {
          return { ok: false, reason: 'not_allowed' };
        }
        live.coffeeBrewAt = now;
        break;
      case 'coffee_gift':
      case 'coffee_drink': {
        if (action.kind === 'coffee_gift' && action.npcId.startsWith(PLAYER_GIFT_PREFIX)) {
          const code = action.npcId.slice(PLAYER_GIFT_PREFIX.length);
          const mine = player.position();
          const theirs = code === player.playerCode ? null : (player.colleagueAt?.(code) ?? null);
          if (!mine || !theirs) return { ok: false, reason: 'not_allowed' };
          if (Math.hypot(mine.x - theirs.x, mine.z - theirs.z) > PLAYER_GIFT_RANGE) {
            return { ok: false, reason: 'too_far' };
          }
        }
        const brewAt = live.coffeeBrewAt;
        if (brewAt === null || now - brewAt < COFFEE_BREW_MS - 300) {
          return { ok: false, reason: 'not_started' };
        }
        live.coffeeBrewAt = null;
        event =
          action.kind === 'coffee_gift'
            ? makeEvent('coffee-gift', now, 0, { npcId: action.npcId })
            : makeEvent('coffee-drink', now, 0, {});
        break;
      }
      case 'chore': {
        // Công quả: tưới cây, lau bàn, dọn pantry (tủ lạnh), gỡ kẹt máy in.
        const target = action.target;
        const valid =
          target.startsWith('plant-') ||
          target.startsWith('desk-') ||
          target === 'fridge' ||
          target === 'printer';
        if (!valid || !near(target)) return { ok: false, reason: 'too_far' };
        // Cùng một chỗ chỉ làm lại sau CHORE_COOLDOWN_MS.
        const lastChore = live.chores.get(target);
        if (lastChore !== undefined && now - lastChore < CHORE_COOLDOWN_MS) {
          return { ok: false, reason: 'too_fast' };
        }
        live.chores.set(target, now);
        event = makeEvent('chore', now, 0, { target });
        break;
      }
      case 'print':
        if (!near('printer')) return { ok: false, reason: 'too_far' };
        event = makeEvent('print', now, 0, {});
        break;
      case 'meeting_start':
        if (!action.seatId.startsWith('meeting-') || !near(action.seatId, 1.5)) {
          return { ok: false, reason: 'too_far' };
        }
        live.meeting = { seatId: action.seatId, startedAt: now };
        break;
      case 'meeting_end': {
        const meeting = live.meeting;
        if (!meeting) return { ok: false, reason: 'not_started' };
        live.meeting = null;
        event = makeEvent('meeting', meeting.startedAt, now - meeting.startedAt, {
          seatId: meeting.seatId,
        });
        break;
      }
      case 'focus_start': {
        const atDesk = [...ITEMS.values()].some(
          (item) => item.kind === 'desk' && near(item.id, 1.5),
        );
        if (!atDesk) return { ok: false, reason: 'too_far' };
        live.focus = { minutes: action.minutes, startedAt: now };
        break;
      }
      case 'focus_end': {
        const focus = live.focus;
        if (!focus) return { ok: false, reason: 'not_started' };
        live.focus = null;
        const plannedMs = focus.minutes * 60_000;
        const elapsed = now - focus.startedAt;
        const completed = elapsed >= plannedMs - FOCUS_TOLERANCE_MS;
        const durationMs = completed ? plannedMs : elapsed;
        // Số phím/dòng không vượt quá mức gõ người thật làm được trong thời gian đã đo.
        const maxKeys = Math.floor((durationMs / 1000) * MAX_KEYS_PER_SECOND);
        const scoredKeys = Math.min(action.scoredKeys, action.presses, maxKeys);
        event = makeEvent('focus-typing', focus.startedAt, durationMs, {
          plannedMs,
          presses: Math.min(action.presses, maxKeys * 3),
          scoredKeys,
          lines: Math.min(action.lines, scoredKeys),
          completed,
        });
        break;
      }
      case 'vent':
        event = makeEvent('vent', now, 0, { length: action.length, anonymous: action.anonymous });
        break;
      case 'choose_department': {
        const unlock = player.careerUnlock?.();
        if (!needsDepartment(state, unlock)) return { ok: false, reason: 'not_allowed' };
        const next = chooseDepartment(state, action.department, unlock);
        this.save(userId, next);
        live.lastAt.set(action.kind, now);
        return { ok: true, state: next, outcome: null, today };
      }
      case 'choose_branch': {
        const unlock = player.careerUnlock?.();
        if (!needsBranch(state, unlock)) return { ok: false, reason: 'not_allowed' };
        const next = chooseBranch(state, action.branch, unlock);
        this.save(userId, next);
        live.lastAt.set(action.kind, now);
        return { ok: true, state: next, outcome: null, today };
      }
    }

    // Chỉ hành động hợp lệ mới tính vào khoảng nghỉ (tin sai bị chặn bởi giới hạn tần suất WS).
    live.lastAt.set(action.kind, now);
    if (!event) return { ok: true, state, outcome: null, today };
    return { ok: true, ...this.applyAndSave(userId, state, event, today, now, fortune), today };
  }

  /**
   * Cộng dồn thời gian đang ngồi máy (`desk`, hoặc `focus` nếu đang phiên tập trung) hoặc ngồi họp.
   * Đủ mỗi phút trọn thì áp sự kiện work-tick qua luật XP (có giới hạn phút mỗi ngày).
   * Không ngồi thì xoá phần lẻ.
   */
  accrueWork(
    player: PlayerContext,
    seat: 'desk' | 'meeting' | 'ceoMeeting' | null,
    ms: number,
  ): { state: ProgressState; outcome: ActionOutcome; today: string } | null {
    const live = this.liveOf(player.userId);
    if (!seat) {
      live.workMs = 0;
      return null;
    }
    live.workMs += ms;
    const minutes = Math.floor(live.workMs / 60_000);
    if (minutes < 1) return null;
    live.workMs -= minutes * 60_000;
    const kind = seat === 'desk' ? (live.focus ? 'focus' : 'desk') : 'meeting';
    const now = this.now(player.userId);
    const today = this.today(player.userId, player.timeZone);
    const event = makeEvent('work-tick', now, minutes * 60_000, {
      kind,
      minutes,
      ...(seat === 'ceoMeeting' ? { ceo: true } : {}),
    });
    const result = this.applyAndSave(player.userId, this.state(player.userId), event, today, now);
    return { ...result, today };
  }

  /** Áp một sự kiện do server tạo (thăng chức trong công ty...) qua đúng luật XP. */
  grant(userId: string, event: ActivityEvent): ActionOutcome {
    const timeZone = this.repos.users.byId(userId)?.timeZone ?? 'Asia/Ho_Chi_Minh';
    const now = this.now(userId);
    const today = this.today(userId, timeZone);
    return this.applyAndSave(userId, this.state(userId), event, today, now).outcome;
  }

  /** Giao một việc (chủ công ty giao): chỉ khi chưa có việc dở và chưa đủ số việc trong ngày. */
  assignMission(userId: string, mission: Mission): boolean {
    const timeZone = this.repos.users.byId(userId)?.timeZone ?? 'Asia/Ho_Chi_Minh';
    const state = rollDay(this.state(userId), this.today(userId, timeZone));
    const daily = state.daily;
    if (daily.missions.some((m) => m.completedAt === null)) return false;
    if (daily.missions.length >= BALANCE.missions.perDay) return false;
    this.save(userId, { ...state, daily: { ...daily, missions: [...daily.missions, mission] } });
    return true;
  }

  /** Thưởng tham gia sự kiện phòng (qua đúng luật XP, giới hạn ngày và sổ cái). */
  grantRoomEvent(player: PlayerContext, kind: string): ActionOutcome {
    const now = this.now(player.userId);
    const today = this.today(player.userId, player.timeZone);
    const event = makeEvent('room-event', now, 0, { kind });
    return this.applyAndSave(player.userId, this.state(player.userId), event, today, now).outcome;
  }

  /** Uống trà sữa khi được rủ (tự trả xu ở MilkTeaService): XP theo luật chung. */
  grantMilkTea(player: PlayerContext): ActionOutcome {
    const now = this.now(player.userId);
    const today = this.today(player.userId, player.timeZone);
    const event = makeEvent('milk-tea', now, 0, {});
    return this.applyAndSave(player.userId, this.state(player.userId), event, today, now).outcome;
  }

  private applyAndSave(
    userId: string,
    state: ProgressState,
    event: ActivityEvent,
    today: string,
    now: number,
    fortune?: ActionOutcome['fortune'],
  ): { state: ProgressState; outcome: ActionOutcome } {
    const result = applyEvent(state, event, { today, now });
    this.repos.transaction(() => {
      this.save(userId, result.state);
      recordEarn(
        this.repos,
        userId,
        this.clock(),
        result.coins,
        `earn:${event.type}`,
        result.state.coins,
      );
      if (result.granted > 0 || result.coins > 0) {
        this.repos.activity.add({
          userId,
          at: this.clock(),
          kind: event.type,
          xp: result.granted,
          coins: result.coins,
        });
      }
    });
    const outcome: ActionOutcome = {
      granted: result.granted,
      base: result.base,
      coins: result.coins,
      levelBefore: result.levelBefore,
      levelAfter: result.levelAfter,
      titleBefore: result.titleBefore,
      titleAfter: result.titleAfter,
      checkIn: result.checkIn,
      completedMission: result.completedMission,
      ...(fortune ? { fortune } : {}),
    };
    return { state: result.state, outcome };
  }

  /** Sếp giao việc (gọi định kỳ cho người đang online). */
  tickMissions(player: PlayerContext): { state: ProgressState; assigned: Mission | null } | null {
    const before = this.state(player.userId);
    const { state, assigned } = tickBossMissions(before, {
      today: this.today(player.userId, player.timeZone),
      now: this.now(player.userId),
      playerId: player.playerCode,
    });
    if (state === before) return null;
    this.save(player.userId, state);
    return { state, assigned };
  }
}
