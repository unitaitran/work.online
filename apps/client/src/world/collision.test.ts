import { describe, expect, it } from 'vitest';
import { clampToBounds, containsPoint, inflate, moveWithCollisions, type Aabb } from './collision';

const ROOM: Aabb = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
const BOX: Aabb = { minX: 1, maxX: 2, minZ: -1, maxZ: 1 };
const R = 0.25;

describe('inflate / containsPoint', () => {
  it('phình hộp đều bốn phía', () => {
    expect(inflate(BOX, 0.5)).toEqual({ minX: 0.5, maxX: 2.5, minZ: -1.5, maxZ: 1.5 });
  });

  it('điểm trên cạnh không tính là bên trong', () => {
    expect(containsPoint(BOX, { x: 1.5, z: 0 })).toBe(true);
    expect(containsPoint(BOX, { x: 1, z: 0 })).toBe(false);
  });
});

describe('moveWithCollisions', () => {
  it('đi tự do khi không vướng gì', () => {
    expect(moveWithCollisions({ x: 0, z: 0 }, { x: 0, z: 0.5 }, R, [BOX], ROOM)).toEqual({
      x: 0,
      z: 0.5,
    });
  });

  it('dừng ở mép vật cản (tính cả bán kính)', () => {
    const p = moveWithCollisions({ x: 0.6, z: 0 }, { x: 0.5, z: 0 }, R, [BOX], ROOM);
    expect(p).toEqual({ x: 1 - R, z: 0 });
  });

  it('đi chéo vào cạnh thì trượt dọc theo cạnh', () => {
    const p = moveWithCollisions({ x: 0.7, z: 0 }, { x: 0.3, z: 0.3 }, R, [BOX], ROOM);
    expect(p.x).toBeCloseTo(1 - R);
    expect(p.z).toBeCloseTo(0.3);
  });

  it('chạm từ phía trên (theo Z) cũng bị chặn', () => {
    const p = moveWithCollisions({ x: 1.5, z: 2 }, { x: 0, z: -1 }, R, [BOX], ROOM);
    expect(p).toEqual({ x: 1.5, z: 1 + R });
  });

  it('không đi xuyên tường phòng', () => {
    const p = moveWithCollisions({ x: 4.5, z: -4.5 }, { x: 1, z: -1 }, R, [], ROOM);
    expect(p).toEqual({ x: 5 - R, z: -5 + R });
  });

  it('đang kẹt trong vật cản thì vẫn đi ra được', () => {
    const p = moveWithCollisions({ x: 1.5, z: 0 }, { x: -0.2, z: 0 }, R, [BOX], ROOM);
    expect(p.x).toBeCloseTo(1.3);
  });

  it('clampToBounds chừa khoảng bán kính', () => {
    expect(clampToBounds({ x: 10, z: -10 }, ROOM, 0.5)).toEqual({ x: 4.5, z: -4.5 });
  });
});
