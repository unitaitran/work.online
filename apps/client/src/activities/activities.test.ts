import { describe, expect, it } from 'vitest';
import { KINH_CONG_SO } from '../data/kinh-cong-so';
import { KPI_FORTUNES } from '../data/kpi-fortunes';
import { MICRO_TASKS } from '../data/micro-tasks';
import { seededRng } from '../npc/schedule';
import type { KeyValueStore } from '../storage';
import { brewProgress, handOver, IDLE_COFFEE, startBrew, tickBrew } from './coffee/coffee';
import { ActivityBus, EVENT_LOG_KEY, EVENT_LOG_LIMIT, loadEventLog, makeEvent } from './events';
import {
  finishTypingSession,
  isTimeUp,
  lineAt,
  MIN_SCORED_INTERVAL_MS,
  pressKey,
  startTypingSession,
} from './focusTyping/focusTyping';
import { fortuneFor, fortuneIndex } from './fortune/fortune';
import { generatePlayerId, isPlayerId, loadOrCreatePlayerId } from './playerId';
import { chosenTaskId, complete, deal, dealTasks, flip } from './taskFlip/taskFlip';
import {
  addVent,
  validateVent,
  VENT_LIMIT,
  VENT_MAX_LENGTH,
  type VentEntry,
} from './ventWall/ventWall';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe('nội dung tự viết', () => {
  it('ít nhất 40 dòng kinh công sở, không trùng', () => {
    expect(KINH_CONG_SO.length).toBeGreaterThanOrEqual(40);
    expect(new Set(KINH_CONG_SO).size).toBe(KINH_CONG_SO.length);
  });

  it('đúng 60 quẻ, quẻ nào cũng đủ 4 khía cạnh và lời khuyên, tên không trùng', () => {
    expect(KPI_FORTUNES).toHaveLength(60);
    for (const f of KPI_FORTUNES) {
      for (const field of [f.name, f.work, f.salary, f.colleagues, f.health, f.advice]) {
        expect(field.trim().length).toBeGreaterThan(3);
      }
    }
    expect(new Set(KPI_FORTUNES.map((f) => f.name)).size).toBe(60);
  });

  it('quẻ không đưa lời khuyên tài chính hay y tế thật', () => {
    const banned = /(đầu tư|chứng khoán|cổ phiếu|vay|lãi suất|thuốc|bác sĩ|chẩn đoán|liều)/i;
    for (const f of KPI_FORTUNES) {
      expect(`${f.salary} ${f.health} ${f.advice}`).not.toMatch(banned);
    }
  });

  it('có đủ việc nhỏ để chia bài', () => {
    expect(MICRO_TASKS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(MICRO_TASKS).size).toBe(MICRO_TASKS.length);
  });
});

describe('bus sự kiện', () => {
  it('phát cho người nghe, lưu nhật ký, huỷ đăng ký được', () => {
    const store = new MemoryStore();
    const bus = new ActivityBus(store);
    const seen: string[] = [];
    const off = bus.on((e) => seen.push(e.type));
    bus.emit(makeEvent('checkin', 1000, 0, { day: '2026-11-02', streak: 1, total: 1 }));
    off();
    bus.emit(makeEvent('coffee-drink', 2000, 0, {}));
    expect(seen).toEqual(['checkin']);
    expect(bus.history().map((e) => e.type)).toEqual(['checkin', 'coffee-drink']);
    expect(new ActivityBus(store).history()).toHaveLength(2);
  });

  it('giới hạn số sự kiện lưu, bỏ bản ghi hỏng', () => {
    const store = new MemoryStore();
    const bus = new ActivityBus(store);
    for (let i = 0; i < EVENT_LOG_LIMIT + 20; i += 1) bus.emit(makeEvent('coffee-drink', i, 0, {}));
    expect(bus.history()).toHaveLength(EVENT_LOG_LIMIT);
    expect(bus.history()[0]?.startedAt).toBe(20);
    store.setItem(
      EVENT_LOG_KEY,
      JSON.stringify([
        { type: 'hack', startedAt: 1 },
        { type: 'vent', startedAt: 1, durationMs: 0, detail: {} },
      ]),
    );
    expect(loadEventLog(store).map((e) => e.type)).toEqual(['vent']);
    store.setItem(EVENT_LOG_KEY, '{hỏng');
    expect(loadEventLog(store)).toEqual([]);
  });

  it('durationMs luôn là số nguyên không âm', () => {
    expect(makeEvent('coffee-brew', 0, -5.5, { brewMs: 1 }).durationMs).toBe(0);
    expect(makeEvent('coffee-brew', 0, 12.6, { brewMs: 1 }).durationMs).toBe(13);
  });
});

