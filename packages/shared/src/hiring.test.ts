import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HIRING_BANDS,
  memberPosition,
  parseBands,
  positionFor,
  validateBands,
  type HiringBands,
} from './hiring';
import { PROVINCES } from './provinces';

describe('khung cấp tuyển dụng', () => {
  it('mặc định hợp lệ, phủ cấp 1 tới trước cấp mở công ty', () => {
    expect(validateBands(DEFAULT_HIRING_BANDS)).toBeNull();
    expect(positionFor(DEFAULT_HIRING_BANDS, 1)).toBe('intern');
    expect(positionFor(DEFAULT_HIRING_BANDS, 40)).toBe('junior');
    expect(positionFor(DEFAULT_HIRING_BANDS, 149)).toBe('senior');
    expect(positionFor(DEFAULT_HIRING_BANDS, 150)).toBeNull();
  });

  it('chồng nhau, ngược thứ tự, hoặc không mở vị trí nào thì không hợp lệ', () => {
    const base: HiringBands = { ...DEFAULT_HIRING_BANDS };
    expect(validateBands({ ...base, fresher: { min: 5, max: 40 } })).toBe('overlap');
    expect(validateBands({ ...base, junior: { min: 60, max: 40 } })).toBe('order');
    expect(
      validateBands({ intern: null, fresher: null, junior: null, middle: null, senior: null }),
    ).toBe('empty');
  });

  it('nhân viên giữa hai khung lấy vị trí cao nhất đã đạt; JSON hỏng thì dùng mặc định', () => {
    const bands: HiringBands = {
      intern: { min: 1, max: 5 },
      fresher: null,
      junior: { min: 30, max: 60 },
      middle: null,
      senior: null,
    };
    expect(memberPosition(bands, 20)).toBe('intern');
    expect(memberPosition(bands, 90)).toBe('junior');
    expect(parseBands('{"x":1}')).toBe(DEFAULT_HIRING_BANDS);
    expect(parseBands(JSON.stringify(bands))).toEqual(bands);
  });
});

describe('tỉnh/thành', () => {
  it('đủ 34 đơn vị: 6 thành phố, 28 tỉnh, mã không trùng', () => {
    expect(PROVINCES).toHaveLength(34);
    expect(PROVINCES.filter((p) => p.city)).toHaveLength(6);
    expect(new Set(PROVINCES.map((p) => p.id)).size).toBe(34);
  });
});
