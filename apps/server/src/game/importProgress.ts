// Nhập tiến độ từ mã lưu cục bộ (Phase 3) vào tài khoản, MỘT lần.
// Không tin dữ liệu client: kiểm tra checksum, rồi giới hạn hợp lý theo thời gian đã chơi.
import {
  BALANCE,
  createProgress,
  decodeSaveCode,
  emptyDaily,
  levelFor,
  type ProgressState,
} from '@dilam/shared';

const DAY_MS = 86_400_000;

/** Giới hạn cho dữ liệu nhập: XP tối đa mỗi ngày đã chơi, cấp tối đa nhận nhập. */
export const IMPORT_LIMITS = {
  maxXpPerDay: 400,
  maxLevel: BALANCE.company.unlockLevel,
  maxReputationPerDay: BALANCE.perDayLimits.coffeeGift + BALANCE.perDayLimits.chore,
};

export type ImportError =
  | 'format'
  | 'checksum'
  | 'version'
  | 'data'
  | 'too_high'
  | 'future'
  | 'already_imported'
  | 'not_fresh';

export function validateImport(
  saveCode: string,
  now: number,
): { ok: true; state: ProgressState } | { ok: false; error: ImportError } {
  const decoded = decodeSaveCode(saveCode, now);
  if (!decoded.ok) return decoded;
  const s = decoded.state;
  if (s.createdAt > now + DAY_MS) return { ok: false, error: 'future' };
  const days = Math.max(1, Math.ceil((now - s.createdAt) / DAY_MS));
  if (
    s.xp > days * IMPORT_LIMITS.maxXpPerDay ||
    levelFor(s.xp) > IMPORT_LIMITS.maxLevel ||
    s.coins > s.xp ||
    s.reputation > days * IMPORT_LIMITS.maxReputationPerDay ||
    s.checkIn.streak > days ||
    s.checkIn.total > days
  ) {
    return { ok: false, error: 'too_high' };
  }
  // Giữ phần đáng giữ; phần theo ngày (giới hạn, việc sếp giao) bắt đầu lại trên server.
  const base = createProgress(s.createdAt);
  return {
    ok: true,
    state: {
      ...base,
      xp: s.xp,
      coins: s.coins,
      reputation: s.reputation,
      branch: s.branch,
      department: s.department,
      checkIn: s.checkIn,
      linesCarry: Math.min(s.linesCarry, BALANCE.lines.per - 1),
      daily: emptyDaily(null),
      log: [],
    },
  };
}

/** Tài khoản còn "mới" (chưa chơi gì đáng kể trên server) thì mới cho nhập đè. */
export function isFresh(state: ProgressState): boolean {
  return state.xp <= 50;
}
