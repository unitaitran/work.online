// Cửa hàng công ty: CEO tiêu quỹ công ty (xu trong game, không phải tiền thật) cho đổi tên,
// đồ phòng nghỉ, decor bàn cho mọi người và đồng phục (mỗi người tự chọn mặc hay không).
import { z } from 'zod';
import { COMPANY_COLORS, type CompanyEconomy } from './company';

export type CompanyPerk = 'massage' | 'console' | 'deskDecor' | 'uniform';
export const COMPANY_PERKS: readonly CompanyPerk[] = ['massage', 'console', 'deskDecor', 'uniform'];

/** Giá (xu trừ vào quỹ công ty). Đồ mua một lần dùng mãi; đổi tên / màu đồng phục trả mỗi lần. */
export const COMPANY_SHOP = {
  rename: 600,
  perks: { massage: 1500, console: 1200, deskDecor: 900, uniform: 2000 } as Readonly<
    Record<CompanyPerk, number>
  >,
  /** Đổi màu đồng phục sau khi đã mua. */
  uniformRecolor: 300,
} as const;

export const companyBuySchema = z.strictObject({
  perk: z.enum(['massage', 'console', 'deskDecor', 'uniform']),
  /** Màu đồng phục (chỉ số COMPANY_COLORS), chỉ dùng khi mua đồng phục. */
  color: z
    .number()
    .int()
    .min(0)
    .max(COMPANY_COLORS.length - 1)
    .optional(),
});
export const companyRenameSchema = z.strictObject({ name: z.string().min(1).max(64) });
export const uniformColorSchema = z.strictObject({
  color: z
    .number()
    .int()
    .min(0)
    .max(COMPANY_COLORS.length - 1),
});
export const uniformWearSchema = z.strictObject({ wear: z.boolean() });

/** Chỗ đặt đồ phòng nghỉ (khoảng trống trong phòng nghỉ, không chặn lối sofa / ghế dài). */
export const PERK_SPOTS = {
  /** Ghế massage sát vách tây phòng nghỉ, quay mặt vào phòng (+X). */
  massage: { x: 4.5, z: 5.5, facing: Math.PI / 2 },
  /**
   * Máy chơi game + TV sát vách kính bắc phòng nghỉ (lệch đông, tránh cửa x 4,5-5,5);
   * đệm ngồi trước TV, quay về TV (-Z).
   */
  console: { x: 7.6, z: 2.95, tvZ: 2.12, facing: Math.PI },
} as const;

/** Màu đồng phục (hex) nếu công ty đã mua đồng phục, không thì null. */
export function uniformHex(economy: CompanyEconomy): number | null {
  if (!(economy.perks ?? []).includes('uniform')) return null;
  return COMPANY_COLORS[economy.uniformColor ?? 0] ?? COMPANY_COLORS[0];
}
