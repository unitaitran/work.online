// Cửa hàng ở server: mọi giao dịch xu chạy trong transaction và ghi sổ cái.
// Kiểm tra lại số dư BÊN TRONG transaction nên hai yêu cầu mua cùng lúc không làm xu âm.
import {
  equipmentFromIds,
  equippedIds,
  shopItem,
  titleFor,
  type InventoryResponse,
  type ShopError,
} from '@dilam/shared';
import type { Repositories } from '../db/repositories';

export type ShopResult =
  { ok: true; inventory: InventoryResponse } | { ok: false; error: ShopError };

export class ShopService {
  constructor(
    private readonly repos: Repositories,
    private readonly now: () => number,
  ) {}

  inventory(userId: string): InventoryResponse {
    const progress = this.repos.progress.get(userId);
    return {
      coins: progress?.state.coins ?? 0,
      owned: this.repos.inventory.owned(userId),
      equipped: this.repos.inventory.equipped(userId),
    };
  }

  buy(userId: string, itemId: string): ShopResult {
    const item = shopItem(itemId);
    if (!item) return { ok: false, error: 'unknown_item' };
    const error = this.repos.transaction((): ShopError | null => {
      const record = this.repos.progress.get(userId);
      if (!record) return 'unknown_item';
      const state = record.state;
      if (this.repos.inventory.has(userId, itemId)) return 'owned';
      if (item.minTitle !== undefined && titleFor(state.xp) < item.minTitle) return 'locked';
      if (state.coins < item.price) return 'not_enough_coins';
      const at = this.now();
      const balance = state.coins - item.price;
      this.repos.progress.save(userId, { ...state, coins: balance }, at);
      this.repos.inventory.add(userId, itemId, at);
      this.repos.ledger.add(userId, at, -item.price, `buy:${itemId}`, balance);
      return null;
    });
    return error ? { ok: false, error } : { ok: true, inventory: this.inventory(userId) };
  }

  equip(userId: string, itemId: string, equip: boolean): ShopResult {
    const item = shopItem(itemId);
    if (!item) return { ok: false, error: 'unknown_item' };
    if (!this.repos.inventory.has(userId, itemId)) return { ok: false, error: 'not_owned' };
    const current = equipmentFromIds(this.repos.inventory.equipped(userId));
    if (item.category === 'desk') {
      const desk = current.desk.filter((id) => id !== itemId);
      // Đầy chỗ trên bàn: bỏ món đặt lâu nhất.
      if (equip) {
        desk.push(itemId);
        while (desk.length > 3) desk.shift();
      }
      current.desk = desk;
    } else if (equip) {
      current[item.category] = itemId;
    } else if (current[item.category] === itemId) {
      current[item.category] = null;
    }
    this.repos.inventory.setEquipped(userId, equippedIds(current));
    return { ok: true, inventory: this.inventory(userId) };
  }
}

/** Ghi sổ cái cho một khoản xu cộng thêm (đã cộng vào tiến độ). */
export function recordEarn(
  repos: Repositories,
  userId: string,
  at: number,
  delta: number,
  reason: string,
  balance: number,
): void {
  if (delta !== 0) repos.ledger.add(userId, at, delta, reason, balance);
}
