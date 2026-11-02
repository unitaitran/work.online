import { describe, expect, it } from 'vitest';
import { handAngles, vietnamTime } from './wallClock';

describe('đồng hồ giờ Việt Nam', () => {
  it('UTC+7 bất kể múi giờ máy', () => {
    expect(vietnamTime(Date.UTC(2026, 10, 2, 14, 30, 15))).toEqual({ h: 21, m: 30, s: 15 });
    expect(vietnamTime(Date.UTC(2026, 10, 2, 20, 0, 0)).h).toBe(3);
  });

  it('góc kim: 3 giờ đúng = 90°, kim phút 12 giờ', () => {
    const a = handAngles({ h: 15, m: 0, s: 0 });
    expect(a.hour).toBeCloseTo(Math.PI / 2);
    expect(a.minute).toBeCloseTo(0);
  });
});
