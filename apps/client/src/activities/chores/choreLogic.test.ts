import { seededRng } from '@dilam/shared';
import { describe, expect, it } from 'vitest';
import { CHORE_SECONDS, newTidyCups, TIDY_CUPS, waterResult, WATER_ZONE } from './choreLogic';

describe('mini-game công quả', () => {
  it('mỗi trò 5-10 giây', () => {
    for (const s of Object.values(CHORE_SECONDS)) {
      expect(s).toBeGreaterThanOrEqual(5);
      expect(s).toBeLessThanOrEqual(10);
    }
  });

  it('tưới cây: thiếu, vừa, tràn', () => {
    expect(waterResult(0.3)).toBe('low');
    expect(waterResult(WATER_ZONE.min)).toBe('ok');
    expect(waterResult(WATER_ZONE.max)).toBe('ok');
    expect(waterResult(1)).toBe('over');
  });

  it('dọn pantry: đủ cốc, không chồng nhau', () => {
    const cups = newTidyCups(seededRng(7));
    expect(cups).toHaveLength(TIDY_CUPS);
    for (const a of cups)
      for (const b of cups)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(18);
  });
});
