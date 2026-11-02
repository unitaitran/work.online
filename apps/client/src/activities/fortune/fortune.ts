// Xin quẻ KPI: mỗi ngày một quẻ, chọn theo ngày và mã người chơi nên cả ngày không đổi.
import { z } from 'zod';
import { KPI_FORTUNES, type KpiFortune } from '../../data/kpi-fortunes';
import { fortuneIndex as sharedFortuneIndex } from '@dilam/shared';
import type { KeyValueStore } from '../../storage';
import { isDayKey } from '../dayKey';

export function fortuneIndex(day: string, playerId: string, count = KPI_FORTUNES.length): number {
  return sharedFortuneIndex(day, playerId, count);
}

export function fortuneFor(day: string, playerId: string): { id: number; fortune: KpiFortune } {
  const id = fortuneIndex(day, playerId);
  const fortune = KPI_FORTUNES[id] ?? KPI_FORTUNES[0];
  if (!fortune) throw new Error('No fortunes defined');
  return { id, fortune };
}

/** Ngày gần nhất đã xin quẻ (để biết lần xin này là "xem lại"). */
export const FORTUNE_KEY = 'dilam.fortune.v1';

const schema = z.object({ day: z.string().refine(isDayKey) });

export function lastFortuneDay(store: KeyValueStore | null): string | null {
  try {
    const raw = store?.getItem(FORTUNE_KEY);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.day : null;
  } catch {
    return null;
  }
}

export function saveFortuneDay(store: KeyValueStore | null, day: string): void {
  try {
    store?.setItem(FORTUNE_KEY, JSON.stringify({ day }));
  } catch {
    // bỏ qua
  }
}
