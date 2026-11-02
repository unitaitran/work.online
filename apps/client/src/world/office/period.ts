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
  /**
   * Hệ số nhân màu sàn và tường (1 = giữ tông đen xám gốc). Ban ngày > 1 để phòng thật sự sáng
   * (sàn đá và tường vữa vốn tối, chỉ tăng đèn thì vẫn trông như buổi tối).
   */
  surfaceBoost: number;
}

/**
 * Văn phòng tông đen xám: ban ngày nắng tràn qua cửa kính, phòng sáng sủa, nền ngoài là trời sáng;
 * ban đêm gần tắt nắng, chỉ còn đèn thả và đèn cây ấm.
 */
export const PERIOD_LIGHTING: Readonly<Record<DayPeriod, PeriodLighting>> = {
  morning: {
    background: 0xdfe8f2,
    hemiSky: 0xffffff,
    hemiGround: 0xb0aaa2,
    hemiIntensity: 3.3,
    sunColor: 0xfff6e8,
    sunIntensity: 3.6,
    surfaceBoost: 2.5,
  },
  afternoon: {
    background: 0xf2e6d8,
    hemiSky: 0xfff4e6,
    hemiGround: 0xb0a292,
    hemiIntensity: 3.0,
    sunColor: 0xffdcb0,
    sunIntensity: 3.3,
    surfaceBoost: 2.3,
  },
  night: {
    background: 0x08080c,
    hemiSky: 0xd8ccff,
    hemiGround: 0x2a1818,
    hemiIntensity: 1.05,
    sunColor: 0x8fa2ff,
    sunIntensity: 0.4,
    surfaceBoost: 1,
  },
};
