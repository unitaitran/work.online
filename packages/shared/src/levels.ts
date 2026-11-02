// Cấp độ (1–500, tăng tự động theo XP) và chức danh (10 bậc, lên qua kỳ đánh giá).
import { BALANCE } from './balance';

export type Branch = 'specialist' | 'manager';
export const BRANCHES: readonly Branch[] = ['specialist', 'manager'];

export type Department = 'dev' | 'sales' | 'marketing' | 'accounting' | 'hr';
export const DEPARTMENTS: readonly Department[] = ['dev', 'sales', 'marketing', 'accounting', 'hr'];

export const BRANCH_NAMES: Readonly<Record<Branch, string>> = {
  specialist: 'Chuyên môn',
  manager: 'Quản lý',
};

export const DEPARTMENT_NAMES: Readonly<Record<Department, string>> = {
  dev: 'Dev',
  sales: 'Sales',
  marketing: 'Marketing',
  accounting: 'Kế toán',
  hr: 'HR',
};

/** Chức danh 1–5 dùng chung; 6–10 khác nhau theo nhánh. */
const COMMON_TITLES = [
  'Thực tập sinh',
  'Thử việc',
  'Nhân viên chính thức',
  'Chuyên viên',
  'Chuyên viên cao cấp',
] as const;

const BRANCH_TITLES: Readonly<Record<Branch, readonly string[]>> = {
  manager: [
    'Trưởng nhóm',
    'Trưởng phòng',
    'Giám đốc bộ phận',
    'Giám đốc điều hành',
    'Tổng giám đốc',
  ],
  specialist: [
    'Chuyên gia',
    'Chuyên gia cao cấp',
    'Chuyên gia trưởng',
    'Giám đốc chuyên môn',
    'Chuyên gia đầu ngành',
  ],
};

export const TITLE_COUNT = 10;

/** Tên chức danh. Chưa chọn nhánh ở bậc ≥ 6 thì dùng nhánh Quản lý làm tên mặc định. */
export function titleName(title: number, branch: Branch | null): string {
  if (title <= COMMON_TITLES.length)
    return COMMON_TITLES[Math.max(1, title) - 1] ?? COMMON_TITLES[0];
  const list = BRANCH_TITLES[branch ?? 'manager'];
  return (
    list[Math.min(title, TITLE_COUNT) - COMMON_TITLES.length - 1] ?? list[list.length - 1] ?? ''
  );
}

/** Cấp tối thiểu để được xét lên chức danh `title`. */
export function titleMinLevel(title: number): number {
  return BALANCE.titleLevels[Math.min(Math.max(title, 1), TITLE_COUNT) - 1] ?? BALANCE.levels.max;
}

/** Mở khoá theo chức danh và theo cấp (hiển thị cho người chơi). */
export const UNLOCKS: readonly { kind: 'title' | 'level'; at: number; text: string }[] = [
  {
    kind: 'title',
    at: BALANCE.departmentFromTitle,
    text: 'Chọn phòng ban (mỗi phòng có ưu đãi riêng)',
  },
  { kind: 'title', at: BALANCE.branchFromTitle, text: 'Chọn nhánh Chuyên môn hoặc Quản lý' },
  { kind: 'title', at: 6, text: 'Uy tín: được ghi nhận khi giúp đồng nghiệp' },
  {
    kind: 'level',
    at: BALANCE.company.unlockLevel,
    text: 'Mở công ty riêng (cần rời công ty hiện tại)',
  },
];

// ---------------------------------------------------------------------------
// Bảng XP tích luỹ của 500 cấp
// ---------------------------------------------------------------------------

/**
 * XP tích luỹ (chưa làm tròn) để đạt cấp `level`, tính theo "số ngày chơi đều ở mức giới hạn":
 * - Cấp 1 → cấp mở công ty: đúng `daysToCompany` ngày, đường cong luỹ thừa (đầu nhanh, sau chậm).
 * - Sau đó → cấp tối đa: thêm tới `daysToMax` ngày, pha tuyến tính + luỹ thừa để độ dốc liền mạch.
 */
function rawCumulative(level: number): number {
  const { max, daysToCompany, daysToMax, earlyExponent, lateLinearShare, lateExponent } =
    BALANCE.levels;
  const unlock = BALANCE.company.unlockLevel;
  const cap = BALANCE.dailySoftCap;
  if (level <= 1) return 0;
  if (level <= unlock) {
    return cap * daysToCompany * ((level - 1) / (unlock - 1)) ** earlyExponent;
  }
  const x = (level - unlock) / (max - unlock);
  const shape = lateLinearShare * x + (1 - lateLinearShare) * x ** lateExponent;
  return cap * (daysToCompany + (daysToMax - daysToCompany) * shape);
}

/** XP_TABLE[level] = tổng XP cần để đạt cấp đó (XP_TABLE[1] = 0). Tăng nghiêm ngặt. */
export const XP_TABLE: readonly number[] = (() => {
  const table = [0, 0];
  for (let level = 2; level <= BALANCE.levels.max; level += 1) {
    const previous = table[level - 1] ?? 0;
    table.push(Math.max(previous + 1, Math.round(rawCumulative(level))));
  }
  return table;
})();

export const MAX_LEVEL = BALANCE.levels.max;

/** Tổng XP cần để đạt `level`. */
export function xpForLevel(level: number): number {
  const clamped = Math.min(Math.max(Math.floor(level), 1), MAX_LEVEL);
  return XP_TABLE[clamped] ?? 0;
}

/** Cấp hiện tại theo tổng XP (tìm nhị phân). */
export function levelFor(xp: number): number {
  if (!(xp > 0)) return 1;
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((XP_TABLE[mid] ?? Infinity) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface LevelProgress {
  level: number;
  /** XP đã có trong cấp hiện tại. */
  into: number;
  /** XP cần để lên cấp kế (0 nếu đã tối đa). */
  needed: number;
  /** 0..1 */
  ratio: number;
  isMax: boolean;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, ratio: 1, isMax: true };
  const start = xpForLevel(level);
  const needed = xpForLevel(level + 1) - start;
  const into = Math.max(0, xp - start);
  return { level, into, needed, ratio: needed > 0 ? into / needed : 1, isMax: false };
}
