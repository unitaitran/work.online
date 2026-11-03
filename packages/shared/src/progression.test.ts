import { describe, expect, it } from 'vitest';
import { makeEvent, type ActivityEvent } from './activityEvents';
import { BALANCE } from './balance';
import { canOpenCompany, leaveCompany, buildingHasRoom } from './company';
import {
  levelFor,
  levelProgress,
  MAX_LEVEL,
  titleFor,
  titleForLevel,
  titleMinLevel,
  titleName,
  TITLE_COUNT,
  XP_TABLE,
  xpForLevel,
} from './levels';
import { MISSION_TEMPLATES } from './missions';
import { createProgress, migrateProgress, PROGRESS_VERSION, type ProgressState } from './progress';
import { chooseBranch, chooseDepartment, needsBranch, needsDepartment } from './career';
import {
  activeMission,
  applyDailyCap,
  applyEvent,
  checkInOnDay,
  tickBossMissions,
  xpFor,
  type XpContext,
} from './rules';
import { crc32, decodeSaveCode, encodeSaveCode } from './saveCode';
import { addDays, dayKey } from './time';

const T0 = Date.UTC(2026, 10, 2, 2, 0, 0); // 09:00 ngày 2/11 giờ VN
const DAY = '2026-11-02';

function ctx(partial: Partial<XpContext> = {}): XpContext {
  return {
    department: null,
    streak: 1,
    countToday: () => 0,
    fortuneClaimed: false,
    linesCarry: 0,
    ...partial,
  };
}

const focus = (minutes: number, completed: boolean, lines = 0, actualMs?: number): ActivityEvent =>
  makeEvent('focus-typing', T0, actualMs ?? (completed ? minutes * 60_000 : 30_000), {
    plannedMs: minutes * 60_000,
    presses: lines,
    scoredKeys: lines,
    lines,
    completed,
  });
const tick = (kind: 'desk' | 'focus' | 'meeting', minutes: number): ActivityEvent =>
  makeEvent('work-tick', T0, minutes * 60_000, { kind, minutes });
const checkin = (at = T0): ActivityEvent =>
  makeEvent('checkin', at, 0, { day: DAY, streak: 99, total: 99 });
const gift = (): ActivityEvent => makeEvent('coffee-gift', T0, 0, { npcId: 'npc-0' });
const chore = (): ActivityEvent => makeEvent('chore', T0, 0, { target: 'plant-0' });
const meeting = (minutes: number): ActivityEvent =>
  makeEvent('meeting', T0, minutes * 60_000, { seatId: 'meeting-0' });

/** Áp một loạt sự kiện trong cùng ngày. */
function applyAll(
  state: ProgressState,
  events: ActivityEvent[],
  today = DAY,
  now = T0,
): ProgressState {
  return events.reduce((s, e) => applyEvent(s, e, { today, now }).state, state);
}

// ---------------------------------------------------------------------------

