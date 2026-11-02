// Bố cục một tầng văn phòng (dữ liệu thuần, không dùng Three.js). Dùng chung client (dựng cảnh,
// va chạm) và server (kiểm tra vị trí người chơi).
// Đồ đạc theo tỉ lệ nhân vật chibi cao ~1,2 m: bàn cao 0,43 m, ghế 0,27 m.
// Quy ước: tường kính nhìn ra thành phố ở phía -Z, cửa ra vào phía +Z.
import type { Aabb, Vec2 } from './collision';

export type InteractableKind =
  | 'desk'
  | 'meeting'
  | 'sofa'
  | 'coffee'
  | 'fridge'
  | 'printer'
  | 'plant'
  | 'window'
  | 'gate'
  | 'fortune'
  | 'taskboard'
  | 'ventwall'
  | 'ceodesk'
  | 'ceodoor';

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

/**
 * Phòng kính của CEO: sát cửa kính, chung vách phía đông với phòng họp. Cửa có máy quẹt thẻ,
 * chỉ chủ công ty (trong phòng công ty) đi qua được.
 */
export interface CeoRoom {
  bounds: Aabb;
  doorMinX: number;
  doorMaxX: number;
  desk: Aabb;
  /** Máy quẹt thẻ gắn mặt ngoài vách trước, cạnh cửa. */
  reader: Aabb;
}

