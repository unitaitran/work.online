// Va chạm 2D trên mặt sàn (trục X và Z). Nhân vật coi như hình vuông bán kính `radius`
// (Minkowski: phình hộp vật cản ra một khoảng `radius` rồi xét tâm nhân vật như một điểm).

export interface Vec2 {
  x: number;
  z: number;
}

/** Hộp chữ nhật thẳng trục trên mặt sàn. */
export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function inflate(box: Aabb, amount: number): Aabb {
  return {
    minX: box.minX - amount,
    maxX: box.maxX + amount,
    minZ: box.minZ - amount,
    maxZ: box.maxZ + amount,
  };
}

/** Điểm nằm hẳn bên trong hộp (trên cạnh không tính). */
export function containsPoint(box: Aabb, p: Vec2): boolean {
  return p.x > box.minX && p.x < box.maxX && p.z > box.minZ && p.z < box.maxZ;
}

/** Kẹp tâm nhân vật vào trong phòng, chừa khoảng `radius` tới tường. */
export function clampToBounds(p: Vec2, bounds: Aabb, radius: number): Vec2 {
  return {
    x: Math.min(Math.max(p.x, bounds.minX + radius), bounds.maxX - radius),
    z: Math.min(Math.max(p.z, bounds.minZ + radius), bounds.maxZ - radius),
  };
}

/**
 * Di chuyển `pos` thêm `delta`, chặn bởi vật cản và tường. Xét từng trục riêng
 * nên khi đâm chéo vào cạnh, nhân vật trượt dọc theo cạnh thay vì đứng khựng.
 * Nếu đang kẹt sẵn bên trong một hộp thì cho đi ra.
 */
export function moveWithCollisions(
  pos: Vec2,
  delta: Vec2,
  radius: number,
  obstacles: readonly Aabb[],
  bounds: Aabb,
): Vec2 {
  const boxes = obstacles.map((box) => inflate(box, radius));

  let x = pos.x + delta.x;
  for (const box of boxes) {
    if (pos.z <= box.minZ || pos.z >= box.maxZ) continue;
    if (delta.x > 0 && pos.x <= box.minX && x > box.minX) x = box.minX;
    else if (delta.x < 0 && pos.x >= box.maxX && x < box.maxX) x = box.maxX;
  }

  let z = pos.z + delta.z;
  for (const box of boxes) {
    if (x <= box.minX || x >= box.maxX) continue;
    if (delta.z > 0 && pos.z <= box.minZ && z > box.minZ) z = box.minZ;
    else if (delta.z < 0 && pos.z >= box.maxZ && z < box.maxZ) z = box.maxZ;
  }

  return clampToBounds({ x, z }, bounds, radius);
}
