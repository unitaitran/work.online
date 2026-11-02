import { z } from 'zod';

/** 4 màu da (sRGB). Tên hiển thị nằm ở STRINGS.skinTones theo cùng thứ tự. */
export const SKIN_TONES = [0xf8d9c4, 0xebb994, 0xc98d62, 0x8d5a3a] as const;
/** Màu tóc. Tên hiển thị ở STRINGS.hairColors. */
export const HAIR_COLORS = [0x2b2326, 0x5c3a28, 0x9b5c33, 0xe3c27a, 0x8c6dbb] as const;
export const HAIR_STYLES = ['short', 'bun', 'long', 'ponytail'] as const;
export const OUTFITS = ['shirt', 'suit', 'hoodie', 'sweater'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type Outfit = (typeof OUTFITS)[number];

export interface Appearance {
  /** Chỉ số trong SKIN_TONES. */
  skin: number;
  hairStyle: HairStyle;
  /** Chỉ số trong HAIR_COLORS. */
  hairColor: number;
  outfit: Outfit;
}

export interface Profile {
  name: string;
  appearance: Appearance;
}

export const NAME_MAX_LENGTH = 24;

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 1,
  hairStyle: 'short',
  hairColor: 0,
  outfit: 'shirt',
};

/** Bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài (đếm theo ký tự, không cắt đôi emoji). */
export function normalizeName(raw: string): string {
  const cleaned = raw.normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  return Array.from(cleaned).slice(0, NAME_MAX_LENGTH).join('').trim();
}

const appearanceSchema = z.object({
  skin: z
    .number()
    .int()
    .min(0)
    .max(SKIN_TONES.length - 1),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: z
    .number()
    .int()
    .min(0)
    .max(HAIR_COLORS.length - 1),
  outfit: z.enum(OUTFITS),
});

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
