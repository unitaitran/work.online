export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Tiến dần tới đích, không phụ thuộc fps (lambda lớn = bám nhanh). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Đưa góc về khoảng (-π, π]. */
export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = (angle + Math.PI) % twoPi;
  if (a <= 0) a += twoPi;
  return a - Math.PI;
}

/** Như damp nhưng cho góc: luôn quay theo đường ngắn nhất. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = wrapAngle(target - current);
  return wrapAngle(current + diff * (1 - Math.exp(-lambda * dt)));
}
