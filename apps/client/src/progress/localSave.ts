// Tiến độ cũ lưu trên máy (Phase 2B/3). Phase 4: nhập MỘT lần vào tài khoản trên server qua mã lưu
// (server kiểm tra checksum và giới hạn hợp lý), rồi đánh dấu đã nhập để không gửi lại.
import { createProgress, encodeSaveCode, migrateProgress } from '@dilam/shared';
import type { KeyValueStore } from '../storage';

export const PROGRESS_KEY = 'dilam.progress';
const IMPORTED_KEY = 'dilam.progress.imported';
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

/** Dữ liệu thô đã lưu (chưa migrate), null nếu chưa có. */
function loadRaw(store: KeyValueStore | null): unknown {
  const saved = readJson(store, PROGRESS_KEY);
  if (saved !== null) return saved;
  // Dữ liệu Phase 2B (chưa có tiến độ): gom thành "phiên bản 1" để migrate giữ chuỗi chấm công.
  const checkIn = readJson(store, LEGACY_CHECK_IN_KEY);
  if (checkIn === null) return null;
  const fortune = readJson(store, LEGACY_FORTUNE_KEY) as { day?: unknown } | null;
  return { version: 1, checkIn, fortuneDay: fortune?.day ?? null };
}

/** Mã lưu của tiến độ trên máy cần nhập lên server, hoặc null nếu không có / đã nhập. */
export function pendingLocalSave(store: KeyValueStore | null, now: number): string | null {
  try {
    if (store?.getItem(IMPORTED_KEY)) return null;
  } catch {
    return null;
  }
  const raw = loadRaw(store);
  if (raw === null) return null;
  const migrated = migrateProgress(raw, now);
  if (!migrated.ok) return null;
  // Chưa chơi gì thì không cần nhập.
  const empty = createProgress(migrated.state.createdAt);
  if (migrated.state.xp === 0 && migrated.state.checkIn.total === empty.checkIn.total) return null;
  return encodeSaveCode(migrated.state);
}

/** Đánh dấu đã nhập (hoặc đã bị từ chối hẳn) để không gửi lại. */
export function markLocalSaveImported(store: KeyValueStore | null): void {
  try {
    store?.setItem(IMPORTED_KEY, '1');
  } catch {
    // bỏ qua
  }
}