describe('cấp độ 1–500', () => {
  it('bảng XP tăng nghiêm ngặt, cấp 1 = 0 XP', () => {
    expect(XP_TABLE).toHaveLength(MAX_LEVEL + 1);
    expect(xpForLevel(1)).toBe(0);
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      expect(xpForLevel(level)).toBeGreaterThan(xpForLevel(level - 1));
    }
  });

  it('đúng mốc XP: vừa đủ thì lên, thiếu 1 thì chưa', () => {
    for (const level of [2, 3, 10, 149, 150, 151, 300, 499, 500]) {
      expect(levelFor(xpForLevel(level))).toBe(level);
      expect(levelFor(xpForLevel(level) - 1)).toBe(level - 1);
    }
    expect(levelFor(0)).toBe(1);
    expect(levelFor(-5)).toBe(1);
    expect(levelFor(Number.NaN)).toBe(1);
    expect(levelFor(10 ** 9)).toBe(MAX_LEVEL);
  });

  it('cấp mở công ty = đúng số ngày chơi đều ở mức giới hạn', () => {
    const { daysToCompany, daysToMax } = BALANCE.levels;
    expect(xpForLevel(BALANCE.company.unlockLevel)).toBe(BALANCE.dailySoftCap * daysToCompany);
    expect(xpForLevel(MAX_LEVEL)).toBe(BALANCE.dailySoftCap * daysToMax);
    // Chơi 4 ngày ở mức giới hạn thì chưa tới cấp 150.
    expect(levelFor(BALANCE.dailySoftCap * (daysToCompany - 1))).toBeLessThan(
      BALANCE.company.unlockLevel,
    );
  });

  it('levelProgress: phần trăm trong cấp, cấp tối đa', () => {
    const p = levelProgress(xpForLevel(20) + 1);
    expect(p.level).toBe(20);
    expect(p.into).toBe(1);
    expect(p.needed).toBe(xpForLevel(21) - xpForLevel(20));
    expect(levelProgress(xpForLevel(MAX_LEVEL)).isMax).toBe(true);
  });

  it('chức danh: 6 bậc chung, từ bậc 7 khác theo nhánh, bậc cuối là Senior', () => {
    expect(TITLE_COUNT).toBe(13);
    expect(titleName(1, null)).toBe('Thực tập sinh');
    expect(titleName(5, 'specialist')).toBe('Chuyên viên');
    expect(titleName(7, 'manager')).toBe('Trưởng nhóm');
    expect(titleName(7, 'specialist')).toBe('Chuyên gia');
    expect(titleName(13, 'manager')).toBe('Giám đốc Senior');
    expect(titleName(13, 'specialist')).toBe('Chuyên gia Senior');
    expect(titleMinLevel(1)).toBe(1);
    expect(titleMinLevel(TITLE_COUNT)).toBe(BALANCE.company.unlockLevel);
  });

  it('chức danh tự lên theo cấp, vài cấp một bậc', () => {
    expect(titleForLevel(1)).toBe(1);
    expect(titleForLevel(4)).toBe(1);
    expect(titleForLevel(5)).toBe(2);
    expect(titleForLevel(149)).toBe(12);
    expect(titleForLevel(150)).toBe(13);
    expect(titleForLevel(500)).toBe(13);
    for (let t = 2; t <= TITLE_COUNT; t += 1) {
      const gap = titleMinLevel(t) - titleMinLevel(t - 1);
      expect(gap).toBeGreaterThanOrEqual(4);
      expect(gap).toBeLessThanOrEqual(15);
      expect(titleFor(xpForLevel(titleMinLevel(t)))).toBe(t);
      expect(titleFor(xpForLevel(titleMinLevel(t)) - 1)).toBe(t - 1);
    }
  });

  it('applyEvent báo chức danh trước/sau khi lên', () => {
    const s = { ...createProgress(T0), xp: xpForLevel(5) - 3 };
    const task = makeEvent('task-flip', T0, 0, { taskId: 1, completed: true });
    const r = applyEvent(s, task, { today: DAY, now: T0 });
    expect(r.titleBefore).toBe(1);
    expect(r.titleAfter).toBe(2);
  });
});

