// Ngoại hình và tên dùng chung với server (@dilam/shared); ở đây chỉ còn phần lưu trên máy.
import {
  appearanceSchema,
  HAIR_COLORS,
  normalizeName,
  SKIN_TONES,
  type Appearance,
  type Profile,
} from '@dilam/shared';
import { z } from 'zod';

export {
  DEFAULT_APPEARANCE,
  HAIR_COLORS,
  HAIR_STYLES,
  NAME_MAX_LENGTH,
  normalizeName,
  OUTFITS,
  SKIN_TONES,
} from '@dilam/shared';
export type { Appearance, HairStyle, Outfit, Profile } from '@dilam/shared';

const storedProfileSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  appearance: appearanceSchema,
});

/** Đọc hồ sơ đã lưu; dữ liệu hỏng hoặc sai phiên bản trả về null. */
export function parseProfile(data: unknown): Profile | null {
  const result = storedProfileSchema.safeParse(data);
  if (!result.success) return null;
  const name = normalizeName(result.data.name);
  if (name === '') return null;
  return { name, appearance: result.data.appearance };
}

export function serializeProfile(profile: Profile): string {
  return JSON.stringify({ version: 1, name: profile.name, appearance: profile.appearance });
}

export function skinColor(appearance: Appearance): number {
  return SKIN_TONES[appearance.skin] ?? SKIN_TONES[0];
}

export function hairColor(appearance: Appearance): number {
  return HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[0];
}
