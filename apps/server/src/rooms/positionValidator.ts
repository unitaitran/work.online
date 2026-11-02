// Kiểm tra vị trí người chơi gửi lên bằng CÙNG hàm va chạm với client (packages/shared):
// giới hạn tốc độ, không xuyên tường/vật cản. Sai thì trả về vị trí hợp lệ để kéo người chơi về.
import {
  MAX_WALK_SPEED,
  moveWithCollisions,
  officeInteractables,
  officeObstacles,
  type Aabb,
  type OfficeLayout,
  type Pose,
  type Vec2,
} from '@dilam/shared';

/** Bán kính nhân vật, bằng PLAYER_RADIUS ở client. */
export const PLAYER_RADIUS = 0.28;
/** Hệ số nới tốc độ (giật mạng, gói tin dồn) và khoảng nới cố định (m). */
const SPEED_SLACK = 1.35;
const DISTANCE_SLACK = 0.35;
/** Độ lệch cho phép giữa vị trí gửi lên và kết quả va chạm của server (m). */
const COLLISION_TOLERANCE = 0.08;
/** Ngồi vào ghế / đứng dậy: client đặt nhân vật thẳng vào chỗ ngồi hoặc chỗ đứng gần vật. */
const SEAT_SNAP = 0.2;
const SEAT_JUMP = 1.5;

export type PositionCheck = { ok: true } | { ok: false; x: number; z: number };

export class PositionValidator {
  private readonly obstacles: Aabb[];
  private readonly bounds: Aabb;
  private readonly anchors: Vec2[];

  constructor(layout: OfficeLayout) {
    this.obstacles = officeObstacles(layout);
    this.bounds = layout.bounds;
    this.anchors = officeInteractables(layout).flatMap((item) =>
      item.seat ? [item.seat, item.approach] : [item.approach],
    );
  }

  check(prev: Vec2, prevAt: number, next: Vec2, pose: Pose, now: number): PositionCheck {
    const dt = Math.min(Math.max((now - prevAt) / 1000, 0), 1);
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-4) return { ok: true };

    // Ngồi xuống / đứng lên ở một chỗ có sẵn: cho "nhảy" ngắn vào đúng điểm đó.
    if (distance <= SEAT_JUMP && this.nearAnchor(next)) return { ok: true };
    if (pose === 'sit' || pose === 'type') {
      if (this.nearAnchor(next)) return { ok: true };
    }

    const maxDistance = MAX_WALK_SPEED * dt * SPEED_SLACK + DISTANCE_SLACK;
    if (distance > maxDistance) return { ok: false, x: prev.x, z: prev.z };

    const resolved = moveWithCollisions(
      prev,
      { x: dx, z: dz },
      PLAYER_RADIUS,
      this.obstacles,
      this.bounds,
    );
    if (Math.hypot(resolved.x - next.x, resolved.z - next.z) > COLLISION_TOLERANCE) {
      return { ok: false, x: resolved.x, z: resolved.z };
    }
    return { ok: true };
  }

  private nearAnchor(p: Vec2): boolean {
    return this.anchors.some((a) => Math.hypot(a.x - p.x, a.z - p.z) <= SEAT_SNAP);
  }
}
