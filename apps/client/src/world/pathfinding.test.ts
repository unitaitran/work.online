import { describe, expect, it } from 'vitest';
import { containsPoint, inflate, type Aabb, type Vec2 } from './collision';
import { findPath, segmentIntersectsAabb } from './pathfinding';
import { obstaclesOf, TEST_ROOM } from './roomLayout';

const ROOM: Aabb = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
const WALL: Aabb = { minX: -0.5, maxX: 0.5, minZ: -3, maxZ: 3 };
const R = 0.25;

/** Kiểm tra cả đường đi không cắt qua vật cản nào. */
function pathIsClear(start: Vec2, path: Vec2[], obstacles: Aabb[], radius: number): boolean {
  let from = start;
  for (const to of path) {
    if (obstacles.some((box) => segmentIntersectsAabb(from, to, inflate(box, radius))))
      return false;
    from = to;
  }
  return true;
}

describe('segmentIntersectsAabb', () => {
  const box: Aabb = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };

  it('xuyên qua hộp', () => {
    expect(segmentIntersectsAabb({ x: -1, z: 0.5 }, { x: 2, z: 0.5 }, box)).toBe(true);
  });

  it('đi sát cạnh hoặc chạm góc không tính', () => {
    expect(segmentIntersectsAabb({ x: -1, z: 0 }, { x: 2, z: 0 }, box)).toBe(false);
    expect(segmentIntersectsAabb({ x: -1, z: 1 }, { x: 1, z: -1 }, box)).toBe(false);
  });

  it('dừng trước hộp', () => {
    expect(segmentIntersectsAabb({ x: -2, z: 0.5 }, { x: -0.1, z: 0.5 }, box)).toBe(false);
  });
});

describe('findPath', () => {
  it('đường thẳng khi không vướng', () => {
    expect(findPath({ x: -4, z: 4 }, { x: -2, z: 4 }, [WALL], R, ROOM)).toEqual([{ x: -2, z: 4 }]);
  });

  it('đi vòng qua vật cản chắn giữa', () => {
    const start = { x: -2, z: 0 };
    const path = findPath(start, { x: 2, z: 0 }, [WALL], R, ROOM);
    expect(path).not.toBeNull();
    expect(path?.length).toBeGreaterThan(1);
    expect(path?.at(-1)).toEqual({ x: 2, z: 0 });
    expect(pathIsClear(start, path ?? [], [WALL], R)).toBe(true);
  });

  it('đích nằm trong vật cản thì dời ra mép gần nhất', () => {
    const path = findPath({ x: -3, z: 0 }, { x: -0.4, z: 0 }, [WALL], R, ROOM);
    const end = path?.at(-1);
    expect(end).toBeDefined();
    expect(end && containsPoint(inflate(WALL, R), end)).toBe(false);
    expect(end?.x).toBeLessThan(-0.5);
  });

  it('đích ngoài phòng thì kẹp vào trong', () => {
    const end = findPath({ x: 0, z: 4 }, { x: 0, z: 99 }, [], R, ROOM)?.at(-1);
    expect(end).toEqual({ x: 0, z: 5 - R });
  });

  it('không có đường thì trả về null', () => {
    const split: Aabb = { minX: -0.5, maxX: 0.5, minZ: -6, maxZ: 6 };
    expect(findPath({ x: -3, z: 0 }, { x: 3, z: 0 }, [split], R, ROOM)).toBeNull();
  });

  it('xuất phát sát mép vật cản vẫn tìm được đường', () => {
    const start = { x: -0.5 - R, z: 0 };
    expect(findPath(start, { x: -3, z: 2 }, [WALL], R, ROOM)).not.toBeNull();
  });

  it('xuất phát sát mép vật cản: không vẽ đường cắt ngang qua chính vật cản đó', () => {
    // Đứng sát mặt trên (maxZ) của WALL, đích ở phía dưới bên kia: phải vòng qua góc.
    const start = { x: -0.2, z: 3 + R };
    const goal = { x: 0.3, z: -4 };
    const path = findPath(start, goal, [WALL], R, ROOM);
    expect(path?.length).toBeGreaterThan(1);
    expect(pathIsClear(start, path ?? [], [WALL], R)).toBe(true);
  });

  it('phòng thử: từ chỗ xuất hiện đi được tới mọi góc', () => {
    const obstacles = obstaclesOf(TEST_ROOM);
    const start = TEST_ROOM.spawn;
    for (const goal of [
      { x: -5.5, z: -4.5 },
      { x: 6.5, z: -4.5 },
      { x: -1.5, z: -1.5 },
      { x: 6.5, z: 4.5 },
    ]) {
      const path = findPath(start, goal, obstacles, R, TEST_ROOM.bounds);
      expect(path, `tới ${JSON.stringify(goal)}`).not.toBeNull();
      expect(pathIsClear(start, path ?? [], obstacles, R)).toBe(true);
    }
  });
});
