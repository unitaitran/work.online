import type { Vec2 } from './collision';
import type { Interactable } from './office/layout';

/** Lại gần trong khoảng này (mét, tính tới chỗ đứng dùng vật) thì hiện gợi ý "Chạm để dùng". */
export const INTERACT_RADIUS = 1.4;
/** Đứng cách chỗ dùng vật dưới mức này thì dùng luôn, không cần đi thêm. */
export const ARRIVE_RADIUS = 0.08;

/** Vật gần nhất trong tầm với, hoặc null. */
export function nearestInteractable(
  position: Vec2,
  items: readonly Interactable[],
  radius = INTERACT_RADIUS,
): Interactable | null {
  let best: Interactable | null = null;
  let bestDistance = radius;
  for (const item of items) {
    const d = Math.hypot(item.approach.x - position.x, item.approach.z - position.z);
    if (d <= bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

/** Ai đang ngồi ghế nào: 'player' hoặc id NPC. */
export class SeatRegistry {
  private readonly occupants = new Map<string, string>();

  occupant(seatId: string): string | null {
    return this.occupants.get(seatId) ?? null;
  }

  /** Giữ chỗ; trả về false nếu đã có người khác. */
  claim(seatId: string, who: string): boolean {
    const current = this.occupants.get(seatId);
    if (current !== undefined && current !== who) return false;
    this.occupants.set(seatId, who);
    return true;
  }

  release(seatId: string, who: string): void {
    if (this.occupants.get(seatId) === who) this.occupants.delete(seatId);
  }
}
