// Kiểm tra vị trí người chơi gửi lên bằng CÙNG hàm va chạm với client (packages/shared):
// giới hạn tốc độ, không xuyên tường/vật cản. Sai thì trả về vị trí hợp lệ để kéo người chơi về.
import {
  MAX_WALK_SPEED,
  moveWithCollisions,
  officeInteractables,
  officeObstacles,
  insideCeoRoom,
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
  /** Vật cản với người có thẻ CEO (cửa phòng CEO mở). */
  private readonly ceoObstacles: Aabb[];
  private readonly bounds: Aabb;
  private readonly anchors: Vec2[];
  private readonly ceoAnchors: Vec2[];

  constructor(private readonly layout: OfficeLayout) {
    this.obstacles = officeObstacles(layout);
    this.ceoObstacles = officeObstacles(layout, { ceo: true });
    this.bounds = layout.bounds;
    const anchorsOf = (items: ReturnType<typeof officeInteractables>): Vec2[] =>
      items.flatMap((item) => (item.seat ? [item.seat, item.approach] : [item.approach]));
    const items = officeInteractables(layout);
    this.ceoAnchors = anchorsOf(items);
    // Người không có thẻ: không được "nhảy" vào chỗ ngồi trong phòng CEO.
    this.anchors = anchorsOf(items.filter((item) => item.kind !== 'ceodesk'));
  }

  check(
    prev: Vec2,
    prevAt: number,
    next: Vec2,
    _pose: Pose,
    now: number,
    ceo = false,
  ): PositionCheck {
    const dt = Math.min(Math.max((now - prevAt) / 1000, 0), 1);
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-4) return { ok: true };

    // Ngồi xuống / đứng lên ở một chỗ có sẵn: cho "nhảy" ngắn (không quá SEAT_JUMP) vào đúng
    // điểm đó. Tư thế không mở thêm quyền dịch chuyển xa.
    if (distance <= SEAT_JUMP && this.nearAnchor(next, ceo)) {
      // Không có thẻ thì không "nhảy" qua vách vào phòng CEO.
      if (ceo || insideCeoRoom(this.layout, prev) || !insideCeoRoom(this.layout, next)) {
        return { ok: true };
      }
    }

    const maxDistance = MAX_WALK_SPEED * dt * SPEED_SLACK + DISTANCE_SLACK;
    if (distance > maxDistance) return { ok: false, x: prev.x, z: prev.z };

    const resolved = moveWithCollisions(
      prev,
      { x: dx, z: dz },
      PLAYER_RADIUS,
      ceo ? this.ceoObstacles : this.obstacles,
      this.bounds,
    );
    if (Math.hypot(resolved.x - next.x, resolved.z - next.z) > COLLISION_TOLERANCE) {
      return { ok: false, x: resolved.x, z: resolved.z };
    }
    return { ok: true };
  }

  private nearAnchor(p: Vec2, ceo: boolean): boolean {
    return (ceo ? this.ceoAnchors : this.anchors).some(
      (a) => Math.hypot(a.x - p.x, a.z - p.z) <= SEAT_SNAP,
    );
  }
}
