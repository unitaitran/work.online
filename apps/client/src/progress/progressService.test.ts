import { makeEvent, PROGRESS_VERSION } from '@dilam/shared';
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../storage';
import { ProgressService } from './progressService';
import { LocalProgressStore, PROGRESS_KEY } from './progressStore';

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

function fakeClock(start: number, today: string) {
  return {
    now: () => start,
    date: () => new Date(start),
    today: () => today,
    offsetMs: () => 0,
    setOffset: () => undefined,
  };
}

const T0 = Date.UTC(2026, 10, 2, 2);
const time = fakeClock(T0, '2026-11-02');

describe('ProgressService + LocalProgressStore', () => {
  it('lưu sau mỗi sự kiện; tải lại thì giữ nguyên tiến độ', async () => {
    const mem = new MemoryStore();
    const a = await ProgressService.create(new LocalProgressStore(mem), 'NV-AAAAAA', time);
    a.handle(makeEvent('checkin', T0, 0, { day: '2026-11-02', streak: 1, total: 1 }));
    expect(a.state.xp).toBe(25);
    const b = await ProgressService.create(new LocalProgressStore(mem), 'NV-AAAAAA', time);
    expect(b.state).toEqual(a.state);
  });

  it('đọc dữ liệu chấm công Phase 2B (chưa có tiến độ) và giữ chuỗi', async () => {
    const mem = new MemoryStore();
    mem.setItem(
      'dilam.checkin.v1',
      JSON.stringify({ lastDay: '2026-11-01', lastAt: T0 - 86_400_000, streak: 3, total: 5 }),
    );
    const s = await ProgressService.create(new LocalProgressStore(mem), 'NV-AAAAAA', time);
    expect(s.state.version).toBe(PROGRESS_VERSION);
    expect(s.state.checkIn.streak).toBe(3);
    expect(JSON.parse(mem.getItem(PROGRESS_KEY) ?? '{}')).toMatchObject({
      version: PROGRESS_VERSION,
    });
    // Chấm hôm nay: chuỗi thành 4.
    s.handle(makeEvent('checkin', T0, 0, { day: '2026-11-02', streak: 0, total: 0 }));
    expect(s.state.checkIn.streak).toBe(4);
  });

  it('dữ liệu lưu hỏng thì bắt đầu mới, không sập', async () => {
    const mem = new MemoryStore();
    mem.setItem(PROGRESS_KEY, '{"version":2,"xp":"rất nhiều"}');
    const s = await ProgressService.create(new LocalProgressStore(mem), 'NV-AAAAAA', time);
    expect(s.state.xp).toBe(0);
  });

  it('nhập mã sai checksum: báo lỗi, tiến độ hiện có không đổi', async () => {
    const mem = new MemoryStore();
    const s = await ProgressService.create(new LocalProgressStore(mem), 'NV-AAAAAA', time);
    s.handle(makeEvent('checkin', T0, 0, { day: '2026-11-02', streak: 1, total: 1 }));
    const saved = mem.getItem(PROGRESS_KEY);
    const code = s.exportCode();
    const bad = `${code.slice(0, -1)}${code.endsWith('0') ? '1' : '0'}`;
    expect(s.importCode(bad)).toEqual({ ok: false, error: 'checksum' });
    expect(mem.getItem(PROGRESS_KEY)).toBe(saved);
    expect(s.state.xp).toBe(25);
  });

  it('xuất mã ở máy A, nhập ở máy B được đúng tiến độ', async () => {
    const a = await ProgressService.create(
      new LocalProgressStore(new MemoryStore()),
      'NV-AAAAAA',
      time,
    );
    a.handle(makeEvent('checkin', T0, 0, { day: '2026-11-02', streak: 1, total: 1 }));
    const b = await ProgressService.create(
      new LocalProgressStore(new MemoryStore()),
      'NV-BBBBBB',
      time,
    );
    expect(b.importCode(a.exportCode())).toEqual({ ok: true });
    expect(b.state).toEqual(a.state);
  });
});