describe('xpFor', () => {
  it('chấm công: 20 + 5 × min(chuỗi, 7)', () => {
    expect(xpFor(checkin(), ctx({ streak: 1 })).xp).toBe(25);
    expect(xpFor(checkin(), ctx({ streak: 7 })).xp).toBe(55);
    expect(xpFor(checkin(), ctx({ streak: 30 })).xp).toBe(55);
  });

  it('hết phiên tập trung trọn vẹn: thưởng 3/10/20; dừng sớm hoặc báo xong mà thiếu giờ thì không', () => {
    expect(xpFor(focus(1, true), ctx()).xp).toBe(3);
    expect(xpFor(focus(3, true), ctx()).xp).toBe(10);
    expect(xpFor(focus(5, true), ctx()).xp).toBe(20);
    expect(xpFor(focus(5, false, 0, 150_000), ctx()).xp).toBe(0);
    expect(xpFor(focus(5, true, 0, 60_000), ctx()).xp).toBe(0);
  });

  it('XP nhỏ giọt mỗi phút: ngồi máy 2, phiên tập trung 4, họp 2', () => {
    expect(xpFor(tick('desk', 1), ctx()).xp).toBe(2);
    expect(xpFor(tick('focus', 3), ctx()).xp).toBe(12);
    expect(xpFor(tick('meeting', 5), ctx()).xp).toBe(10);
  });

  it('mỗi 50 dòng thư công sở = 5 XP, phần dư cộng dồn', () => {
    const a = xpFor(focus(1, true, 70), ctx());
    expect(a.xp).toBe(3 + 5);
    expect(a.linesCarry).toBe(20);
    expect(xpFor(focus(1, true, 30), ctx({ linesCarry: 20 })).xp).toBe(8);
  });

  it('task, cà phê, công quả, quẻ, họp', () => {
    expect(xpFor(makeEvent('task-flip', T0, 0, { taskId: 1, completed: true }), ctx()).xp).toBe(15);
    expect(xpFor(makeEvent('task-flip', T0, 0, { taskId: 1, completed: false }), ctx()).xp).toBe(0);
    expect(xpFor(gift(), ctx()).xp).toBe(8);
    expect(xpFor(chore(), ctx()).xp).toBe(12);
    expect(
      xpFor(makeEvent('kpi-fortune', T0, 0, { day: DAY, fortuneId: 1, repeat: false }), ctx()).xp,
    ).toBe(10);
    expect(
      xpFor(
        makeEvent('kpi-fortune', T0, 0, { day: DAY, fortuneId: 1, repeat: false }),
        ctx({ fortuneClaimed: true }),
      ).xp,
    ).toBe(0);
    // Kết thúc buổi họp không cho thêm XP (đã nhỏ giọt theo phút).
    expect(xpFor(meeting(3), ctx()).xp).toBe(0);
    expect(xpFor(makeEvent('vent', T0, 0, { length: 5, anonymous: true }), ctx()).xp).toBe(0);
  });

  it('giới hạn số lần mỗi ngày', () => {
    expect(xpFor(gift(), ctx({ countToday: (k) => (k === 'coffeeGift' ? 5 : 0) })).xp).toBe(0);
    expect(xpFor(chore(), ctx({ countToday: (k) => (k === 'chore' ? 6 : 0) })).xp).toBe(0);
    expect(
      xpFor(tick('meeting', 10), ctx({ countToday: (k) => (k === 'meetingMinutes' ? 56 : 0) })).xp,
    ).toBe(8);
    expect(
      xpFor(tick('desk', 5), ctx({ countToday: (k) => (k === 'deskMinutes' ? 180 : 0) })).xp,
    ).toBe(0);
  });

  it('phòng ban: x1.3 đúng loại hoạt động', () => {
    expect(xpFor(focus(5, true), ctx({ department: 'dev' })).xp).toBe(26);
    expect(xpFor(tick('focus', 10), ctx({ department: 'dev' })).xp).toBe(52);
    expect(xpFor(focus(5, true), ctx({ department: 'sales' })).xp).toBe(20);
    expect(xpFor(gift(), ctx({ department: 'sales' })).xp).toBe(10);
    expect(xpFor(gift(), ctx({ department: 'hr' })).xp).toBe(10);
    expect(xpFor(chore(), ctx({ department: 'hr' })).xp).toBe(16);
    expect(xpFor(focus(1, true, 50), ctx({ department: 'marketing' })).xp).toBe(3 + 7);
    // Kế toán: chỉ phần thưởng chuỗi.
    expect(xpFor(checkin(), ctx({ department: 'accounting', streak: 7 })).xp).toBe(20 + 46);
  });
});

describe('giới hạn mềm mỗi ngày', () => {
  it('dưới mức nhận đủ, vượt mức chỉ nhận 25%', () => {
    expect(applyDailyCap(0, 100)).toBe(100);
    expect(applyDailyCap(150, 40)).toBe(40);
    expect(applyDailyCap(150, 80)).toBe(40 + 10);
    expect(applyDailyCap(190, 70)).toBe(17);
    expect(applyDailyCap(500, 3)).toBe(0);
    expect(applyDailyCap(0, 0)).toBe(0);
  });

  it('applyEvent cộng dồn đúng giới hạn trong ngày, sang ngày mới thì mở lại', () => {
    let s = createProgress(T0);
    s = applyAll(s, [tick('focus', 35)]); // 140
    s = applyAll(s, [tick('focus', 25)]); // +50 đủ, +50 vượt → 12
    expect(s.daily.earned).toBe(140 + 50 + 12);
    expect(s.daily.counts.deskMinutes).toBe(60);
    const next = applyEvent(s, tick('focus', 10), { today: addDays(DAY, 1), now: T0 + 86_400_000 });
    expect(next.granted).toBe(40);
    expect(next.state.daily.earned).toBe(40);
  });

  it('đổi sang múi giờ chậm hơn (ngày lịch lùi lại): không mở rổ ngày mới', () => {
    let s = applyAll(createProgress(T0), [focus(5, true), focus(5, true), focus(5, true)]);
    const before = s.daily.earned;
    s = applyEvent(s, focus(5, true), { today: addDays(DAY, -1), now: T0 + 3_600_000 }).state;
    expect(s.daily.day).toBe(DAY);
    expect(s.daily.earned).toBeGreaterThan(before);
    expect(s.daily.earned - before).toBeLessThan(70);
  });
});