describe('gõ phím tập trung', () => {
  it('phiên 1/3/5 phút', () => {
    expect(startTypingSession(1, 0).plannedMs).toBe(60_000);
    expect(startTypingSession(5, 0).plannedMs).toBe(300_000);
  });

  it('mỗi lần gõ được tính ra thêm một dòng', () => {
    let s = startTypingSession(1, 0);
    for (let t = 0; t < 10; t += 1) s = pressKey(s, 1000 + t * 300).session;
    expect(s).toMatchObject({ presses: 10, scoredKeys: 10, lines: 10 });
  });

  it('gõ nhanh hơn giới hạn thì có tiếng nhưng không được tính', () => {
    let s = startTypingSession(1, 0);
    // 100 lần trong 1 giây: chỉ tính được khoảng 1000 / MIN_SCORED_INTERVAL_MS lần.
    for (let i = 0; i < 100; i += 1) s = pressKey(s, 1000 + i * 10).session;
    expect(s.presses).toBe(100);
    expect(s.scoredKeys).toBeLessThanOrEqual(Math.ceil(1000 / MIN_SCORED_INTERVAL_MS));
    expect(s.lines).toBe(s.scoredKeys);
  });

  it('hết giờ thì không tính nữa; tổng kết đúng', () => {
    let s = startTypingSession(1, 0);
    s = pressKey(s, 500).session;
    expect(isTimeUp(s, 60_000)).toBe(true);
    const late = pressKey(s, 60_001);
    expect(late.scored).toBe(false);
    expect(late.session.presses).toBe(1);
    expect(finishTypingSession(s, 70_000)).toEqual({
      plannedMs: 60_000,
      actualMs: 60_000,
      presses: 1,
      scoredKeys: 1,
      lines: 1,
      completed: true,
    });
    expect(finishTypingSession(s, 30_000).completed).toBe(false);
  });

  it('thứ tự dòng: đi hết các dòng rồi mới lặp, cùng hạt giống cùng thứ tự', () => {
    const first = Array.from({ length: KINH_CONG_SO.length }, (_, i) => lineAt(i, 42));
    expect(new Set(first).size).toBe(KINH_CONG_SO.length);
    expect(lineAt(3, 42)).toBe(first[3]);
    expect(KINH_CONG_SO).toContain(lineAt(KINH_CONG_SO.length + 5, 42));
  });
});

describe('quẻ KPI', () => {
  it('cùng ngày cùng người: cùng quẻ', () => {
    expect(fortuneIndex('2026-11-02', 'NV-ABCDEF')).toBe(fortuneIndex('2026-11-02', 'NV-ABCDEF'));
  });

  it('đổi ngày hoặc đổi người thì quẻ thay đổi (trên nhiều ngày)', () => {
    const days = Array.from(
      { length: 60 },
      (_, i) =>
        `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    );
    const a = days.map((d) => fortuneIndex(d, 'NV-ABCDEF'));
    const b = days.map((d) => fortuneIndex(d, 'NV-ZZZZZZ'));
    expect(new Set(a).size).toBeGreaterThan(25);
    expect(a).not.toEqual(b);
    for (const i of a) expect(i).toBeGreaterThanOrEqual(0);
    for (const i of a) expect(i).toBeLessThan(60);
  });

  it('fortuneFor trả đúng quẻ theo chỉ số', () => {
    const r = fortuneFor('2026-11-02', 'NV-ABCDEF');
    expect(r.fortune).toBe(KPI_FORTUNES[r.id]);
  });
});

describe('lật task', () => {
  it('chia 3 việc khác nhau', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 50; i += 1) {
      const cards = dealTasks(rng);
      expect(cards).toHaveLength(3);
      expect(new Set(cards).size).toBe(3);
    }
  });

  it('lật một lá, chỉ lật được một lần, rồi đánh dấu hoàn thành', () => {
    let s = deal(seededRng(9));
    expect(chosenTaskId(s)).toBeNull();
    expect(complete(s, 10)).toBe(s);
    s = flip(s, 1, 100);
    expect(s.phase).toBe('flipped');
    expect(chosenTaskId(s)).toBe(s.cards[1]);
    expect(flip(s, 2, 200)).toBe(s);
    s = complete(s, 500);
    expect(s).toMatchObject({ phase: 'done', flippedAt: 100, doneAt: 500 });
  });

  it('lật lá ngoài khoảng thì bỏ qua', () => {
    const s = deal(seededRng(1));
    expect(flip(s, 5, 0)).toBe(s);
    expect(flip(s, -1, 0)).toBe(s);
  });
});

describe('tường than thở', () => {
  it('gộp khoảng trắng, xuống dòng thành một dòng', () => {
    expect(validateVent('  Deadline\n\ndí   quá  ')).toEqual({ ok: true, text: 'Deadline dí quá' });
  });

  it('chặn rỗng và quá dài', () => {
    expect(validateVent('   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(validateVent('a'.repeat(VENT_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(validateVent('a'.repeat(VENT_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      reason: 'too_long',
    });
  });

  it('dòng mới lên đầu, giữ tối đa VENT_LIMIT dòng', () => {
    let list: VentEntry[] = [];
    for (let i = 0; i < VENT_LIMIT + 5; i += 1) {
      list = addVent(list, { id: String(i), text: 'x', author: null, at: i });
    }
    expect(list).toHaveLength(VENT_LIMIT);
    expect(list[0]?.id).toBe(String(VENT_LIMIT + 4));
  });
});

describe('pha cà phê', () => {
  it('pha → chờ → cầm ly → tặng', () => {
    let s = startBrew(IDLE_COFFEE, 1000, 3000);
    expect(s.phase).toBe('brewing');
    expect(startBrew(s, 1500)).toBe(s);
    expect(brewProgress(s, 2500)).toBeCloseTo(0.5);
    expect(tickBrew(s, 3999).ready).toBe(false);
    const r = tickBrew(s, 4000);
    expect(r.ready).toBe(true);
    s = r.state;
    expect(s.phase).toBe('holding');
    expect(startBrew(s, 5000)).toBe(s);
    const given = handOver(s);
    expect(given.ok).toBe(true);
    expect(given.state.phase).toBe('idle');
    expect(handOver(given.state).ok).toBe(false);
  });
});

describe('mã nhân viên', () => {
  it('định dạng NV-XXXXXX, lưu lại dùng lần sau', () => {
    const id = generatePlayerId(() => 7);
    expect(isPlayerId(id)).toBe(true);
    const store = new MemoryStore();
    const created = loadOrCreatePlayerId(store);
    expect(isPlayerId(created)).toBe(true);
    expect(loadOrCreatePlayerId(store)).toBe(created);
  });
});
