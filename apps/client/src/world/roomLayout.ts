import type { Aabb, Vec2 } from './collision';

export type PropKind = 'desk' | 'cabinet' | 'plant' | 'sofa' | 'printer';

export interface RoomProp {
  kind: PropKind;
  /** Vùng va chạm trên sàn. */
  box: Aabb;
  height: number;
}

export interface RoomLayout {
  bounds: Aabb;
  wallHeight: number;
  spawn: Vec2;
  props: readonly RoomProp[];
}

function box(x: number, z: number, width: number, depth: number): Aabb {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

/** Phòng thử Phase 1: 14 m × 10 m, vài khối đồ đạc làm vật cản. */
export const TEST_ROOM: RoomLayout = {
  bounds: { minX: -7, maxX: 7, minZ: -5, maxZ: 5 },
  wallHeight: 2.6,
  spawn: { x: 0, z: 3 },
  props: [
    { kind: 'desk', box: box(-3.5, -1.5, 2.2, 1), height: 0.75 },
    { kind: 'desk', box: box(0.5, -1.5, 2.2, 1), height: 0.75 },
    { kind: 'cabinet', box: box(-6.4, -3.5, 0.9, 2), height: 1.6 },
    { kind: 'plant', box: box(5.8, -4, 0.8, 0.8), height: 1.3 },
    { kind: 'plant', box: box(-6.1, 4.1, 0.8, 0.8), height: 1.3 },
    { kind: 'sofa', box: box(4.5, 2.5, 2.4, 1), height: 0.8 },
    { kind: 'printer', box: box(3.6, -2.2, 0.9, 0.7), height: 1 },
  ],
};

export function obstaclesOf(layout: RoomLayout): Aabb[] {
  return layout.props.map((prop) => prop.box);
}
