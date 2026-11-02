import { describe, expect, it } from 'vitest';
import { createTokenBucket } from './rateLimit';

function fakeClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('createTokenBucket', () => {
  it('cho gửi dồn tối đa bằng capacity rồi chặn', () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({ capacity: 3, refillPerSecond: 1 }, clock.now);
    expect([1, 2, 3, 4].map(() => bucket.tryConsume())).toEqual([true, true, true, false]);
  });

  it('hồi lượt theo thời gian', () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 2 }, clock.now);
    bucket.tryConsume();
    bucket.tryConsume();
    expect(bucket.tryConsume()).toBe(false);
    clock.advance(499);
    expect(bucket.tryConsume()).toBe(false);
    clock.advance(1);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('không hồi quá capacity dù để lâu', () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({ capacity: 2, refillPerSecond: 10 }, clock.now);
    clock.advance(60_000);
    expect([1, 2, 3].map(() => bucket.tryConsume())).toEqual([true, true, false]);
  });

  it('không cộng lượt khi đồng hồ chạy lùi', () => {
    const clock = fakeClock(10_000);
    const bucket = createTokenBucket({ capacity: 1, refillPerSecond: 1 }, clock.now);
    expect(bucket.tryConsume()).toBe(true);
    clock.advance(-5_000);
    expect(bucket.tryConsume()).toBe(false);
  });
});
