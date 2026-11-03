// Rủ cả phòng (cả công ty / cả văn phòng) uống trà sữa: người rủ khao, mỗi cốc 5 xu (kể cả cốc
// của mình). Ai trong phòng cũng nhận lời hoặc từ chối được; server trừ xu của người rủ.

export const MILK_TEA = {
  /** Giá mỗi cốc (xu), người rủ trả. */
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
export type MilkTeaReplyError = 'ended' | 'host_broke' | 'host';
