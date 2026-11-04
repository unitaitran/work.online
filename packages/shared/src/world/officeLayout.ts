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
  | 'ceodoor'
  /** Đồ công ty mua (chỉ có trong phòng công ty đã mua). */
  | 'massage'
  | 'console';

/** Tư thế khi dùng vật: ngồi gõ phím, ngồi thường, hoặc đứng. */
export type UsePose = 'type' | 'sit' | 'stand' | 'lie';

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
  /**
   * Độ cao hông khi ngồi (mét). Thiếu = ghế văn phòng (DEFAULT_SEAT_HIP). Sofa nệm cao hơn nên
   * cần nâng nhân vật lên, không thì người lún vào nệm.
   */
  seatHeight?: number;
  /** Hộp 3D để bấm/chạm trực tiếp vào đồ vật. */
  pick: Box3Data;
}

/** Độ cao hông của tư thế ngồi chuẩn (khớp với ghế văn phòng cao 0,27 m). */
export const DEFAULT_SEAT_HIP = 0.29;

/** Độ nâng nhân vật khi ngồi ở chỗ này (0 với ghế thường). */
export function seatLift(item: Pick<Interactable, 'seatHeight'>): number {
  return (item.seatHeight ?? DEFAULT_SEAT_HIP) - DEFAULT_SEAT_HIP;
}

