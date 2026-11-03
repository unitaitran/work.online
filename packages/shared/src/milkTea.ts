// Rủ cả phòng (cả công ty / cả văn phòng) uống trà sữa: mỗi người tự trả 5 xu cho cốc của mình
// (người rủ trả lúc rủ, người khác trả lúc nhận lời), uống xong được XP (BALANCE.milkTea, không
// sinh xu, giới hạn số cốc mỗi ngày). Ai trong phòng cũng nhận lời hoặc từ chối được.

export const MILK_TEA = {
  /** Giá mỗi cốc (xu), ai uống người nấy trả. */
  price: 5,
  /** Lời mời mở trong bao lâu (ms). */
  durationMs: 30_000,
  /** Mỗi người rủ lại sau chừng này (ms). */
  cooldownMs: 5 * 60_000,
} as const;

/** Một lượt rủ uống trà sữa đang mở trong phòng. */
export interface MilkTeaRoundView {
  id: number;
  hostSid: number;
  hostName: string;
  endsAt: number;
  price: number;
}

export type MilkTeaInviteError = 'busy' | 'cooldown' | 'coins' | 'alone';
export type MilkTeaReplyError = 'ended' | 'coins' | 'host';
