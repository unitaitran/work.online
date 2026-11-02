import { decodeSaveCode, PROGRESS_VERSION } from '@dilam/shared';
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../storage';
import { markLocalSaveImported, pendingLocalSave } from './localSave';

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

const T0 = Date.UTC(2026, 10, 2, 2);

describe('nhập tiến độ cũ trên máy', () => {
  it('không có dữ liệu: không cần nhập', () => {
    expect(pendingLocalSave(new MemoryStore(), T0)).toBeNull();
  });

  it('dữ liệu chấm công Phase 2B: tạo mã lưu giữ chuỗi; đánh dấu rồi thì thôi', () => {
    const mem = new MemoryStore();
    mem.setItem(
      'dilam.checkin.v1',
      JSON.stringify({ lastDay: '2026-11-01', lastAt: T0 - 86_400_000, streak: 3, total: 5 }),
    );
    const code = pendingLocalSave(mem, T0);
    expect(code).not.toBeNull();
    const decoded = decodeSaveCode(code ?? '', T0);
    expect(decoded.ok && decoded.state.checkIn.streak).toBe(3);
    expect(decoded.ok && decoded.state.version).toBe(PROGRESS_VERSION);
    markLocalSaveImported(mem);
    expect(pendingLocalSave(mem, T0)).toBeNull();
  });

  it('dữ liệu hỏng: bỏ qua, không sập', () => {
    const mem = new MemoryStore();
    mem.setItem('dilam.progress', '{"version":2,"xp":"rất nhiều"}');
    expect(pendingLocalSave(mem, T0)).toBeNull();
  });
});
