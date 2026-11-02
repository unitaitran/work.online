import { describe, expect, it } from 'vitest';
import { makeEvent, type ActivityEvent } from './activityEvents';
import { BALANCE } from './balance';
import { canOpenCompany, leaveCompany, buildingHasRoom } from './company';
import { INTERVIEW_QUESTIONS, pickInterview, scoreInterview } from './interview';
import {
  levelFor,
  levelProgress,
  MAX_LEVEL,
  titleMinLevel,
  titleName,
  XP_TABLE,
  xpForLevel,
} from './levels';
import { MISSION_TEMPLATES } from './missions';
import { createProgress, migrateProgress, PROGRESS_VERSION, type ProgressState } from './progress';
import {
  chooseBranch,
  chooseDepartment,
  completeReview,
  needsBranch,
  needsDepartment,
  reviewStatus,
} from './review';
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

  it('chức danh: 5 bậc chung, từ bậc 6 khác theo nhánh', () => {
    expect(titleName(1, null)).toBe('Thực tập sinh');
    expect(titleName(5, 'specialist')).toBe('Chuyên viên cao cấp');
    expect(titleName(6, 'manager')).toBe('Trưởng nhóm');
    expect(titleName(6, 'specialist')).toBe('Chuyên gia');
    expect(titleName(10, 'manager')).toBe('Tổng giám đốc');
    expect(titleName(10, 'specialist')).not.toBe(titleName(10, 'manager'));
    expect(titleMinLevel(1)).toBe(1);
    expect(titleMinLevel(10)).toBe(MAX_LEVEL);
  });
});

