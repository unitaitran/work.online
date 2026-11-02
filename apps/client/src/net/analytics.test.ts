import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../storage';
import { analyticsEnabled, setAnalyticsEnabled } from './analytics';

class Mem implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('thống kê ẩn danh', () => {
  it('mặc định bật, Do Not Track thì tắt; người chơi tự chọn được', () => {
    const m = new Mem();
    expect(analyticsEnabled(m, null)).toBe(true);
    expect(analyticsEnabled(m, '1')).toBe(false);
    setAnalyticsEnabled(m, false);
    expect(analyticsEnabled(m, null)).toBe(false);
    setAnalyticsEnabled(m, true);
    expect(analyticsEnabled(m, '1')).toBe(true);
  });
});