export interface OfficeLayout {
  bounds: Aabb;
  wallHeight: number;
  spawn: Vec2;
  spawnFacing: number;
  window: { minX: number; maxX: number; bottom: number; top: number };
  desk: { width: number; depth: number; height: number };
  desks: Desk[];
  meeting: MeetingRoom;
  ceoRoom: CeoRoom;
  pantry: { floor: Aabb; counter: Aabb; coffee: Vec2; fridge: Aabb; table: Aabb };
  lounge: { rug: Aabb; sofa: Aabb; table: Aabb; seatXs: number[] };
  printer: Aabb;
  cabinets: Aabb[];
  /** Cửa ra vào trên tường trước và máy quẹt thẻ chấm công cạnh cửa. */
  entrance: { doorX: number; doorWidth: number; reader: Aabb };
  /** Kệ nhỏ đặt ống quẻ KPI, sát tường trái. */
  fortuneShelf: Aabb;
  /** Bảng việc (lật task) treo trên tường phải: khoảng Z. */
  taskBoard: { minZ: number; maxZ: number };
  /** Tường than thở (bảng ghim) trên tường trước: khoảng X. */
  ventBoard: { minX: number; maxX: number };
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
  bounds: { minX: -13, maxX: 13, minZ: -9, maxZ: 9 },
  wallHeight: 2.8,
  spawn: { x: -2.5, z: 7.3 },
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
  ceoRoom: {
    bounds: { minX: 0.8, maxX: 5, minZ: -9, maxZ: -5.6 },
    doorMinX: 1.2,
    doorMaxX: 2.2,
    desk: box(3.2, -7.3, 1.5, 0.75),
    reader: box(2.5, -5.47, 0.26, 0.16),
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
  entrance: { doorX: -2.5, doorWidth: 1.4, reader: box(-1.4, 8.6, 0.3, 0.3) },
  fortuneShelf: { minX: -13, maxX: -12.4, minZ: -1.6, maxZ: -0.8 },
  taskBoard: { minZ: -2.4, maxZ: -0.6 },
  ventBoard: { minX: 4.4, maxX: 5.8 },
  plants: [
    { x: -12.4, z: -8.4 },
    { x: -1.4, z: -8.4 },
    { x: 12.4, z: 0.8 },
    { x: -12.4, z: 1.8 },
    { x: 6.5, z: 8.4 },
    { x: -4.6, z: 8.4 },
  ],
  strollSpots: [
    { x: -0.4, z: -6.8 },
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

/** Vách kính phòng CEO: vách tây và vách trước (chừa cửa); vách đông dùng chung với phòng họp. */
export function ceoGlassWalls(layout: OfficeLayout): Aabb[] {
  const { bounds, doorMinX, doorMaxX } = layout.ceoRoom;
  const t = GLASS_THICKNESS / 2;
  return [
    { minX: bounds.minX - t, maxX: bounds.minX + t, minZ: bounds.minZ, maxZ: bounds.maxZ + t },
    { minX: bounds.minX, maxX: doorMinX, minZ: bounds.maxZ - t, maxZ: bounds.maxZ + t },
    { minX: doorMaxX, maxX: bounds.maxX, minZ: bounds.maxZ - t, maxZ: bounds.maxZ + t },
  ];
}

/** Cánh cửa kính phòng CEO (đóng với người không có thẻ). */
export function ceoDoor(layout: OfficeLayout): Aabb {
  const { bounds, doorMinX, doorMaxX } = layout.ceoRoom;
  const t = GLASS_THICKNESS / 2;
  return { minX: doorMinX, maxX: doorMaxX, minZ: bounds.maxZ - t, maxZ: bounds.maxZ + t };
}

/** Điểm có nằm trong phòng CEO không. */
export function insideCeoRoom(layout: OfficeLayout, p: Vec2): boolean {
  const b = layout.ceoRoom.bounds;
  return p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
}

/**
 * Mọi vật cản trên sàn (ghế không chặn đường để dễ ngồi vào).
 * `ceo`: có thẻ vào phòng CEO thì cửa phòng không chặn.
 */
export function officeObstacles(layout: OfficeLayout, options: { ceo?: boolean } = {}): Aabb[] {
  return [
    ...layout.desks.map((desk) => deskBox(layout, desk)),
    ...glassWalls(layout),
    ...ceoGlassWalls(layout),
    ...(options.ceo ? [] : [ceoDoor(layout)]),
    layout.ceoRoom.desk,
    layout.ceoRoom.reader,
    layout.meeting.table,
    layout.pantry.counter,
    layout.pantry.fridge,
    layout.pantry.table,
    layout.lounge.sofa,
    layout.lounge.table,
    layout.printer,
    ...layout.cabinets,
    layout.entrance.reader,
    layout.fortuneShelf,
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

  // Chấm công: đứng trước máy quẹt thẻ cạnh cửa, quay mặt về phía cửa (+Z).
  const reader = layout.entrance.reader;
  list.push({
    id: 'gate',
    kind: 'gate',
    approach: { x: (reader.minX + reader.maxX) / 2, z: reader.minZ - APPROACH_GAP - 0.2 },
    facing: 0,
    pose: 'stand',
    pick: pickFromAabb(reader, 1.2, 0.15),
  });

  const shelf = layout.fortuneShelf;
  list.push({
    id: 'fortune',
    kind: 'fortune',
    approach: { x: shelf.maxX + APPROACH_GAP + 0.2, z: (shelf.minZ + shelf.maxZ) / 2 },
    facing: -Math.PI / 2,
    pose: 'stand',
    pick: pickFromAabb(shelf, 1.1),
  });

  const { maxX, maxZ } = layout.bounds;
  const board = layout.taskBoard;
  list.push({
    id: 'taskboard',
    kind: 'taskboard',
    approach: { x: maxX - 0.8, z: (board.minZ + board.maxZ) / 2 },
    facing: Math.PI / 2,
    pose: 'stand',
    pick: { min: [maxX - 0.15, 0.9, board.minZ], max: [maxX + 0.05, 2, board.maxZ] },
  });

  const vent = layout.ventBoard;
  list.push({
    id: 'ventwall',
    kind: 'ventwall',
    approach: { x: (vent.minX + vent.maxX) / 2, z: maxZ - 0.85 },
    facing: 0,
    pose: 'stand',
    pick: { min: [vent.minX, 0.9, maxZ - 0.15], max: [vent.maxX, 2, maxZ + 0.05] },
  });

  const w = layout.window;
  list.push({
    id: 'window',
    kind: 'window',
    approach: { x: -0.3, z: layout.bounds.minZ + 0.9 },
    facing: Math.PI,
    pose: 'stand',
    pick: {
      min: [-1, w.bottom, layout.bounds.minZ - 0.1],
      max: [0.7, w.top, layout.bounds.minZ + 0.2],
    },
  });

  // Phòng CEO: bàn CEO (ngồi phía cửa kính, quay mặt ra văn phòng) và máy quẹt thẻ ngoài cửa.
  const ceo = layout.ceoRoom;
  const ceoX = (ceo.desk.minX + ceo.desk.maxX) / 2;
  list.push({
    id: 'ceodesk',
    kind: 'ceodesk',
    approach: { x: ceoX, z: ceo.desk.minZ - APPROACH_GAP - 0.35 },
    seat: { x: ceoX, z: ceo.desk.minZ - SEAT_GAP },
    facing: 0,
    pose: 'type',
    pick: {
      min: [ceo.desk.minX, 0, ceo.desk.minZ - 0.55],
      max: [ceo.desk.maxX, height + 0.5, ceo.desk.maxZ],
    },
  });
  list.push({
    id: 'ceodoor',
    kind: 'ceodoor',
    approach: { x: (ceo.doorMinX + ceo.doorMaxX) / 2, z: ceo.bounds.maxZ + 0.75 },
    facing: Math.PI,
    pose: 'stand',
    pick: pickFromAabb(ceo.reader, 1.3, 0.12),
  });

  return list;
}
