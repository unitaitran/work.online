import {
  OFFICE_FLOOR,
  officeInteractables,
  titleFor,
  xpForLevel,
  type Action,
  type Vec2,
} from '@dilam/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { createSqliteRepositories, type Repositories } from '../db/repositories';
import { createAccountService } from './accounts';
import { ProgressEngine, type PlayerContext } from './progressEngine';

// 09:00 giờ VN ngày 2/11/2026.
const START = Date.UTC(2026, 10, 2, 2);
const items = new Map(officeInteractables(OFFICE_FLOOR).map((item) => [item.id, item]));
const at = (id: string): Vec2 => {
  const item = items.get(id);
  if (!item) throw new Error(id);
  return item.seat ?? item.approach;
};

let clock = START;
let repos: Repositories;
let engine: ProgressEngine;
let player: PlayerContext;
let position: Vec2 | null;
let seq = 0;

beforeEach(() => {
  clock = START;
  repos = createSqliteRepositories(openDatabase(':memory:'));
  const accounts = createAccountService(repos, { tokenTtlDays: 30, now: () => clock });
  const { userId } = accounts.create('Asia/Ho_Chi_Minh');
  engine = new ProgressEngine(repos, () => clock);
  position = at('gate');
  player = {
    userId,
    playerCode: 'NV-TEST01',
    timeZone: 'Asia/Ho_Chi_Minh',
    position: () => position,
  };
});

function act(action: Action, id = `act-${String(++seq).padStart(6, '0')}`) {
  return engine.handle(player, id, action);
}

