/** Buổi trong ngày theo giờ thật của máy người chơi. */
export type DayPeriod = 'morning' | 'afternoon' | 'night';
export const DAY_PERIODS: readonly DayPeriod[] = ['morning', 'afternoon', 'night'];

/** Sáng 5:00–11:59, chiều 12:00–17:59, đêm 18:00–4:59. */
export function periodOfDay(date: Date): DayPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'night';
}

export function isDayPeriod(value: unknown): value is DayPeriod {
  return typeof value === 'string' && (DAY_PERIODS as readonly string[]).includes(value);
}

export interface PeriodLighting {
  background: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
}

/**
 * Văn phòng tông đen: nền ngoài tối, ánh sáng chung dịu; ánh sáng ban ngày lạnh vào từ cửa sổ
 * phía bắc, tối thì gần tắt (đèn thả, đèn cây ấm thay vào).
 */
export const PERIOD_LIGHTING: Readonly<Record<DayPeriod, PeriodLighting>> = {
  morning: {
    background: 0x111116,
    hemiSky: 0xe6ecff,
    hemiGround: 0x3a2222,
    hemiIntensity: 1.35,
    sunColor: 0xdfe9ff,
    sunIntensity: 1.6,
  },
  afternoon: {
    background: 0x141114,
    hemiSky: 0xffe8d6,
    hemiGround: 0x3d2420,
    hemiIntensity: 1.3,
    sunColor: 0xffd3a6,
    sunIntensity: 1.45,
  },
  night: {
    background: 0x08080c,
    hemiSky: 0xd8ccff,
    hemiGround: 0x2a1818,
    hemiIntensity: 1.05,
    sunColor: 0x8fa2ff,
    sunIntensity: 0.4,
  },
};
