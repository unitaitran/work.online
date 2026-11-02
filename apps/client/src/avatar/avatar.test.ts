import { describe, expect, it } from 'vitest';
import { STRINGS } from '../strings';
import {
  DEFAULT_APPEARANCE,
  NAME_MAX_LENGTH,
  normalizeName,
  parseProfile,
  serializeProfile,
} from './appearance';
import { pick, randomVietnameseName } from './names';
import { blendPose, computePose, POSES } from './pose';

/** Rng trả lần lượt các giá trị cho trước. */
function sequence(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('randomVietnameseName', () => {
  it('ghép họ + tên từ danh sách', () => {
    const name = randomVietnameseName(sequence(0, 0));
    expect(name).toBe(`${STRINGS.names.surnames[0]} ${STRINGS.names.givenNames[0]}`);
  });

  it('rng sát 1 vẫn lấy phần tử cuối, không vượt mảng', () => {
    const name = randomVietnameseName(() => 0.999999);
    expect(name).toBe(
      `${String(STRINGS.names.surnames.at(-1))} ${String(STRINGS.names.givenNames.at(-1))}`,
    );
  });

  it('cố tránh trùng tên đang hiển thị', () => {
    const first = `${STRINGS.names.surnames[0]} ${STRINGS.names.givenNames[0]}`;
    expect(randomVietnameseName(sequence(0, 0, 0.5, 0.5), first)).not.toBe(first);
  });

  it('mọi tên sinh ra đều hợp lệ sau chuẩn hóa', () => {
    for (let i = 0; i < 50; i += 1) {
      const name = randomVietnameseName();
      expect(normalizeName(name)).toBe(name);
    }
  });

  it('pick từ danh sách rỗng thì báo lỗi', () => {
    expect(() => pick([], Math.random)).toThrow();
  });
});

describe('normalizeName', () => {
  it('gộp khoảng trắng, cắt hai đầu, bỏ ký tự điều khiển', () => {
    expect(normalizeName('  Trần \n\t  Thu\u0000 Trang  ')).toBe('Trần Thu Trang');
  });

  it('chuẩn hóa dấu tiếng Việt về dạng dựng sẵn (NFC)', () => {
    expect(normalizeName('Nguyễn')).toBe('Nguyễn');
  });

  it(`cắt tối đa ${String(NAME_MAX_LENGTH)} ký tự, không cắt đôi emoji`, () => {
    const long = '😀'.repeat(40);
    const result = normalizeName(long);
    expect(Array.from(result)).toHaveLength(NAME_MAX_LENGTH);
    expect(result).toBe('😀'.repeat(NAME_MAX_LENGTH));
  });
});

describe('parseProfile', () => {
  const profile = { name: 'Lê Minh Khôi', appearance: DEFAULT_APPEARANCE };

  it('đọc lại đúng hồ sơ đã lưu', () => {
    expect(parseProfile(JSON.parse(serializeProfile(profile)))).toEqual(profile);
  });

  it.each([
    ['null', null],
    ['thiếu version', { name: 'A', appearance: DEFAULT_APPEARANCE }],
    ['version lạ', { version: 2, name: 'A', appearance: DEFAULT_APPEARANCE }],
    ['tên rỗng', { version: 1, name: '   ', appearance: DEFAULT_APPEARANCE }],
    [
      'màu da ngoài danh sách',
      { version: 1, name: 'A', appearance: { ...DEFAULT_APPEARANCE, skin: 9 } },
    ],
    [
      'kiểu tóc lạ',
      { version: 1, name: 'A', appearance: { ...DEFAULT_APPEARANCE, hairStyle: 'mohawk' } },
    ],
    [
      'trang phục lạ',
      { version: 1, name: 'A', appearance: { ...DEFAULT_APPEARANCE, outfit: 'pyjama' } },
    ],
  ])('từ chối: %s', (_label, data) => {
    expect(parseProfile(data)).toBeNull();
  });
});

describe('tư thế', () => {
  it('mọi tư thế đều cho số hữu hạn', () => {
    for (const pose of POSES) {
      for (const t of [0, 0.37, 5, 123.4]) {
        for (const value of Object.values(computePose(pose, t))) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });

  it('đi bộ: hai chân và hai tay đánh ngược nhau', () => {
    const p = computePose('walk', 0.15);
    expect(Math.sign(p.legLeftX)).toBe(-Math.sign(p.legRightX));
    expect(Math.sign(p.armLeftX)).toBe(-Math.sign(p.armRightX));
    expect(Math.sign(p.armLeftX)).toBe(-Math.sign(p.legLeftX));
  });

  it('ngồi và gõ phím: chân đưa ra trước gần vuông góc', () => {
    for (const pose of ['sit', 'type'] as const) {
      const p = computePose(pose, 1);
      expect(p.legLeftX).toBeLessThan(-1.2);
      expect(p.legRightX).toBeLessThan(-1.2);
    }
  });

  it('gõ phím: hai tay đưa ra trước', () => {
    const p = computePose('type', 0.5);
    expect(p.armLeftX).toBeLessThan(-1);
    expect(p.armRightX).toBeLessThan(-1);
  });

  it('blendPose: k = 0 giữ nguyên, k = 1 tới đích, k = 0.5 ở giữa', () => {
    const a = computePose('stand', 0);
    const b = computePose('sit', 0);
    expect(blendPose(a, b, 0)).toEqual(a);
    expect(blendPose(a, b, 1)).toEqual(b);
    expect(blendPose(a, b, 0.5).legLeftX).toBeCloseTo((a.legLeftX + b.legLeftX) / 2);
  });
});
