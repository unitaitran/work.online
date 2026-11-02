// Lưu cục bộ (localStorage) có xử lý khi trình duyệt chặn: chế độ riêng tư, chặn cookie,
// hết dung lượng... Mọi hàm ở đây không bao giờ ném lỗi.
import { parseProfile, serializeProfile, type Profile } from './avatar/appearance';
import { isQualityMode, type QualityMode } from './engine/quality';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROFILE_KEY = 'dilam.profile.v1';
export const QUALITY_KEY = 'dilam.quality.v1';
const PROBE_KEY = 'dilam.probe';

/** Trả về localStorage nếu đọc ghi được, null nếu bị chặn hoặc không có. */
export function openLocalStorage(): KeyValueStore | null {
  try {
    const store = globalThis.localStorage as KeyValueStore | undefined;
    if (!store) return null;
    store.setItem(PROBE_KEY, '1');
    store.removeItem(PROBE_KEY);
    return store;
  } catch {
    return null;
  }
}

function readJson(store: KeyValueStore | null, key: string): unknown {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(store: KeyValueStore | null, key: string, value: string): boolean {
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadProfile(store: KeyValueStore | null): Profile | null {
  return parseProfile(readJson(store, PROFILE_KEY));
}

/** Trả về false nếu không lưu được (bị chặn, hết chỗ). */
export function saveProfile(store: KeyValueStore | null, profile: Profile): boolean {
  return write(store, PROFILE_KEY, serializeProfile(profile));
}

export function loadQualityMode(store: KeyValueStore | null): QualityMode {
  const value = readJson(store, QUALITY_KEY);
  return isQualityMode(value) ? value : 'auto';
}

export function saveQualityMode(store: KeyValueStore | null, mode: QualityMode): boolean {
  return write(store, QUALITY_KEY, JSON.stringify(mode));
}