describe('chấm công trong tiến độ', () => {
  it('không tin chuỗi trong sự kiện; chuỗi tăng theo ngày lịch, mỗi ngày một lần', () => {
    let s = createProgress(T0);
    const r1 = applyEvent(s, checkin(), { today: DAY, now: T0 });
    expect(r1.checkIn).toBe('checked');
    expect(r1.granted).toBe(25);
    s = r1.state;
    expect(applyEvent(s, checkin(), { today: DAY, now: T0 }).checkIn).toBe('already');
    for (let d = 1; d <= 3; d += 1)
      s = applyEvent(s, checkin(), { today: addDays(DAY, d), now: T0 + d * 86_400_000 }).state;
    expect(s.checkIn.streak).toBe(4);
    s = applyEvent(s, checkin(), { today: addDays(DAY, 6), now: T0 }).state;
    expect(s.checkIn.streak).toBe(1);
  });

  it('checkInOnDay: ngày lùi lại thì "đã chấm"', () => {
    const state = { lastDay: DAY, lastAt: T0, streak: 3, total: 3 };
    expect(checkInOnDay(state, addDays(DAY, -1), T0).status).toBe('already');
    expect(checkInOnDay(state, addDays(DAY, 1), T0).state.streak).toBe(4);
  });

  it('dayKey theo múi giờ dùng chung với client', () => {
    expect(dayKey(new Date('2026-11-02T20:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-03');
    expect(dayKey(new Date('2026-11-02T20:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-02');
  });
});

describe('sếp giao việc', () => {
  const base = { today: DAY, playerId: 'NV-ABCDEF' };

  it('hẹn giờ rồi mới giao; tối đa 3 việc/ngày; không trùng việc', () => {
    let s = createProgress(T0);
    let r = tickBossMissions(s, { ...base, now: T0 });
    expect(r.assigned).toBeNull();
    s = r.state;
    r = tickBossMissions(s, { ...base, now: T0 + BALANCE.missions.firstDelayMs });
    expect(r.assigned).not.toBeNull();
    s = r.state;
    // Đang có việc thì không giao thêm.
    expect(tickBossMissions(s, { ...base, now: T0 + 10 ** 7 }).assigned).toBeNull();
    expect(activeMission(s)?.templateId).toBe(r.assigned?.templateId);
  });

  it('làm xong việc: +40 XP, nghỉ rồi giao việc tiếp; hết 3 việc thì thôi', () => {
    let s = createProgress(T0);
    const seen = new Set<string>();
    let now = T0;
    for (let i = 0; i < 3; i += 1) {
      for (let k = 0; k < 2 && !activeMission(s); k += 1) {
        s = tickBossMissions(s, { ...base, now }).state;
        now += BALANCE.missions.cooldownMs + BALANCE.missions.firstDelayMs;
      }
      const mission = activeMission(s);
      expect(mission).not.toBeNull();
      if (!mission) return;
      seen.add(mission.templateId);
      // Làm đủ mục tiêu bằng sự kiện phù hợp.
      const goal = mission.goal;
      const events: ActivityEvent[] =
        goal.kind === 'focusMinutes'
          ? [focus(5, true)]
          : goal.kind === 'lines'
            ? [focus(1, true, goal.amount)]
            : goal.kind === 'meetingMinutes'
              ? [meeting(goal.amount)]
              : goal.kind === 'ceoMeeting'
                ? [
                    makeEvent('meeting', T0, goal.amount * 60_000, {
                      seatId: 'meeting-ceo-0',
                    }),
                  ]
                : Array.from({ length: goal.amount }, () =>
                    goal.event === 'coffee-gift'
                      ? gift()
                      : goal.event === 'chore'
                        ? chore()
                        : goal.event === 'print'
                          ? makeEvent('print', T0, 0, {})
                          : goal.event === 'task-flip'
                            ? makeEvent('task-flip', T0, 0, { taskId: 1, completed: true })
                            : goal.event === 'kpi-fortune'
                              ? makeEvent('kpi-fortune', T0, 0, {
                                  day: DAY,
                                  fortuneId: 1,
                                  repeat: false,
                                })
                              : checkin(),
                  );
      let missionDone = false;
      for (const e of events) {
        const r = applyEvent(s, e, { today: DAY, now });
        if (r.completedMission) missionDone = true;
        s = r.state;
      }
      expect(missionDone).toBe(true);
      expect(s.log.some((entry) => entry.source === 'mission')).toBe(true);
    }
    expect(seen.size).toBe(3);
    expect(tickBossMissions(s, { ...base, now: now + 10 ** 8 }).assigned).toBeNull();
    // Ngày mới thì có việc mới.
    const tomorrow = tickBossMissions(s, { ...base, today: addDays(DAY, 1), now: now + 10 ** 8 });
    expect(tomorrow.state.daily.missions).toHaveLength(0);
  });

  it('không giao việc "xin quẻ" khi hôm nay đã xin, "chấm công" khi đã chấm', () => {
    const s = applyAll(createProgress(T0), [
      checkin(),
      makeEvent('kpi-fortune', T0, 0, { day: DAY, fortuneId: 1, repeat: false }),
    ]);
    const ids: string[] = [];
    let now = T0;
    for (let i = 0; i < 40; i += 1) {
      const r = tickBossMissions(
        { ...s, daily: { ...s.daily, missions: [], nextMissionAt: now } },
        { ...base, playerId: `NV-${String(i)}`, now },
      );
      if (r.assigned) ids.push(r.assigned.templateId);
      now += 1;
    }
    expect(ids).not.toContain('fortune');
    expect(ids).not.toContain('checkin');
    expect(MISSION_TEMPLATES.length).toBeGreaterThanOrEqual(12);
  });
});

describe('lựa chọn sự nghiệp, xu, uy tín', () => {
  it('chọn phòng ban từ chức danh 3, nhánh từ chức danh 5; chỉ chọn một lần', () => {
    const t3 = { ...createProgress(T0), xp: xpForLevel(titleMinLevel(3)) };
    expect(needsDepartment(createProgress(T0))).toBe(false);
    expect(needsDepartment(t3)).toBe(true);
    expect(needsBranch(t3)).toBe(false);
    expect(chooseDepartment(t3, 'dev').department).toBe('dev');
    expect(chooseDepartment(createProgress(T0), 'dev').department).toBeNull();
    const t5 = { ...createProgress(T0), xp: xpForLevel(titleMinLevel(5)) };
    const chosen = chooseBranch(t5, 'specialist');
    expect(chosen.branch).toBe('specialist');
    expect(chooseBranch(chosen, 'manager').branch).toBe('specialist');
  });

  it('xu = 50% XP thực nhận (làm tròn xuống); giúp đồng nghiệp tăng uy tín', () => {
    let s = createProgress(T0);
    const r = applyEvent(s, checkin(), { today: DAY, now: T0 });
    expect(r.coins).toBe(12);
    s = applyAll(r.state, [gift(), chore()]);
    expect(s.coins).toBe(12 + 4 + 6);
    expect(s.reputation).toBe(2);
  });
});

describe('mã lưu và migrate', () => {
  const sample = (): ProgressState => {
    let s = applyAll(createProgress(T0), [checkin(), focus(5, true, 60), gift()]);
    s = { ...s, department: 'marketing' };
    return s;
  };

  it('xuất rồi nhập lại được nguyên trạng (cả chữ có dấu)', () => {
    const s = {
      ...sample(),
      log: [...sample().log, { at: 1, source: 'note', xp: 0, base: 0, note: 'Chào sếp 😀 Nguyễn' }],
    };
    const code = encodeSaveCode(s);
    expect(code.startsWith(`DLO.${String(PROGRESS_VERSION)}.`)).toBe(true);
    const decoded = decodeSaveCode(code, T0);
    expect(decoded.ok && decoded.state).toEqual(s);
  });

  it('sai checksum, sai định dạng, phiên bản lạ: báo lỗi', () => {
    const code = encodeSaveCode(sample());
    const parts = code.split('.');
    const tampered = [parts[0], parts[1], `${parts[2] ?? ''}A`, parts[3]].join('.');
    expect(decodeSaveCode(tampered, T0)).toEqual({ ok: false, error: 'checksum' });
    expect(decodeSaveCode('xin chào', T0)).toEqual({ ok: false, error: 'format' });
    const body = `DLO.9.${parts[2] ?? ''}`;
    expect(decodeSaveCode(`${body}.${crc32(body)}`, T0)).toEqual({ ok: false, error: 'version' });
  });

  it('nhập mã có dữ liệu không hợp lệ (dù checksum đúng): báo lỗi', () => {
    const body = 'DLO.2.' + 'eyJ2ZXJzaW9uIjoyLCJ4cCI6LTV9'; // {"version":2,"xp":-5}
    expect(decodeSaveCode(`${body}.${crc32(body)}`, T0)).toEqual({ ok: false, error: 'data' });
  });

  it('migrate v1 (dữ liệu chấm công Phase 2B) → bản hiện tại, giữ chuỗi', () => {
    const r = migrateProgress(
      { version: 1, checkIn: { lastDay: DAY, lastAt: T0, streak: 4, total: 9 }, fortuneDay: DAY },
      T0,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(1);
    expect(r.state.version).toBe(PROGRESS_VERSION);
    expect(r.state.checkIn.streak).toBe(4);
    expect(r.state.xp).toBe(0);
  });

  it('migrate v2 (có chức danh, kỳ đánh giá) → v3: bỏ trường cũ, lần giúp thành uy tín', () => {
    // Dữ liệu v2 thật chưa có số liệu ngày (stats).
    const { stats: _stats, ...dailyV2 } = sample().daily;
    const { coins: _c, reputation: _r, ...rest } = { ...sample(), daily: dailyV2 };
    const v2 = {
      ...rest,
      version: 2,
      title: 4,
      review: { periodStart: DAY, checkInDays: [DAY], focusMs: 0, helps: 3, last: null },
      personality: { diligence: 2, sociability: 0, creativity: 0 },
    };
    const r = migrateProgress(JSON.parse(JSON.stringify(v2)), T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(2);
    expect(r.state).toEqual({ ...sample(), daily: dailyV2, coins: 0, reputation: 3 });
    expect('title' in r.state).toBe(false);
  });

  it('migrate: bản hiện tại hợp lệ giữ nguyên; rác hoặc phiên bản lạ thì từ chối', () => {
    const s = sample();
    expect(migrateProgress(JSON.parse(JSON.stringify(s)), T0)).toEqual({
      ok: true,
      state: s,
      migratedFrom: null,
    });
    expect(migrateProgress(null, T0)).toEqual({ ok: false, reason: 'invalid' });
    expect(migrateProgress({ version: 99 }, T0)).toEqual({ ok: false, reason: 'unknown_version' });
    expect(migrateProgress({ version: 2, xp: 'nhiều' }, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});

describe('mở công ty', () => {
  it('cần cấp 150 và đã rời công ty hiện tại', () => {
    const s = createProgress(T0);
    expect(canOpenCompany(s).missing).toEqual(['level', 'employed']);
    const high = { ...s, xp: xpForLevel(BALANCE.company.unlockLevel) };
    expect(canOpenCompany(high).missing).toEqual(['employed']);
    expect(canOpenCompany(leaveCompany(high))).toMatchObject({ ok: true, missing: [] });
    expect(canOpenCompany(leaveCompany(high), { totalEarned: 8000 }).missing).toEqual(['capital']);
    expect(canOpenCompany(leaveCompany(high), { totalEarned: 8000 }).capital).toBe(2000);
    expect(buildingHasRoom(29)).toBe(true);
    expect(buildingHasRoom(30)).toBe(false);
  });
});

describe('uống trà sữa', () => {
  it('được XP nhưng không sinh xu (cốc trà sữa thật sự tốn xu); tối đa 3 cốc tính XP mỗi ngày', () => {
    let s = createProgress(T0);
    const cup = () => makeEvent('milk-tea', T0, 0, {});
    const first = applyEvent(s, cup(), { today: DAY, now: T0 });
    expect(first.granted).toBe(BALANCE.milkTea);
    expect(first.coins).toBe(0);
    expect(first.state.coins).toBe(s.coins);
    s = first.state;
    for (let i = 0; i < BALANCE.perDayLimits.milkTea - 1; i += 1) {
      s = applyEvent(s, cup(), { today: DAY, now: T0 }).state;
    }
    const extra = applyEvent(s, cup(), { today: DAY, now: T0 });
    expect(extra.granted).toBe(0);
  });
});