describe('xpFor', () => {
  it('chấm công: 20 + 5 × min(chuỗi, 7)', () => {
    expect(xpFor(checkin(), ctx({ streak: 1 })).xp).toBe(25);
    expect(xpFor(checkin(), ctx({ streak: 7 })).xp).toBe(55);
    expect(xpFor(checkin(), ctx({ streak: 30 })).xp).toBe(55);
  });

  it('gõ phím tập trung: trọn phiên 1/3/5 phút = 10/35/70; dừng sớm 5 XP mỗi phút trọn', () => {
    expect(xpFor(focus(1, true), ctx()).xp).toBe(10);
    expect(xpFor(focus(3, true), ctx()).xp).toBe(35);
    expect(xpFor(focus(5, true), ctx()).xp).toBe(70);
    expect(xpFor(focus(5, false, 0, 150_000), ctx()).xp).toBe(10);
    // Báo "xong" nhưng thời gian không đủ: không tin, tính như dừng sớm.
    expect(xpFor(focus(5, true, 0, 60_000), ctx()).xp).toBe(5);
  });

  it('mỗi 50 dòng kinh công sở = 10 XP, phần dư cộng dồn', () => {
    const a = xpFor(focus(1, true, 70), ctx());
    expect(a.xp).toBe(10 + 10);
    expect(a.linesCarry).toBe(20);
    expect(xpFor(focus(1, true, 30), ctx({ linesCarry: 20 })).xp).toBe(20);
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
    expect(xpFor(meeting(3), ctx()).xp).toBe(12);
    expect(xpFor(meeting(60), ctx()).xp).toBe(BALANCE.meeting.maxMinutesPerSession * 4);
    expect(xpFor(makeEvent('vent', T0, 0, { length: 5, anonymous: true }), ctx()).xp).toBe(0);
  });

  it('giới hạn số lần mỗi ngày', () => {
    expect(xpFor(gift(), ctx({ countToday: (k) => (k === 'coffeeGift' ? 5 : 0) })).xp).toBe(0);
    expect(xpFor(chore(), ctx({ countToday: (k) => (k === 'chore' ? 6 : 0) })).xp).toBe(0);
    expect(
      xpFor(meeting(10), ctx({ countToday: (k) => (k === 'meetingMinutes' ? 28 : 0) })).xp,
    ).toBe(8);
  });

  it('phòng ban: x1.3 đúng loại hoạt động', () => {
    expect(xpFor(focus(5, true), ctx({ department: 'dev' })).xp).toBe(91);
    expect(xpFor(focus(5, true), ctx({ department: 'sales' })).xp).toBe(70);
    expect(xpFor(gift(), ctx({ department: 'sales' })).xp).toBe(10);
    expect(xpFor(gift(), ctx({ department: 'hr' })).xp).toBe(10);
    expect(xpFor(chore(), ctx({ department: 'hr' })).xp).toBe(16);
    expect(xpFor(focus(1, true, 50), ctx({ department: 'marketing' })).xp).toBe(10 + 13);
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
    s = applyAll(s, [focus(5, true), focus(5, true)]); // 140
    s = applyAll(s, [focus(5, true)]); // +50 đủ, +20 → 5
    expect(s.daily.earned).toBe(140 + 50 + 5);
    expect(s.xp).toBe(195);
    const next = applyEvent(s, focus(5, true), { today: addDays(DAY, 1), now: T0 + 86_400_000 });
    expect(next.granted).toBe(70);
    expect(next.state.daily.earned).toBe(70);
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
    expect(s.review.checkInDays).toHaveLength(4);
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

describe('kỳ đánh giá', () => {
  /** Người chơi chăm: đủ mọi điều kiện cho chức danh 2 trong 7 ngày. */
  function diligentWeek(): ProgressState {
    let s = createProgress(T0);
    for (let d = 0; d < 7; d += 1) {
      const today = addDays(DAY, d);
      const now = T0 + d * 86_400_000;
      s = applyAll(s, [checkin(now), focus(5, true), gift()], today, now);
    }
    return s;
  }

  it('chưa đủ 7 ngày thì chưa tới hạn', () => {
    const s = diligentWeek();
    const status = reviewStatus(s, addDays(DAY, 6));
    expect(status.due).toBe(false);
    expect(status.daysLeft).toBe(1);
  });

  it('đủ 7 ngày + đủ điều kiện: qua phỏng vấn thì lên chức danh 2, kỳ mới bắt đầu', () => {
    const s = diligentWeek();
    const today = addDays(DAY, 7);
    const status = reviewStatus(s, today);
    expect(status.due).toBe(true);
    expect(status.eligible).toBe(true);
    const questions = pickInterview(1);
    const after = completeReview(s, today, {
      passed: true,
      personality: scoreInterview(questions, [0, 1, 2, 0, 1]),
    });
    expect(after.title).toBe(2);
    expect(after.review.periodStart).toBe(today);
    expect(after.review.checkInDays).toHaveLength(0);
    expect(
      after.personality.diligence + after.personality.sociability + after.personality.creativity,
    ).toBe(10);
  });

  it('thiếu điều kiện: không mất chức danh, ghi lại thiếu gì, chờ kỳ sau', () => {
    let s = createProgress(T0);
    s = applyAll(s, [checkin(), focus(5, true)]);
    s = { ...s, title: 3, xp: xpForLevel(40) };
    const today = addDays(DAY, 8);
    const status = reviewStatus(s, today);
    expect(status.eligible).toBe(false);
    const after = completeReview(s, today, { passed: true });
    expect(after.title).toBe(3);
    expect(after.review.last?.passed).toBe(false);
    expect(after.review.last?.missing).toEqual(
      expect.arrayContaining(['checkins', 'focus', 'helps']),
    );
  });

  it('lên chức danh 6 cần đã chọn nhánh; chọn phòng ban từ chức danh 3', () => {
    let s = { ...createProgress(T0), title: 5, xp: xpForLevel(130) };
    expect(needsBranch(s)).toBe(true);
    expect(reviewStatus(s, DAY).checks.find((c) => c.id === 'branch')?.met).toBe(false);
    s = chooseBranch(s, 'specialist');
    expect(s.branch).toBe('specialist');
    expect(chooseBranch(s, 'manager').branch).toBe('specialist');
    const t3 = { ...createProgress(T0), title: 3 };
    expect(needsDepartment(t3)).toBe(true);
    expect(chooseDepartment(t3, 'dev').department).toBe('dev');
    expect(chooseDepartment(createProgress(T0), 'dev').department).toBeNull();
  });
});

describe('phỏng vấn', () => {
  it('20 tình huống, mỗi tình huống 3 lựa chọn đều có cộng chỉ số (không câu sai)', () => {
    expect(INTERVIEW_QUESTIONS).toHaveLength(20);
    for (const q of INTERVIEW_QUESTIONS) {
      expect(q.options).toHaveLength(3);
      for (const option of q.options) {
        const sum = Object.values(option.effect).reduce((a, b) => a + b, 0);
        expect(sum).toBeGreaterThan(0);
        expect(sum).toBeLessThanOrEqual(3);
      }
    }
  });

  it('chọn ngẫu nhiên 5 câu khác nhau, cùng hạt giống cùng bộ câu', () => {
    const a = pickInterview(42);
    expect(a).toHaveLength(5);
    expect(new Set(a.map((q) => q.id)).size).toBe(5);
    expect(pickInterview(42).map((q) => q.id)).toEqual(a.map((q) => q.id));
  });
});

describe('mã lưu và migrate', () => {
  const sample = (): ProgressState => {
    let s = applyAll(createProgress(T0), [checkin(), focus(5, true, 60), gift()]);
    s = { ...s, title: 3, department: 'marketing' };
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

  it('migrate v1 (dữ liệu chấm công Phase 2B) → v2, giữ chuỗi', () => {
    const r = migrateProgress(
      { version: 1, checkIn: { lastDay: DAY, lastAt: T0, streak: 4, total: 9 }, fortuneDay: DAY },
      T0,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(1);
    expect(r.state.version).toBe(2);
    expect(r.state.checkIn.streak).toBe(4);
    expect(r.state.xp).toBe(0);
  });

  it('migrate: v2 hợp lệ giữ nguyên; rác hoặc phiên bản lạ thì từ chối', () => {
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
    expect(canOpenCompany(leaveCompany(high))).toEqual({ ok: true, missing: [] });
    expect(buildingHasRoom(29)).toBe(true);
    expect(buildingHasRoom(30)).toBe(false);
  });
});
