// Nhân vật: ngoại hình và tên hiển thị. Dùng chung client (dựng hình) và server (kiểm tra, lưu).
import { z } from 'zod';

/** 4 màu da (sRGB). Tên hiển thị nằm ở chuỗi của client theo cùng thứ tự. */
export const SKIN_TONES = [0xf8d9c4, 0xebb994, 0xc98d62, 0x8d5a3a] as const;
/** Màu tóc. */
export const HAIR_COLORS = [
  0x2b2326, 0x5c3a28, 0x9b5c33, 0xe3c27a, 0x8c6dbb,
  // Thêm: hồng, đỏ rượu, xanh dương, bạch kim, nâu tro.
  0xf2a0b6, 0x9e2a3a, 0x4a78c2, 0xe8e4dc, 0x7d6e64,
] as const;
export const HAIR_STYLES = [
  'short',
  'bun',
  'long',
  'ponytail',
  'bob',
  'twintails',
  'curly',
  'spiky',
  'braid',
] as const;
export const OUTFITS = [
  'shirt',
  'suit',
  'hoodie',
  'sweater',
  'tee',
  'blouse',
  'dress',
  'cardigan',
  'overalls',
  'aodai',
] as const;

/** Màu áo chọn thêm (chỉ số 0 = màu mặc định của kiểu trang phục). */
export const OUTFIT_COLORS = [
  -1, 0xffffff, 0x2b2b31, 0xd84a4a, 0xf2a0b6, 0xf3c35d, 0x8fbcaa, 0x6f9fd8, 0xb79be0, 0xc98b6b,
] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type Outfit = (typeof OUTFITS)[number];

export interface Appearance {
  /** Chỉ số trong SKIN_TONES. */
  skin: number;
  hairStyle: HairStyle;
  /** Chỉ số trong HAIR_COLORS. */
  hairColor: number;
  outfit: Outfit;
  /** Chỉ số trong OUTFIT_COLORS (0 hoặc không có = màu mặc định của kiểu). */
  outfitColor?: number | undefined;
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

export const appearanceSchema = z.strictObject({
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
  outfitColor: z
    .number()
    .int()
    .min(0)
    .max(OUTFIT_COLORS.length - 1)
    .optional(),
});

/** Nhân vật gửi lên server. Tên được chuẩn hoá; tên rỗng sau chuẩn hoá bị từ chối. */
export const characterSchema = z.strictObject({
  name: z
    .string()
    .max(NAME_MAX_LENGTH * 4)
    .transform(normalizeName)
    .refine((name) => name.length > 0),
  appearance: appearanceSchema,
});
