// Nơi lưu tiến độ. Phase 3: LocalProgressStore (localStorage).
// Phase 4 thay bằng ServerProgressStore cùng interface (server mới là nguồn sự thật).
import type { ProgressState } from '@dilam/shared';
import type { KeyValueStore } from '../storage';

export interface ProgressStore {
  /** Dữ liệu thô đã lưu (chưa migrate), null nếu chưa có. */
  load(): Promise<unknown>;
  save(state: ProgressState): Promise<void>;
}

export const PROGRESS_KEY = 'dilam.progress';
const LEGACY_CHECK_IN_KEY = 'dilam.checkin.v1';
const LEGACY_FORTUNE_KEY = 'dilam.fortune.v1';

function readJson(store: KeyValueStore | null, key: string): unknown {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export class LocalProgressStore implements ProgressStore {
  constructor(private readonly store: KeyValueStore | null) {}

  load(): Promise<unknown> {
    const saved = readJson(this.store, PROGRESS_KEY);
    if (saved !== null) return Promise.resolve(saved);
    // Dữ liệu Phase 2B (chưa có tiến độ): gom thành "phiên bản 1" để migrate giữ chuỗi chấm công.
    const checkIn = readJson(this.store, LEGACY_CHECK_IN_KEY);
    if (checkIn === null) return Promise.resolve(null);
    const fortune = readJson(this.store, LEGACY_FORTUNE_KEY) as { day?: unknown } | null;
    return Promise.resolve({ version: 1, checkIn, fortuneDay: fortune?.day ?? null });
  }

  save(state: ProgressState): Promise<void> {
    try {
      this.store?.setItem(PROGRESS_KEY, JSON.stringify(state));
    } catch {
      // Hết chỗ hoặc bị chặn: tiến độ chỉ còn trong phiên này.
    }
    return Promise.resolve();
  }
}
