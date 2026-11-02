// Bố cục một tầng văn phòng (dữ liệu thuần, không dùng Three.js).
// Đồ đạc theo tỉ lệ nhân vật chibi cao ~1,2 m: bàn cao 0,43 m, ghế 0,27 m.
// Quy ước: tường kính nhìn ra thành phố ở phía -Z, cửa ra vào phía +Z.
import { STRINGS } from '../../strings';
import type { Aabb, Vec2 } from '../collision';

export type InteractableKind =
  'desk' | 'meeting' | 'sofa' | 'coffee' | 'fridge' | 'printer' | 'plant' | 'window';

/** Tư thế khi dùng vật: ngồi gõ phím, ngồi thường, hoặc đứng. */
export type UsePose = 'type' | 'sit' | 'stand';

export interface Box3Data {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface Interactable {
  id: string;
  kind: InteractableKind;
  /** Chỗ đứng để dùng (luôn nằm ngoài vùng vật cản, đi tới được). */
  approach: Vec2;
  /** Hướng quay mặt khi dùng (radian, 0 = nhìn về +Z). */
  facing: number;
  /** Chỗ ngồi (nếu là ghế); có thể sát mép bàn hơn chỗ đứng. */
  seat?: Vec2;
  pose: UsePose;
  /** Hộp 3D để bấm/chạm trực tiếp vào đồ vật. */
  pick: Box3Data;
}

export interface Desk {
  x: number;
  z: number;
  /** 0, 1, 2: loại màn hình (mã nguồn, bảng tính, biểu đồ). */
  screen: number;
}

export interface MeetingRoom {
  bounds: Aabb;
  doorMinX: number;
  doorMaxX: number;
  table: Aabb;
  seats: { x: number; z: number; facing: number }[];
}

export interface OfficeLayout {
  name: string;
  bounds: Aabb;
  wallHeight: number;
  spawn: Vec2;
  spawnFacing: number;
  window: { minX: number; maxX: number; bottom: number; top: number };
  desk: { width: number; depth: number; height: number };
  desks: Desk[];
  meeting: MeetingRoom;
  pantry: { floor: Aabb; counter: Aabb; coffee: Vec2; fridge: Aabb; table: Aabb };
  lounge: { rug: Aabb; sofa: Aabb; table: Aabb; seatXs: number[] };
  printer: Aabb;
  cabinets: Aabb[];
  plants: Vec2[];
  /** Điểm cho NPC đi dạo. */
  strollSpots: Vec2[];
}

export const GLASS_THICKNESS = 0.1;
export const PLANT_SIZE = 0.6;
/** Khoảng cách từ mép vật cản tới chỗ đứng dùng vật. */
const APPROACH_GAP = 0.45;
/** Khoảng cách từ mép bàn tới tâm người ngồi (tay vừa chạm bàn phím). */
const SEAT_GAP = 0.25;

function box(cx: number, cz: number, w: number, d: number): Aabb {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

const DESK = { width: 1.4, depth: 0.7, height: 0.43 };

export const OFFICE_FLOOR: OfficeLayout = {
  name: STRINGS.office.floorName,
  bounds: { minX: -13, maxX: 13, minZ: -9, maxZ: 9 },
  wallHeight: 2.8,
  spawn: { x: 0, z: 6 },
  spawnFacing: Math.PI,
  window: { minX: -12.5, maxX: 12.5, bottom: 0.7, top: 2.45 },
  desk: DESK,
  desks: [-5.5, -2].flatMap((z, row) =>
    [-10, -7.5, -5, -2.5].map((x, col) => ({ x, z, screen: (row * 4 + col) % 3 })),
  ),
  meeting: {
    bounds: { minX: 5, maxX: 13, minZ: -9, maxZ: -3.2 },
    doorMinX: 6.2,
    doorMaxX: 7.6,
    table: box(9, -6.1, 2.8, 1.4),
    seats: [8.1, 9, 9.9].flatMap((x) => [
      { x, z: -6.8 - SEAT_GAP, facing: 0 },
      { x, z: -5.4 + SEAT_GAP, facing: Math.PI },
    ]),
  },
  pantry: {
    floor: { minX: 9, maxX: 13, minZ: 2, maxZ: 9 },
    counter: { minX: 12.3, maxX: 13, minZ: 2.5, maxZ: 6.5 },
    coffee: { x: 12.65, z: 3.4 },
    fridge: { minX: 12.2, maxX: 13, minZ: 7, maxZ: 8.2 },
    table: box(10.2, 5.4, 0.9, 0.9),
  },
  lounge: {
    rug: { minX: -12.2, maxX: -7, minZ: 4.6, maxZ: 8.6 },
    sofa: { minX: -11.4, maxX: -8.2, minZ: 7.9, maxZ: 8.8 },
    table: { minX: -10.4, maxX: -9.2, minZ: 6.1, maxZ: 6.7 },
    seatXs: [-10.6, -9],
  },
  printer: { minX: 2.6, maxX: 3.4, minZ: 8.2, maxZ: 8.8 },
  cabinets: [{ minX: -13, maxX: -12.5, minZ: -6.2, maxZ: -3.2 }],
  plants: [
    { x: -12.4, z: -8.4 },
    { x: 4.3, z: -8.4 },
    { x: 12.4, z: 0.8 },
    { x: -12.4, z: 1.8 },
    { x: 6.5, z: 8.4 },
    { x: -4.6, z: 8.4 },
  ],
  strollSpots: [
    { x: 1.5, z: -7.6 },
    { x: -1, z: 3.5 },
    { x: 6, z: 1 },
    { x: -9, z: 3.5 },
    { x: 2, z: 7 },
  ],
};

export function deskBox(layout: OfficeLayout, desk: Desk): Aabb {
  return box(desk.x, desk.z, layout.desk.width, layout.desk.depth);
}

function plantBox(p: Vec2): Aabb {
  return box(p.x, p.z, PLANT_SIZE, PLANT_SIZE);
}

/** Các đoạn tường kính phòng họp (chừa lối cửa). */
export function glassWalls(layout: OfficeLayout): Aabb[] {
  const { bounds, doorMinX, doorMaxX } = layout.meeting;
  const t = GLASS_THICKNESS / 2;
  return [
    { minX: bounds.minX - t, maxX: bounds.minX + t, minZ: bounds.minZ, maxZ: bounds.maxZ + t },
    { minX: bounds.minX, maxX: doorMinX, minZ: bounds.maxZ - t, maxZ: bounds.maxZ + t },
    { minX: doorMaxX, maxX: bounds.maxX, minZ: bounds.maxZ - t, maxZ: bounds.maxZ + t },
  ];
}

/** Mọi vật cản trên sàn (ghế không chặn đường để dễ ngồi vào). */
export function officeObstacles(layout: OfficeLayout): Aabb[] {
  return [
    ...layout.desks.map((desk) => deskBox(layout, desk)),
    ...glassWalls(layout),
    layout.meeting.table,
    layout.pantry.counter,
    layout.pantry.fridge,
    layout.pantry.table,
    layout.lounge.sofa,
    layout.lounge.table,
    layout.printer,
    ...layout.cabinets,
    ...layout.plants.map(plantBox),
  ];
}

function pickFromAabb(b: Aabb, height: number, pad = 0): Box3Data {
  return { min: [b.minX - pad, 0, b.minZ - pad], max: [b.maxX + pad, height, b.maxZ + pad] };
}

/** Danh sách vật tương tác, suy ra từ bố cục. */
export function officeInteractables(layout: OfficeLayout): Interactable[] {
  const list: Interactable[] = [];
  const { width, depth, height } = layout.desk;

  layout.desks.forEach((desk, i) => {
    // Người ngồi phía +Z của bàn, quay mặt về -Z (nhìn màn hình, nhìn ra cửa kính).
    const edge = desk.z + depth / 2;
    list.push({
      id: `desk-${String(i)}`,
      kind: 'desk',
      approach: { x: desk.x, z: edge + APPROACH_GAP + 0.35 },
      seat: { x: desk.x, z: edge + SEAT_GAP },
      facing: Math.PI,
      pose: 'type',
      pick: {
        min: [desk.x - width / 2, 0, desk.z - depth / 2],
        max: [desk.x + width / 2, height + 0.5, edge + 0.55],
      },
    });
  });

  layout.meeting.seats.forEach((seat, i) => {
    const side = seat.facing === 0 ? -1 : 1;
    list.push({
      id: `meeting-${String(i)}`,
      kind: 'meeting',
      approach: { x: seat.x, z: seat.z + side * 0.55 },
      seat: { x: seat.x, z: seat.z },
      facing: seat.facing,
      pose: 'sit',
      pick: { min: [seat.x - 0.25, 0, seat.z - 0.25], max: [seat.x + 0.25, 0.65, seat.z + 0.25] },
    });
  });

  const { sofa } = layout.lounge;
  layout.lounge.seatXs.forEach((x, i) => {
    list.push({
      id: `sofa-${String(i)}`,
      kind: 'sofa',
      approach: { x, z: sofa.minZ - APPROACH_GAP - 0.05 },
      seat: { x, z: sofa.minZ + 0.25 },
      facing: Math.PI,
      pose: 'sit',
      pick: { min: [x - 0.75, 0, sofa.minZ], max: [x + 0.75, 0.75, sofa.maxZ] },
    });
  });

  const { counter, coffee, fridge } = layout.pantry;
  list.push({
    id: 'coffee',
    kind: 'coffee',
    approach: { x: counter.minX - APPROACH_GAP - 0.05, z: coffee.z },
    facing: Math.PI / 2,
    pose: 'stand',
    pick: { min: [counter.minX, 0, coffee.z - 0.35], max: [counter.maxX, 1.1, coffee.z + 0.35] },
  });
  list.push({
    id: 'fridge',
    kind: 'fridge',
    approach: { x: fridge.minX - APPROACH_GAP - 0.05, z: (fridge.minZ + fridge.maxZ) / 2 },
    facing: Math.PI / 2,
    pose: 'stand',
    pick: pickFromAabb(fridge, 1.4),
  });

  const { printer } = layout;
  list.push({
    id: 'printer',
    kind: 'printer',
    approach: { x: (printer.minX + printer.maxX) / 2, z: printer.minZ - APPROACH_GAP - 0.1 },
    facing: 0,
    pose: 'stand',
    pick: pickFromAabb(printer, 0.75),
  });

  layout.plants.forEach((plant, i) => {
    // Đứng ở phía gần giữa phòng của chậu cây.
    const dx = -plant.x;
    const dz = -plant.z;
    const len = Math.hypot(dx, dz) || 1;
    const dist = PLANT_SIZE / 2 + APPROACH_GAP + 0.1;
    list.push({
      id: `plant-${String(i)}`,
      kind: 'plant',
      approach: { x: plant.x + (dx / len) * dist, z: plant.z + (dz / len) * dist },
      facing: Math.atan2(-dx, -dz),
      pose: 'stand',
      pick: pickFromAabb(plantBox(plant), 1.1),
    });
  });

  const w = layout.window;
  list.push({
    id: 'window',
    kind: 'window',
    approach: { x: 1.5, z: layout.bounds.minZ + 0.9 },
    facing: Math.PI,
    pose: 'stand',
    pick: {
      min: [0, w.bottom, layout.bounds.minZ - 0.1],
      max: [3, w.top, layout.bounds.minZ + 0.2],
    },
  });

  return list;
}
