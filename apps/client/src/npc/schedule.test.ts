import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_SECONDS,
  activityDuration,
  hashString,
  NPC_ACTIVITIES,
  nextActivity,
  seededRng,
} from './schedule';

describe('lịch NPC', () => {
  it('xong việc khác thì quay về làm việc', () => {
    for (const activity of ['coffee', 'meeting', 'stroll'] as const) {
      expect(nextActivity(activity, () => 0.5)).toBe('work');
    }
  });

  it('làm việc xong thì đi cà phê, họp hoặc đi dạo theo trọng số', () => {
    expect(nextActivity('work', () => 0.1)).toBe('coffee');
    expect(nextActivity('work', () => 0.5)).toBe('meeting');
    expect(nextActivity('work', () => 0.9)).toBe('stroll');
    expect(nextActivity('work', () => 0.999999)).toBe('stroll');
  });

  it('chạy lâu thì có đủ mọi hoạt động, không kẹt ở đâu', () => {
    const rng = seededRng(42);
    const seen = new Set<string>();
    let current = nextActivity('work', rng);
    for (let i = 0; i < 200; i += 1) {
      seen.add(current);
      current = nextActivity(current, rng);
    }
    expect([...seen].sort()).toEqual([...NPC_ACTIVITIES].sort());
  });

  it('thời lượng nằm trong khoảng quy định', () => {
    const rng = seededRng(7);
    for (const activity of NPC_ACTIVITIES) {
      const [min, max] = ACTIVITY_SECONDS[activity];
      for (let i = 0; i < 50; i += 1) {
        const d = activityDuration(activity, rng);
        expect(d).toBeGreaterThanOrEqual(min);
        expect(d).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe('ngẫu nhiên có hạt giống', () => {
  it('cùng hạt giống cùng dãy, khác hạt giống khác dãy, luôn trong [0, 1)', () => {
    const a = seededRng(1);
    const b = seededRng(1);
    const c = seededRng(2);
    const seqA = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c())).not.toEqual(seqA);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('hashString ổn định và phân biệt dấu tiếng Việt', () => {
    expect(hashString('Mây Hồng')).toBe(hashString('Mây Hồng'));
    expect(hashString('Mây Hồng')).not.toBe(hashString('May Hong'));
  });
});
