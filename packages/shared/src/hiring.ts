// Lộ trình riêng của công ty người chơi (CEO đặt): tối đa 10 bậc, mỗi bậc có tên chức danh, cấp
// bắt đầu và có đang tuyển hay không. Nhân viên đứng ở bậc cao nhất có cấp bắt đầu ≤ cấp hiện tại
// (lên cấp là tự lên bậc). CEO cũng đặt từ bậc nào được chọn phòng ban / nhánh, nhưng không sớm hơn
// mức chung của trò chơi (giữ cân bằng: phòng ban cho thêm XP).
import { z } from 'zod';
import { BALANCE } from './balance';
import { titleMinLevel } from './levels';

export interface LadderStep {
  /** Tên chức danh ở công ty này (qua bộ lọc từ cấm ở server). */
  name: string;
  /** Cấp bắt đầu của bậc. */
  minLevel: number;
  /** Đang tuyển người ngoài vào bậc này. */
  hiring: boolean;
}

export interface CompanyLadder {
  steps: LadderStep[];
  /** Từ bậc thứ mấy (chỉ số trong steps) được chọn phòng ban. */
  departmentStep: number;
  /** Từ bậc thứ mấy được chọn nhánh sự nghiệp. */
  branchStep: number;
}

export const MAX_LADDER_STEPS = 10;
export const LADDER_NAME_MAX = 24;

/** Người đã đủ cấp mở công ty thì không xin làm nhân viên nữa: lộ trình tối đa tới cấp này. */
export const HIRING_MAX_LEVEL = BALANCE.company.unlockLevel - 1;

/** Mức chung của trò chơi: cấp tối thiểu để chọn phòng ban / nhánh. */
export const GLOBAL_UNLOCK = {
  department: titleMinLevel(BALANCE.departmentFromTitle),
  branch: titleMinLevel(BALANCE.branchFromTitle),
} as const;

/** Lộ trình mặc định của công ty mới (giống 5 vị trí cũ). */
export const DEFAULT_LADDER: CompanyLadder = {
  steps: [
    { name: 'Intern', minLevel: 1, hiring: true },
    { name: 'Fresher', minLevel: 12, hiring: true },
    { name: 'Junior', minLevel: 35, hiring: true },
    { name: 'Middle', minLevel: 65, hiring: true },
    { name: 'Senior', minLevel: 110, hiring: true },
  ],
  departmentStep: 1,
  branchStep: 2,
};

const stepSchema = z.strictObject({
  name: z.string().trim().min(1).max(LADDER_NAME_MAX),
  minLevel: z.number().int().min(1).max(HIRING_MAX_LEVEL),
  hiring: z.boolean(),
});

export const ladderSchema = z.strictObject({
  steps: z.array(stepSchema).min(1).max(MAX_LADDER_STEPS),
  departmentStep: z
    .number()
    .int()
    .min(0)
    .max(MAX_LADDER_STEPS - 1),
  branchStep: z
    .number()
    .int()
    .min(0)
    .max(MAX_LADDER_STEPS - 1),
});

export const setHiringSchema = z.strictObject({
  ladder: ladderSchema,
  hiring: z.boolean().optional(),
});

export type LadderError = 'empty' | 'order' | 'unlock_step' | 'unlock_early';

/**
 * Lộ trình hợp lệ: có ít nhất một bậc, cấp bắt đầu tăng dần, bậc mở khoá có thật và không mở
 * khoá phòng ban / nhánh sớm hơn mức chung.
 */
export function validateLadder(ladder: CompanyLadder): LadderError | null {
  const { steps } = ladder;
  if (steps.length === 0) return 'empty';
  for (let i = 1; i < steps.length; i += 1) {
    if ((steps[i]?.minLevel ?? 0) <= (steps[i - 1]?.minLevel ?? 0)) return 'order';
  }
  const dept = steps[ladder.departmentStep];
  const branch = steps[ladder.branchStep];
  if (!dept || !branch) return 'unlock_step';
  if (dept.minLevel < GLOBAL_UNLOCK.department || branch.minLevel < GLOBAL_UNLOCK.branch) {
    return 'unlock_early';
  }
  return null;
}

