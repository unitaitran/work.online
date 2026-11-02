// Tìm đường cho kiểu "bấm lên sàn để đi tới": đi thẳng nếu không vướng gì,
// vướng thì đi vòng qua các góc vật cản (đồ thị tầm nhìn + Dijkstra, vài chục đỉnh là cùng).
import { clampToBounds, containsPoint, inflate, type Aabb, type Vec2 } from './collision';

/** Khoảng hở thêm giữa nhân vật và vật cản khi tìm đường. */
export const PATH_MARGIN = 0.04;
const CORNER_OFFSET = 0.01;
const EPS = 1e-6;

/** Đoạn thẳng a→b có đi xuyên phần bên trong hộp không (chạm cạnh hay chạm góc không tính). */
export function segmentIntersectsAabb(a: Vec2, b: Vec2, box: Aabb): boolean {
  const minX = box.minX + EPS;
  const maxX = box.maxX - EPS;
  const minZ = box.minZ + EPS;
  const maxZ = box.maxZ - EPS;
  let tMin = 0;
  let tMax = 1;

  const axes: [number, number, number, number][] = [
    [a.x, b.x - a.x, minX, maxX],
    [a.z, b.z - a.z, minZ, maxZ],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-12) {
      if (origin <= lo || origin >= hi) return false;
      continue;
    }
    let t1 = (lo - origin) / dir;
    let t2 = (hi - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin >= tMax) return false;
  }
  return tMax - tMin > 1e-9;
}

/** Đẩy điểm đang nằm trong hộp ra cạnh gần nhất. */
function pushOut(p: Vec2, box: Aabb): Vec2 {
  const options: [number, Vec2][] = [
    [p.x - box.minX, { x: box.minX - CORNER_OFFSET, z: p.z }],
    [box.maxX - p.x, { x: box.maxX + CORNER_OFFSET, z: p.z }],
    [p.z - box.minZ, { x: p.x, z: box.minZ - CORNER_OFFSET }],
    [box.maxZ - p.z, { x: p.x, z: box.maxZ + CORNER_OFFSET }],
  ];
  options.sort((left, right) => left[0] - right[0]);
  return options[0]?.[1] ?? p;
}

/**
 * Trả về các điểm cần đi qua (không gồm điểm xuất phát, điểm cuối là đích),
 * hoặc null nếu không tới được. Đích nằm trong vật cản sẽ được dời ra mép gần nhất.
 */
export function findPath(
  start: Vec2,
  goal: Vec2,
  obstacles: readonly Aabb[],
  radius: number,
  bounds: Aabb,
): Vec2[] | null {
  const boxes = obstacles.map((box) => inflate(box, radius + PATH_MARGIN));
  const inside = (p: Vec2): boolean => boxes.some((box) => containsPoint(box, p));
  const inArea = (p: Vec2): boolean =>
    p.x >= bounds.minX + radius - EPS &&
    p.x <= bounds.maxX - radius + EPS &&
    p.z >= bounds.minZ + radius - EPS &&
    p.z <= bounds.maxZ - radius + EPS;

  let target = clampToBounds(goal, bounds, radius);
  for (let i = 0; i < 4; i += 1) {
    const hit = boxes.find((box) => containsPoint(box, target));
    if (!hit) break;
    target = clampToBounds(pushOut(target, hit), bounds, radius);
  }
  if (inside(target)) return null;

  // Nhân vật có thể đang sát mép vật cản (nằm trong vùng đã phình thêm PATH_MARGIN).
  // Với các cạnh đi ra từ điểm xuất phát, hộp đó được xét theo vùng va chạm sát
  // (chỉ cộng bán kính): đi ra xa thì được, cắt ngang qua vật cản thì không.
  // Nếu kẹt hẳn bên trong cả vùng va chạm sát thì bỏ qua hộp đó để còn thoát ra.
  const startBoxes = new Map<Aabb, Aabb | null>();
  obstacles.forEach((obstacle, i) => {
    const box = boxes[i];
    if (!box || !containsPoint(box, start)) return;
    const tight = inflate(obstacle, radius);
    startBoxes.set(box, containsPoint(tight, start) ? null : tight);
  });
  const clear = (a: Vec2, b: Vec2, fromStart: boolean): boolean =>
    boxes.every((box) => {
      if (fromStart && startBoxes.has(box)) {
        const tight = startBoxes.get(box);
        return !tight || !segmentIntersectsAabb(a, b, tight);
      }
      return !segmentIntersectsAabb(a, b, box);
    });

  if (clear(start, target, true)) return [target];

  const corners: Vec2[] = [];
  for (const box of boxes) {
    for (const x of [box.minX - CORNER_OFFSET, box.maxX + CORNER_OFFSET]) {
      for (const z of [box.minZ - CORNER_OFFSET, box.maxZ + CORNER_OFFSET]) {
        const corner = { x, z };
        if (inArea(corner) && !inside(corner)) corners.push(corner);
      }
    }
  }

  // Đỉnh 0 = xuất phát, đỉnh cuối = đích.
  const nodes: Vec2[] = [start, ...corners, target];
  const goalIndex = nodes.length - 1;
  const dist = new Array<number>(nodes.length).fill(Infinity);
  const prev = new Array<number>(nodes.length).fill(-1);
  const done = new Array<boolean>(nodes.length).fill(false);
  dist[0] = 0;

  for (;;) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = dist[i] ?? Infinity;
      if (!done[i] && d < best) {
        best = d;
        current = i;
      }
    }
    if (current === -1 || current === goalIndex) break;
    done[current] = true;
    const from = nodes[current];
    if (!from) break;

    for (let next = 1; next < nodes.length; next += 1) {
      const to = nodes[next];
      if (done[next] || !to || !clear(from, to, current === 0)) continue;
      const candidate = best + Math.hypot(to.x - from.x, to.z - from.z);
      if (candidate < (dist[next] ?? Infinity)) {
        dist[next] = candidate;
        prev[next] = current;
      }
    }
  }

  if (!Number.isFinite(dist[goalIndex] ?? Infinity)) return null;
  const path: Vec2[] = [];
  for (let i = goalIndex; i > 0; i = prev[i] ?? 0) {
    const node = nodes[i];
    if (node) path.unshift(node);
  }
  return path;
}
