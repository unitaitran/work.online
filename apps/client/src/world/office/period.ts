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

/** Ánh sáng trong phòng theo buổi: đêm thì nắng gần tắt, đèn trần ấm thay vào. */
export const PERIOD_LIGHTING: Readonly<Record<DayPeriod, PeriodLighting>> = {
  morning: {
    background: 0xfdf3e7,
    hemiSky: 0xfff6ea,
    hemiGround: 0xc9a98a,
    hemiIntensity: 1.7,
    sunColor: 0xffffff,
    sunIntensity: 2.1,
  },
  afternoon: {
    background: 0xfbe6d2,
    hemiSky: 0xffe9d2,
    hemiGround: 0xc49478,
    hemiIntensity: 1.55,
    sunColor: 0xffc58f,
    sunIntensity: 1.9,
  },
  night: {
    background: 0x2a2a44,
    hemiSky: 0xfff0dc,
    hemiGround: 0x6d5a6a,
    hemiIntensity: 1.35,
    sunColor: 0x9fb4ff,
    sunIntensity: 0.55,
  },
};
