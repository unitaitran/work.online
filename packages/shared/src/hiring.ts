// Khung cấp tuyển dụng do CEO đặt: cấp bao nhiêu đến bao nhiêu thì vào vị trí nào.
// Người xin việc phải có cấp nằm trong một khung đang mở; vị trí của nhân viên tính theo cấp
// hiện tại (lên cấp là tự lên vị trí).
import { z } from 'zod';
import { BALANCE } from './balance';

export const POSITIONS = ['intern', 'fresher', 'junior', 'middle', 'senior'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_NAMES: Readonly<Record<Position, string>> = {
  intern: 'Intern',
  fresher: 'Fresher',
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
};

export interface LevelBand {
  min: number;
  max: number;
}

/** Mỗi vị trí một khung; null = không tuyển vị trí này. */
export type HiringBands = Readonly<Record<Position, LevelBand | null>>;

/** Người đã đủ cấp mở công ty thì không xin làm nhân viên nữa: khung tối đa tới cấp này. */
export const HIRING_MAX_LEVEL = BALANCE.company.unlockLevel - 1;

export const DEFAULT_HIRING_BANDS: HiringBands = {
  intern: { min: 1, max: 11 },
  fresher: { min: 12, max: 34 },
  junior: { min: 35, max: 64 },
  middle: { min: 65, max: 109 },
  senior: { min: 110, max: HIRING_MAX_LEVEL },
};

const bandSchema = z
  .strictObject({
    min: z.number().int().min(1).max(HIRING_MAX_LEVEL),
    max: z.number().int().min(1).max(HIRING_MAX_LEVEL),
  })
  .nullable();

/** Khung hợp lệ: min ≤ max, các vị trí tăng dần và không chồng lên nhau, có ít nhất một khung. */
export const hiringBandsSchema = z
  .strictObject({
    intern: bandSchema,
    fresher: bandSchema,
    junior: bandSchema,
    middle: bandSchema,
    senior: bandSchema,
  })
  .refine((bands) => validateBands(bands) === null);

export const setHiringSchema = z.strictObject({
  bands: hiringBandsSchema,
  hiring: z.boolean().optional(),
});

export type BandError = 'empty' | 'order' | 'overlap';

export function validateBands(bands: HiringBands): BandError | null {
  let previousMax = 0;
  let any = false;
  for (const position of POSITIONS) {
    const band = bands[position];
    if (!band) continue;
    any = true;
    if (band.min > band.max) return 'order';
    if (band.min <= previousMax) return 'overlap';
    previousMax = band.max;
  }
  return any ? null : 'empty';
}

/** Vị trí ứng với cấp (null: không thuộc khung nào). */
export function positionFor(bands: HiringBands, level: number): Position | null {
  for (const position of POSITIONS) {
    const band = bands[position];
    if (band && level >= band.min && level <= band.max) return position;
  }
  return null;
}

/**
 * Vị trí của nhân viên đang làm: nằm giữa hai khung (CEO đổi khung sau khi nhận) thì lấy vị trí
 * cao nhất có min ≤ cấp; thấp hơn mọi khung thì lấy vị trí thấp nhất đang mở.
 */
export function memberPosition(bands: HiringBands, level: number): Position {
  let result: Position | null = null;
  let lowest: Position | null = null;
  for (const position of POSITIONS) {
    const band = bands[position];
    if (!band) continue;
    lowest ??= position;
    if (level >= band.min) result = position;
  }
  return result ?? lowest ?? 'intern';
}

/** Đọc khung từ chuỗi JSON lưu DB (sai hoặc trống thì dùng mặc định). */
export function parseBands(raw: string | null): HiringBands {
  if (!raw) return DEFAULT_HIRING_BANDS;
  try {
    const parsed = hiringBandsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_HIRING_BANDS;
  } catch {
    return DEFAULT_HIRING_BANDS;
  }
}