describe('ProgressEngine', () => {
  it('chấm công: XP do server tính; chấm lần hai trong ngày không thêm', () => {
    const r = act({ kind: 'checkin' });
    expect(r).toMatchObject({ ok: true, outcome: { granted: 25, checkIn: 'checked' } });
    clock += 5000;
    const again = act({ kind: 'checkin' });
    expect(again).toMatchObject({ ok: true, outcome: { granted: 0, checkIn: 'already' } });
    expect(engine.state(player.userId).xp).toBe(25);
  });

  it('gửi trùng khoá hành động: bị từ chối, không cộng hai lần', () => {
    expect(act({ kind: 'checkin' }, 'same-key-1')).toMatchObject({ ok: true });
    clock += 86_400_000;
    expect(act({ kind: 'checkin' }, 'same-key-1')).toEqual({ ok: false, reason: 'duplicate' });
    expect(engine.state(player.userId).xp).toBe(25);
  });

  it('gửi quá nhanh: bị từ chối', () => {
    position = at('plant-0');
    expect(act({ kind: 'chore', target: 'plant-0' })).toMatchObject({ ok: true });
    clock += 500;
    expect(act({ kind: 'chore', target: 'plant-0' })).toEqual({ ok: false, reason: 'too_fast' });
  });

  it('đứng xa vật: bị từ chối', () => {
    position = at('printer');
    expect(act({ kind: 'checkin' })).toEqual({ ok: false, reason: 'too_far' });
    position = null;
    expect(act({ kind: 'print' })).toEqual({ ok: false, reason: 'too_far' });
  });

  it('phiên tập trung do server đo giờ: kết thúc sớm chỉ tính phần đã ngồi', () => {
    position = at('desk-0');
    expect(act({ kind: 'focus_end', presses: 999, scoredKeys: 999, lines: 999 })).toEqual({
      ok: false,
      reason: 'not_started',
    });
    expect(act({ kind: 'focus_start', minutes: 5 })).toMatchObject({ ok: true });
    clock += 125_000; // 2 phút 5 giây
    const r = act({ kind: 'focus_end', presses: 9999, scoredKeys: 9999, lines: 9999 });
    // Báo 9999 dòng nhưng 125 giây chỉ gõ được tối đa ~1062 phím: XP dòng bị chặn theo đó.
    expect(r).toMatchObject({ ok: true });
    if (!r.ok || !r.outcome) throw new Error('no outcome');
    expect(r.outcome.base).toBe(2 * 5 + Math.floor(Math.floor(125 * 8.5) / 50) * 10);
  });

  it('phiên tập trung trọn vẹn: 70 XP cho 5 phút', () => {
    position = at('desk-0');
    act({ kind: 'focus_start', minutes: 5 });
    clock += 5 * 60_000 - 500;
    const r = act({ kind: 'focus_end', presses: 100, scoredKeys: 40, lines: 40 });
    expect(r).toMatchObject({ ok: true, outcome: { granted: 70 } });
  });

  it('tặng cà phê cần pha xong trước (server đo thời gian pha)', () => {
    position = at('coffee');
    expect(act({ kind: 'coffee_gift', npcId: 'npc-1' })).toEqual({
      ok: false,
      reason: 'not_started',
    });
    act({ kind: 'coffee_brew' });
    clock += 1000;
    expect(act({ kind: 'coffee_gift', npcId: 'npc-1' })).toEqual({
      ok: false,
      reason: 'not_started',
    });
    clock += 3000;
    expect(act({ kind: 'coffee_gift', npcId: 'npc-1' })).toMatchObject({
      ok: true,
      outcome: { granted: 8 },
    });
    clock += 2000;
    // Ly đã tặng rồi.
    expect(act({ kind: 'coffee_gift', npcId: 'npc-1' })).toEqual({
      ok: false,
      reason: 'not_started',
    });
  });

  it('họp: server đo thời gian giữa bắt đầu và kết thúc', () => {
    position = at('meeting-0');
    act({ kind: 'meeting_start', seatId: 'meeting-0' });
    clock += 3 * 60_000 + 10_000;
    expect(act({ kind: 'meeting_end' })).toMatchObject({ ok: true, outcome: { granted: 12 } });
  });

  it('đổi ngày (lúc 4 giờ sáng giờ địa phương): chuỗi tăng, giới hạn ngày mở lại', () => {
    act({ kind: 'checkin' });
    // 03:30 sáng hôm sau giờ VN: vẫn tính là ngày cũ.
    clock = Date.UTC(2026, 10, 2, 20, 30);
    expect(act({ kind: 'checkin' })).toMatchObject({ outcome: { checkIn: 'already' } });
    // 04:10 sáng: ngày mới.
    clock = Date.UTC(2026, 10, 2, 21, 10);
    expect(act({ kind: 'checkin' })).toMatchObject({
      outcome: { checkIn: 'checked', granted: 30 },
    });
    expect(engine.state(player.userId).checkIn.streak).toBe(2);
  });

  it('xin quẻ: lần đầu trong ngày có XP, lần sau "xem lại"', () => {
    position = at('fortune');
    const first = act({ kind: 'fortune' });
    expect(first).toMatchObject({ ok: true, outcome: { granted: 10, fortune: { repeat: false } } });
    clock += 2000;
    expect(act({ kind: 'fortune' })).toMatchObject({
      outcome: { granted: 0, fortune: { repeat: true } },
    });
  });

  it('chọn phòng ban chỉ khi đủ chức danh, chọn một lần', () => {
    expect(act({ kind: 'choose_department', department: 'dev' })).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    engine.save(player.userId, { ...engine.state(player.userId), xp: xpForLevel(12) });
    expect(titleFor(engine.state(player.userId).xp)).toBe(3);
    expect(act({ kind: 'choose_department', department: 'dev' })).toMatchObject({ ok: true });
    clock += 1000;
    expect(act({ kind: 'choose_department', department: 'hr' })).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  it('sếp giao việc định kỳ, hoàn thành được qua hành động', () => {
    expect(engine.tickMissions(player)?.assigned ?? null).toBeNull();
    clock += 25_000;
    const ticked = engine.tickMissions(player);
    expect(ticked?.assigned).not.toBeNull();
  });

  it('chơi trọn một vòng từ cấp 1 lên chức danh 2 qua server', () => {
    const r = act({ kind: 'checkin' });
    expect(r).toMatchObject({ ok: true, outcome: { titleBefore: 1, titleAfter: 2 } });
    position = at('desk-0');
    act({ kind: 'focus_start', minutes: 1 });
    clock += 60_000;
    act({ kind: 'focus_end', presses: 50, scoredKeys: 30, lines: 30 });
    expect(repos.activity.recent(player.userId, 10).map((e) => e.kind)).toEqual([
      'focus-typing',
      'checkin',
    ]);
  });
});