/** Bậc của nhân viên: bậc cao nhất có cấp bắt đầu ≤ cấp hiện tại (thấp hơn mọi bậc thì bậc đầu). */
export function stepFor(ladder: CompanyLadder, level: number): number {
  let index = 0;
  ladder.steps.forEach((step, i) => {
    if (level >= step.minLevel) index = i;
  });
  return index;
}

/** Bậc người ngoài vào được (bậc ứng với cấp đang tuyển); null nếu không vào được. */
export function entryStepFor(ladder: CompanyLadder, level: number): number | null {
  if (level > HIRING_MAX_LEVEL) return null;
  const first = ladder.steps[0];
  if (!first || level < first.minLevel) return null;
  const index = stepFor(ladder, level);
  return ladder.steps[index]?.hiring ? index : null;
}

/** Tên chức danh ở bậc ứng với cấp. */
export function stepName(ladder: CompanyLadder, level: number): string {
  return ladder.steps[stepFor(ladder, level)]?.name ?? '';
}

/** Cấp thực tế mở khoá chọn phòng ban / nhánh ở công ty này (không sớm hơn mức chung). */
export function ladderUnlockLevels(ladder: CompanyLadder): { department: number; branch: number } {
  return {
    department: Math.max(
      GLOBAL_UNLOCK.department,
      ladder.steps[ladder.departmentStep]?.minLevel ?? GLOBAL_UNLOCK.department,
    ),
    branch: Math.max(
      GLOBAL_UNLOCK.branch,
      ladder.steps[ladder.branchStep]?.minLevel ?? GLOBAL_UNLOCK.branch,
    ),
  };
}

/** Khung tuyển dụng kiểu cũ (5 vị trí cố định) còn lưu trong DB: đổi sang lộ trình. */
const legacyBandsSchema = z.object({
  intern: z.object({ min: z.number(), max: z.number() }).nullable().optional(),
  fresher: z.object({ min: z.number(), max: z.number() }).nullable().optional(),
  junior: z.object({ min: z.number(), max: z.number() }).nullable().optional(),
  middle: z.object({ min: z.number(), max: z.number() }).nullable().optional(),
  senior: z.object({ min: z.number(), max: z.number() }).nullable().optional(),
});

function fromLegacy(bands: z.infer<typeof legacyBandsSchema>): CompanyLadder | null {
  const names = ['Intern', 'Fresher', 'Junior', 'Middle', 'Senior'] as const;
  const keys = ['intern', 'fresher', 'junior', 'middle', 'senior'] as const;
  const steps: LadderStep[] = [];
  keys.forEach((key, i) => {
    const band = bands[key];
    if (band) steps.push({ name: names[i] ?? key, minLevel: band.min, hiring: true });
  });
  if (steps.length === 0) return null;
  const at = (level: number): number =>
    Math.max(
      0,
      steps.findIndex((s) => s.minLevel >= level),
    );
  const ladder: CompanyLadder = {
    steps,
    departmentStep: at(GLOBAL_UNLOCK.department),
    branchStep: at(GLOBAL_UNLOCK.branch),
  };
  return validateLadder(ladder) === null ? ladder : null;
}

/** Đọc lộ trình từ chuỗi JSON lưu DB (khung kiểu cũ thì đổi sang; sai hoặc trống thì mặc định). */
export function parseLadder(raw: string | null): CompanyLadder {
  if (!raw) return DEFAULT_LADDER;
  try {
    const data = JSON.parse(raw) as unknown;
    const ladder = ladderSchema.safeParse(data);
    if (ladder.success && validateLadder(ladder.data) === null) return ladder.data;
    const legacy = legacyBandsSchema.safeParse(data);
    return (legacy.success ? fromLegacy(legacy.data) : null) ?? DEFAULT_LADDER;
  } catch {
    return DEFAULT_LADDER;
  }
}
