import { actionSchema, KPI_FORTUNE_COUNT, makeEvent } from '@dilam/shared';
import { describe, expect, it } from 'vitest';
import { KPI_FORTUNES } from '../data/kpi-fortunes';
import { actionForEvent } from './eventActions';

describe('sự kiện -> hành động gửi server', () => {
  it('không gửi XP hay thời lượng; hành động hợp lệ theo schema', () => {
    const events = [
      makeEvent('focus-typing', 0, 300_000, {
        plannedMs: 300_000,
        presses: 90,
        scoredKeys: 80,
        lines: 80,
        completed: true,
      }),
      makeEvent('kpi-fortune', 0, 0, { day: '2026-11-02', fortuneId: 3, repeat: false }),
      makeEvent('task-flip', 0, 0, { taskId: 4, completed: true }),
      makeEvent('coffee-gift', 0, 0, { npcId: 'npc-2' }),
      makeEvent('coffee-drink', 0, 0, {}),
      makeEvent('chore', 0, 0, { target: 'plant-1' }),
      makeEvent('print', 0, 0, {}),
      makeEvent('meeting', 0, 999_999, { seatId: 'meeting-0' }),
      makeEvent('vent', 0, 0, { length: 12, anonymous: true }),
    ];
    for (const event of events) {
      const action = actionForEvent(event);
      expect(action).not.toBeNull();
      expect(actionSchema.safeParse(action).success).toBe(true);
      expect(JSON.stringify(action)).not.toMatch(/xp|durationMs|streak/i);
    }
  });

  it('chấm công và pha cà phê gửi trực tiếp (không qua bus)', () => {
    expect(
      actionForEvent(makeEvent('checkin', 0, 0, { day: 'x', streak: 9, total: 9 })),
    ).toBeNull();
    expect(actionForEvent(makeEvent('coffee-brew', 0, 0, { brewMs: 1 }))).toBeNull();
  });

  it('số quẻ KPI khớp với server', () => {
    expect(KPI_FORTUNES.length).toBe(KPI_FORTUNE_COUNT);
  });
});
