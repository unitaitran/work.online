import type { Vec2 } from './collision';

/** Hướng nhập từ bàn phím / joystick: x sang phải, y tiến lên (độ dài 0..1). */
export interface InputVector {
  x: number;
  y: number;
}

export const ZERO_INPUT: InputVector = { x: 0, y: 0 };

/** Cộng nhiều nguồn điều khiển, giới hạn độ dài tối đa 1. */
export function combineInputs(...inputs: InputVector[]): InputVector {
  let x = 0;
  let y = 0;
  for (const input of inputs) {
    x += input.x;
    y += input.y;
  }
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/**
 * Đổi hướng nhập thành hướng trên sàn theo góc camera `yaw`.
 * "Tiến" là hướng từ camera nhìn tới nhân vật; độ dài giữ nguyên.
 */
export function inputToWorld(input: InputVector, yaw: number): Vec2 {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  return {
    x: input.x * cos - input.y * sin,
    z: -input.x * sin - input.y * cos,
  };
}

/** Bước tới `target` tối đa `maxDistance`. */
export function stepToward(
  pos: Vec2,
  target: Vec2,
  maxDistance: number,
): { pos: Vec2; arrived: boolean } {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= maxDistance) return { pos: { x: target.x, z: target.z }, arrived: true };
  const k = maxDistance / distance;
  return { pos: { x: pos.x + dx * k, z: pos.z + dz * k }, arrived: false };
}

/** Góc quay quanh trục Y để nhân vật (mặc định nhìn về +Z) quay theo hướng di chuyển. */
export function headingOf(delta: Vec2): number {
  return Math.atan2(delta.x, delta.z);
}