/** Độ nâng khi ngồi tại (x, z): tìm chỗ ngồi gần nhất trong bán kính (dùng cho người chơi khác). */
export function seatLiftNear(
  items: readonly Interactable[],
  x: number,
  z: number,
  radius = 0.25,
): number {
  let best: Interactable | null = null;
  let bestDistance = radius;
  for (const item of items) {
    if (!item.seat) continue;
    const d = Math.hypot(item.seat.x - x, item.seat.z - z);
    if (d <= bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best ? seatLift(best) : 0;
}

export interface Desk {
  x: number;
  z: number;
  /** 0, 1, 2: loại màn hình (mã nguồn, bảng tính, biểu đồ). */
  screen: number;
  /**
   * Phía người ngồi so với tâm bàn: -1 = phía tây (quay mặt sang đông), 1 = phía đông.
   * Hai bàn quay lưng vào nhau thành một dãy dọc theo trục Z.
   */
  side: -1 | 1;
}

/** Hướng (đơn vị) từ tâm bàn tới phía người ngồi. */
export function deskSeatDir(desk: Desk): Vec2 {
  return { x: desk.side, z: 0 };
}

/** Góc quay quanh trục Y để đặt bàn (hình học bàn: người ngồi phía +Z). */
export function deskRotation(desk: Desk): number {
  return desk.side * (Math.PI / 2);
}

export interface MeetingRoom {
  bounds: Aabb;
  table: Aabb;
  seats: { x: number; z: number; facing: number }[];
}

/**
 * Phòng sếp (CEO): vách kính phía bắc và phía tây (nhìn ra khu ngồi và lối vào), cửa kính có
 * máy quẹt thẻ trên vách tây. Chỉ chủ công ty (trong phòng công ty) đi qua được.
 */
export interface CeoRoom {
  bounds: Aabb;
  /** Cánh cửa kính (khoảng trống trên vách tây khi mở). */
  door: Aabb;
  desk: Aabb;
  /** Tủ cạnh bàn sếp. */
  cabinet: Aabb;
  /** Máy quẹt thẻ gắn mặt ngoài vách, cạnh cửa. */
  reader: Aabb;
  /** Tủ trưng bày sau lưng ghế sếp (mũ, cúp, sách...). */
  display: Aabb;
  /** Sofa 2 chỗ để họp với sếp (sát tường đông cạnh tủ, quay mặt về phía bàn sếp). */
  sofa: Aabb;
}

export interface OfficeLayout {
  bounds: Aabb;
  wallHeight: number;
  spawn: Vec2;
  spawnFacing: number;
  /** Cửa sổ trên tường bắc (phía -Z): các khoảng X, cùng độ cao. */
  windows: { spans: { minX: number; maxX: number }[]; bottom: number; top: number };
  desk: { width: number; depth: number; height: number };
  /**
   * Bàn làm việc: 4 dãy dọc theo hướng sếp nhìn ra (trục Z), mỗi dãy hai bàn quay lưng vào
   * nhau, người ngồi hai bên dãy.
   */
  desks: Desk[];
  /** Vách ngăn: tường đặc và vách kính (độ dày nằm sẵn trong hộp). */
  partitions: { solid: Aabb[]; glass: Aabb[] };
  meeting: MeetingRoom;
  ceoRoom: CeoRoom;
  pantry: {
    floor: Aabb;
    counter: Aabb;
    coffee: Vec2;
    microwave: Vec2;
    water: Vec2;
    fridge: Aabb;
    /** Bàn đứng cao (tròn). */
    tables: Aabb[];
  };
  /** Phòng nghỉ: sofa ba chỗ sát tường nam, ghế dài nằm nghỉ, bàn nhỏ, đèn cây. */
  lounge: {
    bounds: Aabb;
    rug: Aabb;
    sofa: Aabb;
    table: Aabb;
    seatXs: number[];
    daybed: Aabb;
    sideTable: Aabb;
    lamp: Vec2;
  };
  /** Giá sách đen sát tường bắc, đặt giữa các ô cửa sổ (không che kính). */
  shelves: Aabb[];
  /**
   * Đồ decor rải dọc tường tây từ cổng vào sâu bên trong (không thành khu riêng): kệ giày
   * sneaker cạnh cổng, tượng gấu đỏ, kệ treo một dãy áo; cạnh dãy ngồi là 2 bảng dán note
   * (taskBoard, ventBoard). Bục trưng bày thêm (nếu có).
   */
  decor: { shoeRack: Aabb; bear: Aabb; coatRacks: Aabb[]; pedestals: Aabb[] };
  printer: Aabb;
  cabinets: Aabb[];
  /** Cửa ra vào trên tường nam và máy quẹt thẻ chấm công cạnh cửa. */
  entrance: { doorX: number; doorWidth: number; reader: Aabb };
  /** Bục đặt ống quẻ KPI (trong khu decor). */
  fortuneShelf: Aabb;
  /** Bảng dán note "lật task" trên tường tây, cạnh dãy ngồi: khoảng Z. */
  taskBoard: { minZ: number; maxZ: number };
  /** Bảng dán note "tường than thở" trên tường tây, cạnh dãy ngồi: khoảng Z. */
  ventBoard: { minZ: number; maxZ: number };
  plants: Vec2[];
  /** Điểm cho NPC đi dạo. */
  strollSpots: Vec2[];
}

export const GLASS_THICKNESS = 0.1;
export const WALL_THICKNESS = 0.14;
export const PLANT_SIZE = 0.6;
/** Khoảng cách từ mép vật cản tới chỗ đứng dùng vật. */
const APPROACH_GAP = 0.45;
/** Khoảng cách từ mép bàn tới tâm người ngồi (tay vừa chạm bàn phím). */
const SEAT_GAP = 0.25;

function box(cx: number, cz: number, w: number, d: number): Aabb {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

/** Vách dọc theo trục X (tại z) từ x0 tới x1. */
function wallX(z: number, x0: number, x1: number, t: number): Aabb {
  return { minX: x0, maxX: x1, minZ: z - t / 2, maxZ: z + t / 2 };
}

/** Vách dọc theo trục Z (tại x) từ z0 tới z1. */
function wallZ(x: number, z0: number, z1: number, t: number): Aabb {
  return { minX: x - t / 2, maxX: x + t / 2, minZ: z0, maxZ: z1 };
}

const DESK = { width: 1.5, depth: 0.75, height: 0.43 };

/*
 * Mặt bằng 20 × 13 m (sơ đồ v2). Toạ độ game: x = X_sơ_đồ - 10, z = 6,5 - Z_sơ_đồ
 * (sơ đồ: X tây→đông, Z nam→bắc; game: tường bắc có cửa sổ ở -Z, lối vào ở +Z).
 * Phòng phía nam (sơ đồ Z 0,5–4,5) kéo sát tường nam (game z 2 → 6,5).
 * Khu làm việc: 4 dãy bàn dọc theo trục Z (hướng sếp nhìn ra từ phòng kính), mỗi dãy 3 cặp
 * bàn 1,5 × 0,75 m quay lưng vào nhau, người ngồi hai bên: 24 chỗ. Lối đi giữa hai dãy 1,5 m.
 */
const ROW_XS = [-5, -2, 1, 4];
const ROW_ZS = [-3, -1.5, 0];
const T = WALL_THICKNESS;
const G = GLASS_THICKNESS;
const ROOM_Z = 2;
const SOUTH = 6.5;

export const OFFICE_FLOOR: OfficeLayout = {
  bounds: { minX: -10, maxX: 10, minZ: -6.5, maxZ: 6.5 },
  wallHeight: 3.2,
  spawn: { x: -7.25, z: 5.6 },
  spawnFacing: Math.PI,
  windows: {
    // Một cửa sổ lớn bên trái (ngắm thành phố) và một ô bên phải.
    spans: [
      { minX: -6, maxX: 0.5 },
      { minX: 2, maxX: 4.5 },
    ],
    bottom: 1.05,
    top: 2.85,
  },
  desk: DESK,
  desks: ROW_XS.flatMap((rowX, row) =>
    ROW_ZS.flatMap((z, i) =>
      ([-1, 1] as const).map((side, k) => ({
        x: rowX + side * (DESK.depth / 2),
        z,
        side,
        screen: (row * 6 + i * 2 + k) % 3,
      })),
    ),
  ),
  partitions: {
    solid: [
      wallZ(-1, ROOM_Z, SOUTH, T), // phòng sếp | phòng họp
      wallZ(4, ROOM_Z, SOUTH, T), // phòng họp | phòng nghỉ
    ],
    glass: [
      wallZ(-6, ROOM_Z, 2.6, G), // phòng sếp: vách tây, cửa 2,6–3,6
      wallZ(-6, 3.6, SOUTH, G),
      wallX(ROOM_Z, -6 - G / 2, -1, G), // phòng sếp: vách bắc
      wallX(ROOM_Z, -1, 2.6, G), // phòng họp: vách bắc, cửa 2,6–3,6
      wallX(ROOM_Z, 3.6, 4, G),
      wallX(ROOM_Z, 4, 4.5, G), // phòng nghỉ: vách kính bắc, cửa 4,5–5,5
      wallX(ROOM_Z, 5.5, 10, G), // phòng nghỉ kéo tới tường đông (không còn dải thừa bên cạnh)
    ],
  },
  meeting: {
    bounds: { minX: -1, maxX: 4, minZ: ROOM_Z, maxZ: SOUTH },
    table: box(1.5, 4.25, 3, 1.8),
    seats: [0.6, 1.5, 2.4].flatMap((x) => [
      { x, z: 3.35 - SEAT_GAP, facing: 0 },
      { x, z: 5.15 + SEAT_GAP, facing: Math.PI },
    ]),
  },
  ceoRoom: {
    bounds: { minX: -6, maxX: -1, minZ: ROOM_Z, maxZ: SOUTH },
    door: wallZ(-6, 2.6, 3.6, G),
    desk: box(-3.6, 3.9, 2.6, 1),
    cabinet: { minX: -1.62, maxX: -1.08, minZ: 4.4, maxZ: 5.9 },
    reader: box(-6.13, 4.4, 0.16, 0.26),
    display: box(-3.6, 6.325, 2.4, 0.35),
    sofa: { minX: -1.92, maxX: -1.15, minZ: 2.2, maxZ: 3.4 },
  },
  // Khu dịch vụ gọn sát tường đông: cây nước đứng dưới sàn ngay đầu bắc của quầy, quầy ngắn
  // (máy pha cà phê, lò vi sóng), tủ lạnh sát cuối quầy; chừa trống khoảng cạnh phòng nghỉ.
  pantry: {
    floor: { minX: 7.4, maxX: 10, minZ: -3.7, maxZ: 0.6 },
    counter: { minX: 9.35, maxX: 10, minZ: -2.9, maxZ: -0.8 },
    coffee: { x: 9.68, z: -2.35 },
    microwave: { x: 9.66, z: -1.35 },
    water: { x: 9.7, z: -3.35 },
    fridge: { minX: 9.25, maxX: 10, minZ: -0.75, maxZ: 0.05 },
    tables: [box(8.0, -1.2, 0.7, 0.7)],
  },
  lounge: {
    // Phòng nghỉ rộng tới tường đông: sofa, thảm, bàn ở giữa; ghế dài, bàn nhỏ, đèn cây sát tường.
    bounds: { minX: 4, maxX: 10, minZ: ROOM_Z, maxZ: SOUTH },
    rug: { minX: 5.5, maxX: 8.5, minZ: 3.7, maxZ: 6.3 },
    sofa: { minX: 5.8, maxX: 8.2, minZ: 5.65, maxZ: 6.5 },
    table: box(7.0, 4.4, 1, 0.5),
    seatXs: [6.35, 7.0, 7.65],
    daybed: { minX: 9.2, maxX: 9.98, minZ: 2.5, maxZ: 4.5 },
    sideTable: box(9.55, 5.05, 0.4, 0.4),
    lamp: { x: 9.55, z: 6.05 },
  },
  // Cửa sổ lớn x -6…0,5 và ô x 2…4,5; giá sách mở (ván gỗ trên giá ống) ở hai mảng tường còn lại.
  shelves: [box(1.25, -6.325, 1.4, 0.35), box(5.35, -6.325, 1.5, 0.35)],
  // Từ cổng (nam) vào trong (bắc) dọc tường tây: kệ giày → gấu → kệ treo áo → 2 bảng note.
  decor: {
    shoeRack: { minX: -10, maxX: -9.6, minZ: 4.3, maxZ: 5.5 },
    bear: box(-9.1, 3.0, 1, 1),
    // Hai kệ treo áo: kệ cũ ở tường tây, kệ mới sát tường bắc bên trái cửa sổ lớn.
    coatRacks: [
      { minX: -10, maxX: -9.22, minZ: -0.6, maxZ: 1.6 },
      { minX: -8.05, maxX: -6.1, minZ: -6.5, maxZ: -5.72 },
    ],
    pedestals: [],
  },
  // Máy in áp sát đầu bắc của dãy bàn thứ 4 (dãy bàn ở x = 4 kết thúc ở z = -3,75),
  // mặt quay về phía bắc, người dùng đứng trên lối đi cạnh tường kính.
  printer: box(4, -4.1, 0.8, 0.6),
  cabinets: [],
  entrance: { doorX: -7.25, doorWidth: 1.5, reader: box(-6.4, 6.15, 0.3, 0.3) },
  fortuneShelf: box(-9.35, -5.9, 0.55, 0.55),
  ventBoard: { minZ: -3.0, maxZ: -1.5 },
  taskBoard: { minZ: -5.0, maxZ: -3.5 },
  plants: [
    { x: -9.5, z: 6.0 },
    { x: 8, z: -6 },
    { x: 4.1, z: -6.05 },
    { x: 7.6, z: 1.5 },
  ],
  strollSpots: [
    { x: -7.1, z: -1.2 },
    { x: -0.5, z: 1.35 },
    { x: -8, z: 3.8 },
    { x: 6.6, z: -5.4 },
    { x: -2.2, z: -5.2 },
  ],
};

/** Chỗ cây nước đứng dưới sàn (vật cản). */
export function waterCoolerBox(layout: OfficeLayout): Aabb {
  return box(layout.pantry.water.x, layout.pantry.water.z, 0.36, 0.36);
}

/** Ghế sofa họp trong phòng sếp (dùng cho nhiệm vụ "Họp với sếp"). */
export const CEO_MEETING_SEAT_PREFIX = 'meeting-ceo-';

export function deskBox(layout: OfficeLayout, desk: Desk): Aabb {
  // Bàn xoay 90°: chiều rộng nằm theo trục Z, chiều sâu theo trục X.
  return box(desk.x, desk.z, layout.desk.depth, layout.desk.width);
}

function plantBox(p: Vec2): Aabb {
  return box(p.x, p.z, PLANT_SIZE, PLANT_SIZE);
}

/** Mọi vách kính (phòng họp, phòng sếp; không gồm cánh cửa). */
export function glassWalls(layout: OfficeLayout): Aabb[] {
  return layout.partitions.glass;
}

/** Cánh cửa kính phòng sếp (đóng với người không có thẻ). */
export function ceoDoor(layout: OfficeLayout): Aabb {
  return layout.ceoRoom.door;
}

/** Điểm có nằm trong phòng sếp không. */
export function insideCeoRoom(layout: OfficeLayout, p: Vec2): boolean {
  const b = layout.ceoRoom.bounds;
  return p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
}

/**
 * Mọi vật cản trên sàn (ghế không chặn đường để dễ ngồi vào).
 * `ceo`: có thẻ vào phòng sếp thì cửa phòng không chặn.
 */
export function officeObstacles(layout: OfficeLayout, options: { ceo?: boolean } = {}): Aabb[] {
  const { pantry, lounge, ceoRoom, decor } = layout;
  return [
    ...layout.desks.map((desk) => deskBox(layout, desk)),
    ...layout.partitions.solid,
    ...layout.partitions.glass,
    ...(options.ceo ? [] : [ceoDoor(layout)]),
    ceoRoom.desk,
    ceoRoom.cabinet,
    ceoRoom.reader,
    ceoRoom.display,
    ceoRoom.sofa,
    layout.meeting.table,
    pantry.counter,
    waterCoolerBox(layout),
    pantry.fridge,
    ...pantry.tables,
    lounge.sofa,
    lounge.table,
    lounge.daybed,
    lounge.sideTable,
    ...layout.shelves,
    decor.shoeRack,
    decor.bear,
    ...decor.coatRacks,
    ...decor.pedestals,
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
  const { depth, height } = layout.desk;

  layout.desks.forEach((desk, i) => {
    // Người ngồi ở mép ngoài của dãy (tây hoặc đông), quay mặt vào màn hình giữa dãy.
    const dir = deskSeatDir(desk);
    const edge = desk.x + dir.x * (depth / 2);
    const b = deskBox(layout, desk);
    list.push({
      id: `desk-${String(i)}`,
      kind: 'desk',
      approach: { x: edge + dir.x * 0.6, z: desk.z },
      seat: { x: edge + dir.x * SEAT_GAP, z: desk.z },
      facing: Math.atan2(-dir.x, -dir.z),
      pose: 'type',
      pick: {
        min: [Math.min(b.minX, edge + dir.x * 0.45), 0, b.minZ],
        max: [Math.max(b.maxX, edge + dir.x * 0.45), height + 0.5, b.maxZ],
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

  // Sofa họp trong phòng sếp: ghế kiểu "meeting" (ngồi là tính phút họp), id riêng
  // "meeting-ceo-*" để nhiệm vụ "Họp với sếp" nhận ra và NPC không tới ngồi.
  const cs = layout.ceoRoom.sofa;
  const room = layout.ceoRoom.bounds;
  // Sofa ở nửa đông của phòng thì lưng sát tường đông, quay mặt về phía tây (và ngược lại).
  const east = (cs.minX + cs.maxX) / 2 > (room.minX + room.maxX) / 2;
  [cs.minZ + 0.32, cs.maxZ - 0.32].forEach((z, i) => {
    list.push({
      id: `${CEO_MEETING_SEAT_PREFIX}${String(i)}`,
      kind: 'meeting',
      approach: { x: east ? cs.minX - APPROACH_GAP - 0.1 : cs.maxX + APPROACH_GAP + 0.1, z },
      seat: { x: east ? cs.minX + 0.25 : cs.maxX - 0.25, z },
      facing: east ? -Math.PI / 2 : Math.PI / 2,
      pose: 'sit',
      seatHeight: 0.46,
      pick: { min: [cs.minX, 0, z - 0.3], max: [cs.maxX, 0.8, z + 0.3] },
    });
  });

  const { sofa } = layout.lounge;
  layout.lounge.seatXs.forEach((x, i) => {
    list.push({
      id: `sofa-${String(i)}`,
      kind: 'sofa',
      approach: { x, z: sofa.minZ - APPROACH_GAP - 0.05 },
      // Ngồi gần mép trước để chân thả qua mép nệm; hông ngang mặt nệm (cao 0,42 m).
      seat: { x, z: sofa.minZ + 0.2 },
      facing: Math.PI,
      pose: 'sit',
      seatHeight: 0.46,
      pick: { min: [x - 0.75, 0, sofa.minZ], max: [x + 0.75, 0.75, sofa.maxZ] },
    });
  });

  const { daybed } = layout.lounge;
  const bedZ = (daybed.minZ + daybed.maxZ) / 2;
  list.push({
    id: 'sofa-daybed',
    kind: 'sofa',
    approach: { x: daybed.minX - APPROACH_GAP - 0.05, z: bedZ },
    // Nằm ngửa dọc giường, đầu gối lên gối ở đầu bắc (chân ở điểm này, đầu hướng -Z).
    seat: { x: (daybed.minX + daybed.maxX) / 2, z: daybed.minZ + 1.25 },
    facing: 0,
    pose: 'lie',
    seatHeight: 0.34,
    pick: { min: [daybed.minX, 0, daybed.minZ], max: [daybed.maxX, 0.6, daybed.maxZ] },
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
    // Đứng phía bắc (lối đi cạnh tường kính), quay mặt về hướng nam nhìn vào máy in.
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

  // Hai bảng dán note trên tường tây, cạnh dãy ngồi: đứng trước bảng, quay mặt về phía tây.
  const { minX, minZ } = layout.bounds;
  const wallBoard = (id: 'taskboard' | 'ventwall', b: { minZ: number; maxZ: number }): void => {
    list.push({
      id,
      kind: id,
      approach: { x: minX + 0.85, z: (b.minZ + b.maxZ) / 2 },
      facing: -Math.PI / 2,
      pose: 'stand',
      pick: { min: [minX - 0.05, 0.9, b.minZ], max: [minX + 0.15, 2, b.maxZ] },
    });
  };
  wallBoard('taskboard', layout.taskBoard);
  wallBoard('ventwall', layout.ventBoard);

  const w = layout.windows;
  // Đứng ngắm ở ô cửa sổ rộng nhất.
  const view = w.spans.reduce<{ minX: number; maxX: number } | null>(
    (best, span) => (!best || span.maxX - span.minX > best.maxX - best.minX ? span : best),
    null,
  ) ?? { minX: -1, maxX: 1 };
  const shelfFront = Math.max(minZ, ...layout.shelves.map((s) => s.maxZ));
  list.push({
    id: 'window',
    kind: 'window',
    approach: { x: (view.minX + view.maxX) / 2, z: shelfFront + 0.55 },
    facing: Math.PI,
    pose: 'stand',
    pick: { min: [view.minX, w.bottom, minZ - 0.1], max: [view.maxX, w.top, minZ + 0.2] },
  });

  // Phòng sếp: bàn sếp (ngồi phía nam, quay mặt ra khu làm việc) và máy quẹt thẻ ngoài cửa.
  const ceo = layout.ceoRoom;
  const ceoX = (ceo.desk.minX + ceo.desk.maxX) / 2;
  list.push({
    id: 'ceodesk',
    kind: 'ceodesk',
    approach: { x: ceoX, z: ceo.desk.maxZ + APPROACH_GAP + 0.35 },
    seat: { x: ceoX, z: ceo.desk.maxZ + SEAT_GAP },
    facing: Math.PI,
    pose: 'type',
    pick: {
      min: [ceo.desk.minX, 0, ceo.desk.minZ],
      max: [ceo.desk.maxX, height + 0.5, ceo.desk.maxZ + 0.55],
    },
  });
  const door = ceo.door;
  list.push({
    id: 'ceodoor',
    kind: 'ceodoor',
    approach: { x: door.minX - 0.7, z: (door.minZ + door.maxZ) / 2 },
    facing: Math.PI / 2,
    pose: 'stand',
    pick: pickFromAabb(ceo.reader, 1.3, 0.12),
  });

  return list;
}
