import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LADDER,
  entryStepFor,
  GLOBAL_UNLOCK,
  HIRING_MAX_LEVEL,
  ladderUnlockLevels,
  parseLadder,
  stepName,
  validateLadder,
  type CompanyLadder,
} from './hiring';

describe('lộ trình công ty', () => {
  it('lộ trình mặc định hợp lệ', () => {
    expect(validateLadder(DEFAULT_LADDER)).toBeNull();
  });

  it('bậc theo cấp: bậc cao nhất có cấp bắt đầu ≤ cấp hiện tại', () => {
    expect(stepName(DEFAULT_LADDER, 1)).toBe('Intern');
    expect(stepName(DEFAULT_LADDER, 34)).toBe('Fresher');
    expect(stepName(DEFAULT_LADDER, 140)).toBe('Senior');
  });

  it('báo lỗi: cấp không tăng dần, bậc mở khoá không có, mở khoá sớm hơn mức chung', () => {
    const steps = DEFAULT_LADDER.steps;
    expect(validateLadder({ ...DEFAULT_LADDER, steps: [] })).toBe('empty');
    expect(
      validateLadder({
        ...DEFAULT_LADDER,
        steps: [...steps.slice(0, 2).reverse(), ...steps.slice(2)],
      }),
    ).toBe('order');
    expect(validateLadder({ ...DEFAULT_LADDER, branchStep: 9 })).toBe('unlock_step');
    expect(validateLadder({ ...DEFAULT_LADDER, departmentStep: 0 })).toBe('unlock_early');
  });

  it('người ngoài chỉ vào được bậc đang tuyển, và dưới cấp mở công ty', () => {
    const ladder: CompanyLadder = {
      ...DEFAULT_LADDER,
      steps: DEFAULT_LADDER.steps.map((s, i) => ({ ...s, hiring: i !== 0 })),
    };
    expect(entryStepFor(ladder, 5)).toBeNull();
    expect(entryStepFor(ladder, 20)).toBe(1);
    expect(entryStepFor(ladder, HIRING_MAX_LEVEL + 1)).toBeNull();
  });

  it('mốc phòng ban / nhánh không sớm hơn mức chung', () => {
    expect(ladderUnlockLevels(DEFAULT_LADDER)).toEqual({ department: 12, branch: 35 });
    const late = ladderUnlockLevels({ ...DEFAULT_LADDER, departmentStep: 3, branchStep: 4 });
    expect(late.department).toBe(65);
    expect(late.branch).toBe(110);
    expect(late.department).toBeGreaterThanOrEqual(GLOBAL_UNLOCK.department);
  });

  it('đọc từ DB: trống/sai thì mặc định, khung kiểu cũ thì đổi sang lộ trình', () => {
    expect(parseLadder(null)).toBe(DEFAULT_LADDER);
    expect(parseLadder('{oops')).toBe(DEFAULT_LADDER);
    const legacy = parseLadder(
      JSON.stringify({
        intern: null,
        fresher: { min: 12, max: 34 },
        junior: { min: 35, max: 64 },
        middle: null,
        senior: null,
      }),
    );
    expect(legacy.steps.map((s) => s.name)).toEqual(['Fresher', 'Junior']);
    expect(validateLadder(legacy)).toBeNull();
  });
});
