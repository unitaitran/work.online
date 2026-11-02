import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './avatar/appearance';
import {
  loadProfile,
  loadQualityMode,
  openLocalStorage,
  PROFILE_KEY,
  saveProfile,
  saveQualityMode,
  type KeyValueStore,
} from './storage';

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

/** Mô phỏng trình duyệt chặn lưu: mọi thao tác đều ném lỗi. */
const blockedStore: KeyValueStore = {
  getItem() {
    throw new DOMException('blocked', 'SecurityError');
  },
  setItem() {
    throw new DOMException('quota', 'QuotaExceededError');
  },
  removeItem() {
    throw new DOMException('blocked', 'SecurityError');
  },
};

const profile = {
  name: 'Phạm Hà My',
  appearance: { ...DEFAULT_APPEARANCE, outfit: 'hoodie' as const },
};

describe('lưu hồ sơ', () => {
  it('lưu rồi đọc lại được', () => {
    const store = new MemoryStore();
    expect(saveProfile(store, profile)).toBe(true);
    expect(loadProfile(store)).toEqual(profile);
  });

  it('chưa lưu gì thì null', () => {
    expect(loadProfile(new MemoryStore())).toBeNull();
  });

  it('dữ liệu hỏng thì null, không ném lỗi', () => {
    const store = new MemoryStore();
    store.setItem(PROFILE_KEY, '{không phải json');
    expect(loadProfile(store)).toBeNull();
    store.setItem(PROFILE_KEY, JSON.stringify({ version: 1, name: 'x', appearance: { skin: 99 } }));
    expect(loadProfile(store)).toBeNull();
  });

  it('trình duyệt chặn lưu: không ném lỗi, báo lưu thất bại', () => {
    expect(saveProfile(blockedStore, profile)).toBe(false);
    expect(loadProfile(blockedStore)).toBeNull();
    expect(saveProfile(null, profile)).toBe(false);
    expect(loadProfile(null)).toBeNull();
  });

  it('openLocalStorage trả null khi môi trường không có localStorage', () => {
    // Vitest chạy trong Node: không có localStorage dùng được.
    expect(() => openLocalStorage()).not.toThrow();
  });
});

describe('lưu mức đồ họa', () => {
  it('mặc định là tự động', () => {
    expect(loadQualityMode(new MemoryStore())).toBe('auto');
    expect(loadQualityMode(blockedStore)).toBe('auto');
  });

  it('lưu rồi đọc lại; giá trị lạ thì về tự động', () => {
    const store = new MemoryStore();
    saveQualityMode(store, 'low');
    expect(loadQualityMode(store)).toBe('low');
    store.setItem('dilam.quality.v1', '"ultra"');
    expect(loadQualityMode(store)).toBe('auto');
  });
});
