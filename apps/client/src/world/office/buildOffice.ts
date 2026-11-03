// Dựng một tầng văn phòng từ OfficeLayout, tông đen xám, điểm đỏ ở vài món decor (20 × 13 m).
// Đồ lặp lại (bàn, ghế, cây, màn hình, đèn thả) dùng InstancedMesh: mỗi loại 1 draw call.
// Đồ chỉ có một cái gộp chung vào vài mesh màu đỉnh. Vệt sáng đèn, dải LED đỏ, màn hình
// dùng MeshBasicMaterial (tự sáng) thay cho nhiều đèn thật để máy yếu vẫn chạy.
// Màu đỏ (RED...) chỉ dùng cho decor: tượng gấu, hộp quà, gối, tranh, vật trên bục.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture as CanvasTextureClass,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  TorusKnotGeometry,
  Vector3,
  type BufferGeometry,
  type CanvasTexture,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergePieces, piece, type Piece } from '../../engine/meshBuilder';
import { seededRng } from '../../npc/schedule';
import { STRINGS } from '../../strings';
import type { Aabb } from '../collision';
import {
  ceoDoor,
  deskBox,
  deskRotation,
  deskSeatDir,
  glassWalls,
  PLANT_SIZE,
  type OfficeLayout,
} from './layout';
import {
  createCityTexture,
  createDarkFloorTexture,
  createGlassTexture,
  createLabelTexture,
  createLightPoolTexture,
  createPlasterTexture,
  createScreenTextures,
  drawCityscape,
} from './officeTextures';
import { PERIOD_LIGHTING, type DayPeriod } from './period';

// ---------- Bảng màu đen xám (đỏ chỉ cho decor) ----------
/** Tường vữa xám: màu đỉnh nhân với họa tiết vữa (createPlasterTexture). */
const WALL = 0xdcdcdf;
const WALL_INNER = 0xd2d2d6;
const BASEBOARD = 0x0c0c0e;
const BLACK = 0x121215;
const CHARCOAL = 0x2a2a30;
const METAL = 0x5d6068;
const STEEL = 0xa7abb2;
const RED = 0xc62828;
const RED_DARK = 0x8e1b1f;
const RED_SOFT = 0xe0524f;
/** Đỏ thẫm cho chao đèn và tủ sách; bản sẫm hơn cho viền và tấm lưng. */
const CRIMSON = 0x7a1418;
const CRIMSON_DEEP = 0x4e0c0f;
const WOOD = 0x6b4a33;
const WOOD_DARK = 0x3b2618;
const CREAM = 0xf1ece3;
const GOLD = 0xd9a441;
const FRAME = 0x0e0e10;
/** Dải LED trắng ấm (không dùng đỏ). */
const NEON = 0xe9dfcf;
const GRAY = 0x3d3d45;
const GRAY_LIGHT = 0x5a5a63;
const SEAT = 0x34343c;
const SEAT_BACK = 0x2a2a31;
const WARM = 0xffd29a;

/** Chiều cao vách kính và vách đặc giữa các phòng. */
const GLASS_HEIGHT = 2.7;
const PARTITION_HEIGHT = 2.85;

export interface BuiltOffice {
  readonly group: Group;
  setPeriod(period: DayPeriod): void;
  update(dt: number): void;
  /** Cửa phòng sếp: mở (có thẻ) thì cánh kính trượt sang bên, đèn máy quẹt thẻ xanh. */
  setCeoDoorOpen(open: boolean): void;
  /** Xuyên thấu: tường và vách mờ đi (độ đục 0,25). */
  setXray(on: boolean): void;
  /** Đèn thật (đèn rọi, đèn cây): tắt ở mức đồ họa thấp, chỉ còn vệt sáng giả. */
  setRealLights(on: boolean): void;
  /** Vách đặc giữa các phòng mờ đi (đang đứng trong phòng / camera ở sau vách). */
  setPartitionsFaded(on: boolean): void;
}

function boxPiece(b: Aabb, y0: number, y1: number, color: number): Piece {
  return piece(new BoxGeometry(b.maxX - b.minX, y1 - y0, b.maxZ - b.minZ), color, {
    position: [(b.minX + b.maxX) / 2, (y0 + y1) / 2, (b.minZ + b.maxZ) / 2],
  });
}

function centerOf(b: Aabb): { x: number; z: number } {
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
}

function instanced(
  geometry: BufferGeometry,
  material: Material,
  transforms: readonly { x: number; z: number; y?: number; rotY?: number }[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, transforms.length);
  const matrix = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const scale = new Vector3(1, 1, 1);
  transforms.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rotY ?? 0);
    mesh.setMatrixAt(i, matrix.compose(new Vector3(t.x, t.y ?? 0, t.z), q, scale));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  return mesh;
}

/**
 * Độ cao tâm màn hình so với mặt bàn. Đầu chibi rất to nên mắt người ngồi ở khoảng
 * 0,87 m: màn hình phải được nâng lên ngang tầm mắt để nhân vật nhìn thẳng vào.
 */
const MONITOR_LIFT = 0.36;
const MONITOR_STAND = MONITOR_LIFT - 0.19;

/**
 * Đồ trên bàn cho một chỗ ngồi (màn hình, bàn phím, chuột, cốc, giấy), tâm ở gốc toạ độ;
 * người ngồi phía +Z. Mặt bàn dài liền khối của cả dãy dựng riêng (benchPieces).
 */
function deskItemsGeometry(w: number, d: number, h: number): BufferGeometry {
  const monitorY = h + MONITOR_LIFT;
  return mergePieces([
    // Màn hình (phần vỏ; mặt hiển thị là InstancedMesh riêng).
    piece(new BoxGeometry(0.64, 0.4, 0.035), 0x0b0b0d, { position: [0, monitorY, -d / 2 + 0.15] }),
    piece(new CylinderGeometry(0.025, 0.03, MONITOR_STAND, 8), METAL, {
      position: [0, h + MONITOR_STAND / 2, -d / 2 + 0.15],
    }),
    piece(new CylinderGeometry(0.09, 0.1, 0.02, 14), METAL, {
      position: [0, h + 0.01, -d / 2 + 0.15],
    }),
    piece(new BoxGeometry(0.38, 0.015, 0.12), 0x2f2f36, { position: [0, h + 0.008, d / 2 - 0.17] }),
    piece(new BoxGeometry(0.07, 0.012, 0.1), 0x3a3a42, {
      position: [0.29, h + 0.006, d / 2 - 0.17],
    }),
    piece(new CylinderGeometry(0.035, 0.03, 0.08, 10), CREAM, {
      position: [w / 2 - 0.2, h + 0.04, -0.02],
    }),
    piece(new BoxGeometry(0.2, 0.03, 0.27), CREAM, {
      position: [-w / 2 + 0.26, h + 0.015, 0],
      rotation: [0, 0.2, 0],
    }),
  ]);
}

/**
 * Bàn dài liền khối cho mỗi dãy: một mặt bàn đen chạy suốt dãy, vách ngăn thấp ở giữa, chân
 * khung kim loại ở hai đầu và giữa, máng dây dưới mặt bàn.
 */
function benchPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const h = layout.desk.height;
  const rows = new Map<number, Aabb>();
  for (const desk of layout.desks) {
    const b = deskBox(layout, desk);
    const key = Math.round(((b.minX + b.maxX) / 2 - (desk.side * (b.maxX - b.minX)) / 2) * 100);
    const row = rows.get(key);
    rows.set(
      key,
      row
        ? {
            minX: Math.min(row.minX, b.minX),
            maxX: Math.max(row.maxX, b.maxX),
            minZ: Math.min(row.minZ, b.minZ),
            maxZ: Math.max(row.maxZ, b.maxZ),
          }
        : b,
    );
  }
  for (const row of rows.values()) {
    const cx = (row.minX + row.maxX) / 2;
    const length = row.maxZ - row.minZ;
    pieces.push(boxPiece(row, h - 0.045, h, BLACK));
    // Viền xám mảnh hai mép dài.
    for (const x of [row.minX, row.maxX]) {
      pieces.push(
        boxPiece(
          { minX: x - 0.006, maxX: x + 0.006, minZ: row.minZ, maxZ: row.maxZ },
          h - 0.04,
          h - 0.01,
          GRAY_LIGHT,
        ),
      );
    }
    // Vách ngăn giữa dãy (xám mờ, khung đen).
    pieces.push(
      boxPiece(
        { minX: cx - 0.012, maxX: cx + 0.012, minZ: row.minZ + 0.05, maxZ: row.maxZ - 0.05 },
        h,
        h + 0.36,
        GRAY,
      ),
    );
    pieces.push(
      boxPiece(
        { minX: cx - 0.018, maxX: cx + 0.018, minZ: row.minZ + 0.05, maxZ: row.maxZ - 0.05 },
        h + 0.36,
        h + 0.38,
        FRAME,
      ),
    );
    // Chân khung chữ ∏ mỗi 1,5 m và máng dây.
    const legs = Math.max(2, Math.round(length / 1.5) + 1);
    for (let i = 0; i < legs; i += 1) {
      const z = row.minZ + 0.06 + (i * (length - 0.12)) / (legs - 1);
      pieces.push(
        boxPiece(
          { minX: row.minX + 0.05, maxX: row.maxX - 0.05, minZ: z - 0.03, maxZ: z + 0.03 },
          h - 0.08,
          h - 0.045,
          CHARCOAL,
        ),
      );
      for (const x of [row.minX + 0.08, row.maxX - 0.08]) {
        pieces.push(
          boxPiece(
            { minX: x - 0.03, maxX: x + 0.03, minZ: z - 0.03, maxZ: z + 0.03 },
            0,
            h - 0.08,
            CHARCOAL,
          ),
        );
      }
    }
    pieces.push(
      boxPiece(
        { minX: cx - 0.1, maxX: cx + 0.1, minZ: row.minZ + 0.1, maxZ: row.maxZ - 0.1 },
        h - 0.16,
        h - 0.1,
        0x1e1e23,
      ),
    );
  }
  return pieces;
}

/** Màn hình hiển thị (mặt phẳng), cùng toạ độ với deskGeometry. */
function screenGeometry(d: number, h: number): BufferGeometry {
  const geometry = new PlaneGeometry(0.58, 0.34);
  geometry.translate(0, h + MONITOR_LIFT, -d / 2 + 0.15 + 0.019);
  return geometry;
}

/** Ghế văn phòng xám than chân đen; người ngồi quay mặt về -Z (lưng tựa ở phía +Z). */
function chairGeometry(): BufferGeometry {
  return mergePieces([
    piece(new BoxGeometry(0.38, 0.07, 0.36), SEAT, { position: [0, 0.24, 0] }),
    piece(new BoxGeometry(0.36, 0.34, 0.05), SEAT_BACK, {
      position: [0, 0.46, 0.2],
      rotation: [-0.12, 0, 0],
    }),
    piece(new CylinderGeometry(0.025, 0.025, 0.2, 8), METAL, { position: [0, 0.12, 0] }),
    piece(new BoxGeometry(0.44, 0.03, 0.05), BLACK, { position: [0, 0.025, 0] }),
    piece(new BoxGeometry(0.05, 0.03, 0.44), BLACK, { position: [0, 0.025, 0] }),
  ]);
}

function plantGeometry(): BufferGeometry {
  const r = PLANT_SIZE / 2;
  return mergePieces([
    piece(new CylinderGeometry(r * 0.75, r * 0.6, 0.42, 16), BLACK, { position: [0, 0.21, 0] }),
    piece(new CylinderGeometry(r * 0.77, r * 0.77, 0.03, 16), METAL, { position: [0, 0.4, 0] }),
    piece(new CylinderGeometry(r * 0.7, r * 0.7, 0.02, 14), 0x3b2a1e, { position: [0, 0.41, 0] }),
    piece(new SphereGeometry(r * 0.95, 12, 9), 0x3f7d4e, {
      position: [0, 0.74, 0],
      scale: [1, 1.2, 1],
    }),
    piece(new SphereGeometry(r * 0.6, 10, 8), 0x54975f, { position: [r * 0.3, 1.06, r * 0.1] }),
    piece(new SphereGeometry(r * 0.5, 10, 8), 0x356b42, { position: [-r * 0.35, 0.95, -r * 0.15] }),
  ]);
}

/** Đèn thả: chao đen, dây treo lên trần (3,2 m). Bóng đèn là mesh riêng (tự sáng). */
const PENDANT_Y = 2.35;
function pendantGeometry(ceiling: number): BufferGeometry {
  return mergePieces([
    piece(new CylinderGeometry(0.006, 0.006, ceiling - PENDANT_Y, 4), FRAME, {
      position: [0, (ceiling + PENDANT_Y) / 2, 0],
    }),
    // Chao đèn đỏ thẫm, viền sẫm hơn.
    piece(new CylinderGeometry(0.06, 0.2, 0.2, 18, 1, true), CRIMSON, {
      position: [0, PENDANT_Y - 0.1, 0],
    }),
    piece(new TorusGeometry(0.2, 0.008, 6, 24), CRIMSON_DEEP, {
      position: [0, PENDANT_Y - 0.2, 0],
      rotation: [Math.PI / 2, 0, 0],
    }),
  ]);
}

// ---------- Tường ----------

function wallPieces(layout: OfficeLayout): Piece[] {
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const h = layout.wallHeight;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const plane = (
    pw: number,
    ph: number,
    x: number,
    y: number,
    z: number,
    rotY: number,
    color = WALL,
  ): Piece =>
    piece(new PlaneGeometry(pw, ph), color, { position: [x, y, z], rotation: [0, rotY, 0] });

  const pieces: Piece[] = [
    plane(width, h, cx, h / 2, maxZ, Math.PI),
    plane(depth, h, minX, h / 2, cz, Math.PI / 2),
    plane(depth, h, maxX, h / 2, cz, -Math.PI / 2),
  ];
  // Tường bắc có 3 ô cửa sổ: dải dưới, dải trên và các mảng giữa các ô.
  const { spans, bottom, top } = layout.windows;
  pieces.push(plane(width, bottom, cx, bottom / 2, minZ, 0));
  pieces.push(plane(width, h - top, cx, (h + top) / 2, minZ, 0));
  let x = minX;
  for (const span of [...spans, { minX: maxX, maxX }]) {
    if (span.minX > x) {
      pieces.push(
        plane(span.minX - x, top - bottom, (x + span.minX) / 2, (top + bottom) / 2, minZ, 0),
      );
    }
    x = span.maxX;
  }
  // Len chân tường đen.
  const walls = [
    { x: cx, z: maxZ - 0.02, rotY: Math.PI, length: width },
    { x: cx, z: minZ + 0.02, rotY: 0, length: width },
    { x: minX + 0.02, z: cz, rotY: Math.PI / 2, length: depth },
    { x: maxX - 0.02, z: cz, rotY: -Math.PI / 2, length: depth },
  ];
  for (const wall of walls) {
    pieces.push(plane(wall.length, 0.12, wall.x, 0.06, wall.z, wall.rotY, BASEBOARD));
  }
  return pieces;
}

/** Vách đặc giữa các phòng: mesh riêng để tự mờ khi camera hoặc nhân vật ở sau vách. */
function partitionPieces(layout: OfficeLayout): Piece[] {
  return layout.partitions.solid.flatMap((wall) => [
    boxPiece(wall, 0, PARTITION_HEIGHT, WALL_INNER),
    boxPiece(wall, 0, 0.12, BASEBOARD),
  ]);
}

/** Dải LED trắng ấm tự sáng: viền trần, đỉnh vách, mép quầy. */
function neonPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  // Đường LED trên đỉnh tường bao (viền trần).
  const top = layout.wallHeight - 0.02;
  pieces.push(
    boxPiece({ minX, maxX, minZ: minZ + 0.02, maxZ: minZ + 0.05 }, top - 0.02, top, NEON),
  );
  pieces.push(
    boxPiece({ minX: minX + 0.02, maxX: minX + 0.05, minZ, maxZ }, top - 0.02, top, NEON),
  );
  pieces.push(
    boxPiece({ minX: maxX - 0.05, maxX: maxX - 0.02, minZ, maxZ }, top - 0.02, top, NEON),
  );
  for (const wall of layout.partitions.solid) {
    pieces.push(boxPiece(wall, PARTITION_HEIGHT, PARTITION_HEIGHT + 0.02, NEON));
  }
  const { counter } = layout.pantry;
  pieces.push(
    boxPiece({ ...counter, maxX: counter.minX + 0.012 }, 0.06, 0.08, NEON),
    boxPiece({ ...counter, maxX: counter.minX + 0.012 }, 0.9, 0.915, NEON),
  );
  return pieces;
}

// ---------- Đồ tĩnh ----------

function windowPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { minZ } = layout.bounds;
  const { spans, bottom, top } = layout.windows;
  for (const span of spans) {
    const sill = { minX: span.minX - 0.05, maxX: span.maxX + 0.05, minZ, maxZ: minZ + 0.14 };
    pieces.push(boxPiece(sill, bottom - 0.05, bottom, FRAME));
    pieces.push(boxPiece({ ...sill, maxZ: minZ + 0.06 }, top, top + 0.06, FRAME));
    const panes = Math.max(2, Math.round((span.maxX - span.minX) / 1.25));
    const mullions = Array.from(
      { length: panes + 1 },
      (_, k) => span.minX + (k * (span.maxX - span.minX)) / panes,
    );
    for (const x of mullions) {
      pieces.push(
        boxPiece({ minX: x - 0.03, maxX: x + 0.03, minZ, maxZ: minZ + 0.06 }, bottom, top, FRAME),
      );
    }
  }
  return pieces;
}

function floorPatches(layout: OfficeLayout): Piece[] {
  const patch = (b: Aabb, color: number, y = 0.004): Piece => boxPiece(b, 0.001, y, color);
  const { pantry, lounge, ceoRoom, meeting } = layout;
  const door = layout.entrance;
  const inset = (b: Aabb, d: number): Aabb => ({
    minX: b.minX + d,
    maxX: b.maxX - d,
    minZ: b.minZ + d,
    maxZ: b.maxZ - d,
  });
  return [
    patch(ceoRoom.bounds, 0x26262b),
    patch(
      {
        minX: ceoRoom.desk.minX - 0.5,
        maxX: ceoRoom.desk.maxX + 0.5,
        minZ: ceoRoom.desk.minZ - 0.6,
        maxZ: ceoRoom.desk.maxZ + 1.0,
      },
      0x34343b,
      0.007,
    ),
    patch(meeting.bounds, 0x1f2024),
    patch(lounge.bounds, 0x232327),
    patch(lounge.rug, 0x3a3a41, 0.007),
    patch(inset(lounge.rug, 0.15), 0x45454d, 0.009),
    patch(pantry.floor, 0x2e2e33),
    // Thảm xám than ở lối vào.
    patch(
      {
        minX: door.doorX - 0.9,
        maxX: door.doorX + 0.9,
        minZ: layout.bounds.maxZ - 1.4,
        maxZ: layout.bounds.maxZ - 0.05,
      },
      0x34343b,
      0.007,
    ),
  ];
}

function glassFramePieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  for (const glass of [...glassWalls(layout), ceoDoor(layout)]) {
    const alongX = glass.maxX - glass.minX > glass.maxZ - glass.minZ;
    const posts = alongX
      ? [
          { ...glass, maxX: glass.minX + 0.05 },
          { ...glass, minX: glass.maxX - 0.05 },
        ]
      : [
          { ...glass, maxZ: glass.minZ + 0.05 },
          { ...glass, minZ: glass.maxZ - 0.05 },
        ];
    if (glass === ceoDoor(layout)) continue;
    for (const post of posts) pieces.push(boxPiece(post, 0, GLASS_HEIGHT, FRAME));
    pieces.push(boxPiece(glass, GLASS_HEIGHT - 0.04, GLASS_HEIGHT + 0.03, FRAME));
    pieces.push(boxPiece(glass, 0, 0.06, FRAME));
  }
  // Khung trên khoảng cửa phòng sếp.
  pieces.push(boxPiece(ceoDoor(layout), GLASS_HEIGHT - 0.04, GLASS_HEIGHT + 0.03, FRAME));
  return pieces;
}

function ceoPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { desk: cd, cabinet, reader, bounds } = layout.ceoRoom;
  const top = 0.45;
  const cx = (cd.minX + cd.maxX) / 2;
  // Bàn sếp 2,6 × 1,0 m: mặt gỗ sẫm, hộc đen hai bên, tấm chắn trước có dải đỏ.
  pieces.push(boxPiece(cd, top - 0.05, top, WOOD_DARK));
  pieces.push(boxPiece({ ...cd, maxX: cd.minX + 0.5 }, 0, top - 0.05, BLACK));
  pieces.push(boxPiece({ ...cd, minX: cd.maxX - 0.5 }, 0, top - 0.05, BLACK));
  pieces.push(boxPiece({ ...cd, maxZ: cd.minZ + 0.05 }, 0.04, top - 0.05, BLACK));
  pieces.push(
    boxPiece(
      { minX: cd.minX + 0.5, maxX: cd.maxX - 0.5, minZ: cd.minZ - 0.004, maxZ: cd.minZ + 0.01 },
      0.2,
      0.23,
      METAL,
    ),
  );
  // Màn hình lớn quay về phía người ngồi (+Z), bàn phím, biển tên vàng, cốc đỏ.
  pieces.push(
    boxPiece(
      { minX: cx - 0.42, maxX: cx + 0.42, minZ: cd.minZ + 0.18, maxZ: cd.minZ + 0.22 },
      top + 0.22,
      top + 0.7,
      0x0b0b0d,
    ),
  );
  pieces.push(
    boxPiece(
      { minX: cx - 0.04, maxX: cx + 0.04, minZ: cd.minZ + 0.18, maxZ: cd.minZ + 0.24 },
      top,
      top + 0.24,
      METAL,
    ),
  );
  pieces.push(
    boxPiece(
      { minX: cx - 0.22, maxX: cx + 0.22, minZ: cd.maxZ - 0.3, maxZ: cd.maxZ - 0.17 },
      top,
      top + 0.015,
      0x2f2f36,
    ),
  );
  pieces.push(
    boxPiece(
      { minX: cd.maxX - 0.55, maxX: cd.maxX - 0.2, minZ: cd.maxZ - 0.16, maxZ: cd.maxZ - 0.08 },
      top,
      top + 0.07,
      GOLD,
    ),
  );
  pieces.push(
    piece(new CylinderGeometry(0.04, 0.035, 0.1, 10), CREAM, {
      position: [cd.minX + 0.3, top + 0.05, cd.maxZ - 0.3],
    }),
  );
  pieces.push(
    boxPiece(
      { minX: cd.minX + 0.6, maxX: cd.minX + 0.9, minZ: cd.maxZ - 0.4, maxZ: cd.maxZ - 0.2 },
      top,
      top + 0.03,
      CREAM,
    ),
  );
  // Ghế sếp: lưng cao da đen, viền đỏ (người ngồi quay mặt về -Z).
  const chairZ = cd.maxZ + 0.3;
  pieces.push(piece(new BoxGeometry(0.5, 0.09, 0.46), BLACK, { position: [cx, 0.27, chairZ] }));
  pieces.push(
    piece(new BoxGeometry(0.48, 0.62, 0.07), BLACK, {
      position: [cx, 0.62, chairZ + 0.24],
      rotation: [-0.1, 0, 0],
    }),
  );
  pieces.push(
    piece(new BoxGeometry(0.5, 0.03, 0.08), METAL, {
      position: [cx, 0.94, chairZ + 0.27],
      rotation: [-0.1, 0, 0],
    }),
  );
  for (const side of [-1, 1]) {
    pieces.push(
      piece(new BoxGeometry(0.05, 0.05, 0.36), CHARCOAL, {
        position: [cx + side * 0.27, 0.42, chairZ],
      }),
    );
  }
  pieces.push(
    piece(new CylinderGeometry(0.03, 0.03, 0.22, 8), METAL, { position: [cx, 0.13, chairZ] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.28, 0.28, 0.03, 5), BLACK, { position: [cx, 0.02, chairZ] }),
  );
  // Tủ cạnh bàn: thân đen, mặt gỗ, cửa có tay nắm vàng, trên có cúp vàng.
  pieces.push(boxPiece(cabinet, 0, 0.82, BLACK));
  pieces.push(boxPiece(cabinet, 0.82, 0.86, WOOD_DARK));
  for (const z of [cabinet.minZ + 0.37, cabinet.maxZ - 0.37]) {
    pieces.push(
      boxPiece(
        { minX: cabinet.minX - 0.01, maxX: cabinet.minX, minZ: z - 0.34, maxZ: z + 0.34 },
        0.06,
        0.78,
        0x1b1b1f,
      ),
    );
    pieces.push(
      boxPiece(
        { minX: cabinet.minX - 0.03, maxX: cabinet.minX - 0.01, minZ: z - 0.02, maxZ: z + 0.02 },
        0.4,
        0.55,
        GOLD,
      ),
    );
  }
  const cab = centerOf(cabinet);
  pieces.push(
    piece(new CylinderGeometry(0.07, 0.04, 0.12, 12), GOLD, {
      position: [cab.x, 0.98, cab.z - 0.3],
    }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.05, 0.06, 0.06, 12), WOOD_DARK, {
      position: [cab.x, 0.89, cab.z - 0.3],
    }),
  );
  pieces.push(
    piece(new SphereGeometry(0.12, 12, 10), RED, { position: [cab.x, 0.98, cab.z + 0.35] }),
  );
  // Tranh lớn trên tường nam phòng sếp (mặt quay vào phòng).
  const art = { x: cx, z: bounds.maxZ - 0.012 };
  pieces.push(
    piece(new PlaneGeometry(1.9, 1.05), GOLD, {
      position: [art.x, 1.75, art.z],
      rotation: [0, Math.PI, 0],
    }),
  );
  pieces.push(
    piece(new PlaneGeometry(1.8, 0.95), BLACK, {
      position: [art.x, 1.75, art.z - 0.004],
      rotation: [0, Math.PI, 0],
    }),
  );
  pieces.push(
    piece(new CircleGeometry(0.32, 32), RED, {
      position: [art.x - 0.3, 1.8, art.z - 0.008],
      rotation: [0, Math.PI, 0],
    }),
  );
  pieces.push(
    piece(new PlaneGeometry(0.9, 0.05), CREAM, {
      position: [art.x + 0.25, 1.5, art.z - 0.008],
      rotation: [0, Math.PI, 0.35],
    }),
  );
  // Máy quẹt thẻ (mặt ngoài vách tây).
  pieces.push(boxPiece(reader, 0.95, 1.25, BLACK));
  return pieces;
}

function meetingPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { table, bounds } = layout.meeting;
  // Bàn họp 3 × 1,8 m mặt đen bóng, chân chữ T, dải đỏ quanh mép.
  pieces.push(boxPiece(table, 0.4, 0.45, BLACK));
  pieces.push(
    boxPiece(
      {
        minX: table.minX + 0.02,
        maxX: table.maxX - 0.02,
        minZ: table.minZ - 0.005,
        maxZ: table.maxZ + 0.005,
      },
      0.385,
      0.4,
      GRAY_LIGHT,
    ),
  );
  for (const x of [table.minX + 0.55, table.maxX - 0.55]) {
    pieces.push(
      boxPiece(
        { minX: x - 0.05, maxX: x + 0.05, minZ: table.minZ + 0.35, maxZ: table.maxZ - 0.35 },
        0,
        0.4,
        CHARCOAL,
      ),
    );
    pieces.push(
      boxPiece(
        { minX: x - 0.05, maxX: x + 0.05, minZ: table.minZ + 0.2, maxZ: table.maxZ - 0.2 },
        0,
        0.03,
        CHARCOAL,
      ),
    );
  }
  const c = centerOf(table);
  pieces.push(
    boxPiece(
      { minX: c.x - 0.2, maxX: c.x + 0.2, minZ: c.z - 0.12, maxZ: c.z + 0.12 },
      0.45,
      0.48,
      0x2f2f36,
    ),
  );
  for (const dx of [-0.9, 0.8]) {
    pieces.push(
      boxPiece(
        { minX: c.x + dx - 0.12, maxX: c.x + dx + 0.12, minZ: c.z - 0.4, maxZ: c.z - 0.24 },
        0.45,
        0.455,
        CREAM,
      ),
    );
  }
  // Tủ thấp dưới TV trên tường nam.
  pieces.push(
    boxPiece(
      { minX: c.x - 1.1, maxX: c.x + 1.1, minZ: bounds.maxZ - 0.4, maxZ: bounds.maxZ - 0.02 },
      0,
      0.45,
      BLACK,
    ),
  );
  pieces.push(
    boxPiece(
      { minX: c.x - 1.1, maxX: c.x + 1.1, minZ: bounds.maxZ - 0.41, maxZ: bounds.maxZ - 0.4 },
      0.2,
      0.22,
      GRAY,
    ),
  );
  pieces.push(
    boxPiece(
      { minX: c.x - 0.95, maxX: c.x + 0.95, minZ: bounds.maxZ - 0.05, maxZ: bounds.maxZ - 0.02 },
      1.05,
      2.05,
      0x0b0b0d,
    ),
  );
  return pieces;
}

function loungePieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { sofa, table, daybed, sideTable, lamp, seatXs } = layout.lounge;
  // Sofa ba chỗ đỏ đô, chân đen, gối kem.
  pieces.push(boxPiece({ ...sofa, maxZ: sofa.maxZ - 0.22 }, 0.05, 0.32, 0x2e2e35));
  pieces.push(boxPiece({ ...sofa, minZ: sofa.maxZ - 0.22 }, 0.05, 0.78, 0x2e2e35));
  pieces.push(boxPiece({ ...sofa, maxX: sofa.minX + 0.18 }, 0.05, 0.5, 0x26262c));
  pieces.push(boxPiece({ ...sofa, minX: sofa.maxX - 0.18 }, 0.05, 0.5, 0x26262c));
  pieces.push(boxPiece(sofa, 0, 0.05, BLACK));
  for (const x of seatXs) {
    pieces.push(
      piece(new BoxGeometry(0.68, 0.1, 0.52), 0x4a4a53, { position: [x, 0.37, sofa.minZ + 0.3] }),
    );
    pieces.push(
      piece(new BoxGeometry(0.6, 0.36, 0.12), 0x4a4a53, {
        position: [x, 0.58, sofa.maxZ - 0.3],
        rotation: [-0.18, 0, 0],
      }),
    );
  }
  // Gối decor (một đỏ, một kem) tựa sát tay vịn, nhỏ và nằm sau lưng chỗ ngồi để không đè
  // lên người đang ngồi.
  for (const [x, color, tilt] of [
    [sofa.minX + 0.3, RED, 0.25],
    [sofa.maxX - 0.3, CREAM, -0.25],
  ] as const) {
    pieces.push(
      piece(new BoxGeometry(0.24, 0.24, 0.08), color, {
        position: [x, 0.56, sofa.maxZ - 0.34],
        rotation: [-0.25, 0, tilt],
      }),
    );
  }
  // Bàn trà đen thấp, trên có khay và cốc.
  pieces.push(boxPiece(table, 0.28, 0.32, BLACK));
  pieces.push(
    boxPiece(
      {
        minX: table.minX + 0.08,
        maxX: table.maxX - 0.08,
        minZ: table.minZ + 0.08,
        maxZ: table.maxZ - 0.08,
      },
      0,
      0.28,
      CHARCOAL,
    ),
  );
  const tc = centerOf(table);
  pieces.push(
    boxPiece(
      { minX: tc.x - 0.2, maxX: tc.x + 0.1, minZ: tc.z - 0.1, maxZ: tc.z + 0.1 },
      0.32,
      0.335,
      WOOD,
    ),
  );
  pieces.push(
    piece(new CylinderGeometry(0.035, 0.03, 0.08, 10), CREAM, {
      position: [tc.x + 0.3, 0.36, tc.z],
    }),
  );
  // Ghế dài nằm nghỉ: khung đen, nệm xám than, gối và chăn đỏ.
  pieces.push(boxPiece(daybed, 0, 0.18, BLACK));
  pieces.push(
    boxPiece(
      {
        minX: daybed.minX + 0.04,
        maxX: daybed.maxX - 0.04,
        minZ: daybed.minZ + 0.04,
        maxZ: daybed.maxZ - 0.04,
      },
      0.18,
      0.32,
      0x3a3a41,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: daybed.minX + 0.08,
        maxX: daybed.maxX - 0.08,
        minZ: daybed.minZ + 0.06,
        maxZ: daybed.minZ + 0.36,
      },
      0.32,
      0.42,
      RED_SOFT,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: daybed.minX + 0.04,
        maxX: daybed.maxX - 0.04,
        minZ: daybed.maxZ - 0.75,
        maxZ: daybed.maxZ - 0.1,
      },
      0.32,
      0.35,
      GRAY_LIGHT,
    ),
  );
  pieces.push(
    boxPiece({ ...daybed, minZ: daybed.minZ, maxZ: daybed.minZ + 0.06 }, 0.18, 0.62, BLACK),
  );
  // Bàn nhỏ tròn và đèn cây ấm.
  const sc = centerOf(sideTable);
  pieces.push(
    piece(new CylinderGeometry(0.2, 0.2, 0.03, 20), BLACK, { position: [sc.x, 0.5, sc.z] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.025, 0.025, 0.48, 8), METAL, { position: [sc.x, 0.25, sc.z] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.14, 0.14, 0.02, 16), BLACK, { position: [sc.x, 0.01, sc.z] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.06, 0.05, 0.16, 10), 0x2f6b3c, { position: [sc.x, 0.6, sc.z] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.16, 0.16, 0.02, 16), BLACK, { position: [lamp.x, 0.01, lamp.z] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.015, 0.015, 1.45, 6), METAL, { position: [lamp.x, 0.74, lamp.z] }),
  );
  // Tranh đỏ trên tường nam phòng nghỉ.
  const { maxZ } = layout.bounds;
  const ax = (sofa.minX + sofa.maxX) / 2;
  pieces.push(
    piece(new PlaneGeometry(1.5, 0.7), BLACK, {
      position: [ax, 1.55, maxZ - 0.012],
      rotation: [0, Math.PI, 0],
    }),
  );
  for (let i = 0; i < 3; i += 1) {
    pieces.push(
      piece(new PlaneGeometry(0.36, 0.5), [RED, CREAM, RED_DARK][i] ?? RED, {
        position: [ax - 0.45 + i * 0.45, 1.55, maxZ - 0.016],
        rotation: [0, Math.PI, 0],
      }),
    );
  }
  return pieces;
}

function pantryPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { counter, coffee, microwave, water, fridge, tables } = layout.pantry;
  const top = 0.92;
  // Quầy đen, mặt đá sáng.
  pieces.push(boxPiece(counter, 0, top - 0.04, BLACK));
  pieces.push(boxPiece({ ...counter, minX: counter.minX - 0.03 }, top - 0.04, top, 0xd8d4cd));
  // Kệ nổi mỏng sát tường phía trên (không che thiết bị khi nhìn từ trên).
  pieces.push(boxPiece({ ...counter, minX: counter.maxX - 0.18 }, 1.85, 1.89, BLACK));
  for (let z = counter.minZ + 0.6; z < counter.maxZ; z += 1.15) {
    pieces.push(
      boxPiece(
        { minX: counter.minX - 0.005, maxX: counter.minX, minZ: z - 0.02, maxZ: z + 0.02 },
        0.3,
        0.7,
        METAL,
      ),
    );
  }
  // Máy pha cà phê: thân thép, đầu đen, vòi, đèn đỏ.
  pieces.push(
    piece(new BoxGeometry(0.36, 0.46, 0.4), STEEL, { position: [coffee.x, top + 0.23, coffee.z] }),
  );
  pieces.push(
    piece(new BoxGeometry(0.38, 0.1, 0.42), BLACK, { position: [coffee.x, top + 0.51, coffee.z] }),
  );
  pieces.push(
    piece(new BoxGeometry(0.06, 0.08, 0.14), BLACK, {
      position: [coffee.x - 0.2, top + 0.24, coffee.z],
    }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.04, 0.035, 0.08, 10), CREAM, {
      position: [coffee.x - 0.15, top + 0.04, coffee.z],
    }),
  );
  pieces.push(
    piece(new SphereGeometry(0.018, 6, 4), NEON, {
      position: [coffee.x - 0.185, top + 0.4, coffee.z + 0.12],
    }),
  );
  for (let i = 0; i < 3; i += 1) {
    pieces.push(
      piece(new CylinderGeometry(0.035, 0.03, 0.07, 10), [GRAY_LIGHT, CREAM, BLACK][i] ?? CREAM, {
        position: [coffee.x - 0.05, top + 0.035, coffee.z + 0.42 + i * 0.12],
      }),
    );
  }
  // Lò vi sóng đen, cửa kính tối, đồng hồ số đỏ.
  pieces.push(
    piece(new BoxGeometry(0.42, 0.3, 0.55), BLACK, {
      position: [microwave.x, top + 0.15, microwave.z],
    }),
  );
  pieces.push(
    piece(new BoxGeometry(0.01, 0.2, 0.34), 0x30343c, {
      position: [microwave.x - 0.215, top + 0.15, microwave.z - 0.06],
    }),
  );
  pieces.push(
    piece(new BoxGeometry(0.01, 0.04, 0.09), NEON, {
      position: [microwave.x - 0.215, top + 0.22, microwave.z + 0.19],
    }),
  );
  // Cây nước đứng dưới sàn: thân trắng cao, bình xanh trên đỉnh, hai vòi nóng/lạnh quay ra lối đi.
  const body = 0.95;
  pieces.push(
    piece(new BoxGeometry(0.34, body, 0.34), CREAM, { position: [water.x, body / 2, water.z] }),
  );
  pieces.push(
    piece(new BoxGeometry(0.36, 0.04, 0.36), GRAY_LIGHT, { position: [water.x, 0.02, water.z] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.13, 0.13, 0.36, 16), 0x5aa6d6, {
      position: [water.x, body + 0.2, water.z],
    }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.06, 0.13, 0.08, 16), 0x5aa6d6, {
      position: [water.x, body + 0.42, water.z],
    }),
  );
  pieces.push(
    piece(new BoxGeometry(0.02, 0.18, 0.26), GRAY_LIGHT, {
      position: [water.x - 0.18, body - 0.32, water.z],
    }),
  );
  for (const [dz, color] of [
    [-0.07, 0x3d8be0],
    [0.07, RED],
  ] as const) {
    pieces.push(
      piece(new BoxGeometry(0.04, 0.05, 0.04), color, {
        position: [water.x - 0.19, body - 0.2, water.z + dz],
      }),
    );
  }
  // Tủ lạnh đen tay nắm thép.
  pieces.push(boxPiece(fridge, 0, 1.75, 0x18181c));
  pieces.push(
    boxPiece(
      {
        minX: fridge.minX - 0.005,
        maxX: fridge.minX,
        minZ: fridge.minZ + 0.04,
        maxZ: fridge.maxZ - 0.04,
      },
      1.15,
      1.17,
      METAL,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: fridge.minX - 0.04,
        maxX: fridge.minX,
        minZ: fridge.minZ + 0.1,
        maxZ: fridge.minZ + 0.13,
      },
      0.5,
      1.05,
      STEEL,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: fridge.minX - 0.04,
        maxX: fridge.minX,
        minZ: fridge.minZ + 0.1,
        maxZ: fridge.minZ + 0.13,
      },
      1.25,
      1.6,
      STEEL,
    ),
  );
  // Bàn đứng cao tròn, mỗi bàn hai ghế đôn đỏ.
  for (const t of tables) {
    const c = centerOf(t);
    pieces.push(
      piece(new CylinderGeometry(0.35, 0.35, 0.04, 24), BLACK, { position: [c.x, 0.78, c.z] }),
    );
    pieces.push(
      piece(new CylinderGeometry(0.03, 0.03, 0.76, 8), METAL, { position: [c.x, 0.39, c.z] }),
    );
    pieces.push(
      piece(new CylinderGeometry(0.2, 0.22, 0.03, 18), BLACK, { position: [c.x, 0.015, c.z] }),
    );
    pieces.push(
      piece(new CylinderGeometry(0.035, 0.03, 0.08, 10), CREAM, {
        position: [c.x + 0.1, 0.84, c.z - 0.05],
      }),
    );
    for (const dx of [-0.6, 0.6]) {
      pieces.push(
        piece(new CylinderGeometry(0.15, 0.15, 0.06, 16), GRAY, {
          position: [c.x + dx, 0.58, c.z],
        }),
      );
      pieces.push(
        piece(new CylinderGeometry(0.02, 0.02, 0.56, 6), METAL, {
          position: [c.x + dx, 0.28, c.z],
        }),
      );
      pieces.push(
        piece(new TorusGeometry(0.12, 0.01, 4, 16), METAL, {
          position: [c.x + dx, 0.22, c.z],
          rotation: [Math.PI / 2, 0, 0],
        }),
      );
    }
  }
  return pieces;
}

// ---------- Giá sách mở: ván gỗ trên giá ống đen, nhiều hộp quà trắng nơ đỏ, ít sách ----------

const PLANK = 0x6e4c34;
const PLANK_EDGE = 0x8a6244;
const SHELF_BACK = 0x26262b;
const GIFT_WHITE = 0xf3f1ec;
const RIBBON = 0xc8202a;
const SPEAKER_RED = 0xd8312f;

/** Hộp quà: dây ruy băng hai chiều, nơ trên nóc, hai dải buông xuống mặt trước. */
function giftPieces(
  cx: number,
  y: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  color: number,
  ribbon: number,
): Piece[] {
  const r = 0.022;
  const out: Piece[] = [
    boxPiece(
      { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 },
      y,
      y + h,
      color,
    ),
    // Ruy băng ngang và dọc ôm quanh hộp.
    boxPiece(
      { minX: cx - w / 2 - 0.003, maxX: cx + w / 2 + 0.003, minZ: cz - r, maxZ: cz + r },
      y,
      y + h + 0.003,
      ribbon,
    ),
    boxPiece(
      { minX: cx - r, maxX: cx + r, minZ: cz - d / 2 - 0.003, maxZ: cz + d / 2 + 0.003 },
      y,
      y + h + 0.003,
      ribbon,
    ),
    boxPiece(
      {
        minX: cx - w / 2 - 0.003,
        maxX: cx + w / 2 + 0.003,
        minZ: cz - d / 2 - 0.003,
        maxZ: cz + d / 2 + 0.003,
      },
      y + h * 0.55 - r,
      y + h * 0.55 + r,
      ribbon,
    ),
  ];
  // Nơ: hai cánh dẹt, nút ở giữa.
  for (const side of [-1, 1]) {
    out.push(
      piece(new SphereGeometry(0.05, 8, 6), ribbon, {
        position: [cx + side * 0.045, y + h + 0.03, cz],
        scale: [1, 0.55, 0.5],
        rotation: [0, 0, side * 0.45],
      }),
    );
  }
  out.push(piece(new SphereGeometry(0.022, 6, 4), ribbon, { position: [cx, y + h + 0.025, cz] }));
  // Hai dải buông xuống mặt trước.
  for (const side of [-1, 1]) {
    out.push(
      piece(new BoxGeometry(0.03, h * 0.7, 0.006), ribbon, {
        position: [cx + side * 0.03, y + h - (h * 0.7) / 2 + 0.01, cz + d / 2 + 0.006],
        rotation: [0, 0, side * 0.12],
      }),
    );
  }
  return out;
}

/** Loa kiểm âm đỏ: thân bo, loa trầm đen và loa tép mặt trước. */
function speakerPieces(cx: number, y: number, cz: number, face: number): Piece[] {
  const w = 0.17;
  const h = 0.26;
  const d = 0.2;
  return [
    boxPiece(
      { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 },
      y,
      y + h,
      SPEAKER_RED,
    ),
    piece(new CylinderGeometry(0.055, 0.055, 0.012, 16), 0x1a1a1e, {
      position: [cx, y + 0.09, cz + face * (d / 2 + 0.005)],
      rotation: [Math.PI / 2, 0, 0],
    }),
    piece(new CylinderGeometry(0.02, 0.02, 0.012, 12), 0x1a1a1e, {
      position: [cx, y + 0.2, cz + face * (d / 2 + 0.005)],
      rotation: [Math.PI / 2, 0, 0],
    }),
  ];
}

/** Ba lô dựng đứng: thân, nắp bo tròn, túi trước, quai xách. */
function backpackPieces(cx: number, y: number, cz: number, color: number, accent: number): Piece[] {
  const w = 0.26;
  const h = 0.34;
  const d = 0.14;
  return [
    boxPiece(
      { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 },
      y,
      y + h,
      color,
    ),
    piece(new CylinderGeometry(w / 2, w / 2, d, 14, 1, false, 0, Math.PI), color, {
      position: [cx, y + h, cz],
      rotation: [Math.PI / 2, 0, Math.PI / 2],
    }),
    boxPiece(
      {
        minX: cx - w / 2 + 0.03,
        maxX: cx + w / 2 - 0.03,
        minZ: cz + d / 2,
        maxZ: cz + d / 2 + 0.035,
      },
      y + 0.04,
      y + 0.2,
      accent,
    ),
    piece(new TorusGeometry(0.04, 0.008, 4, 10, Math.PI), 0x1a1a1e, {
      position: [cx, y + h + w / 2 - 0.01, cz],
    }),
  ];
}

function shelfPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const planks = [0.3, 0.82, 1.34, 1.86];
  const t = 0.035;
  layout.shelves.forEach((s, shelfIndex) => {
    const w = s.maxX - s.minX;
    const cz = s.minZ + 0.19;
    const at = (f: number): number => s.minX + f * w;
    // Tấm nền tối sát tường (như mảng tường sơn đen sau giá).
    pieces.push(boxPiece({ ...s, maxZ: s.minZ + 0.02 }, 0, 2.15, SHELF_BACK));
    for (const y of planks) {
      // Ván gỗ óc chó, mép trước sáng hơn.
      pieces.push(boxPiece({ ...s, minZ: s.minZ + 0.02 }, y - t, y, PLANK));
      pieces.push(boxPiece({ ...s, minZ: s.maxZ - 0.012 }, y - t, y, PLANK_EDGE));
      // Giá đỡ ống đen: hai ống ngang dưới ván, mặt bích bắt tường.
      for (const f of [0.18, 0.82]) {
        pieces.push(
          piece(new CylinderGeometry(0.016, 0.016, s.maxZ - s.minZ - 0.04, 8), 0x141417, {
            position: [at(f), y - t - 0.02, (s.minZ + s.maxZ) / 2],
            rotation: [Math.PI / 2, 0, 0],
          }),
          piece(new CylinderGeometry(0.035, 0.035, 0.012, 10), 0x141417, {
            position: [at(f), y - t - 0.02, s.minZ + 0.026],
            rotation: [Math.PI / 2, 0, 0],
          }),
        );
      }
    }
    const [p0, p1, p2, p3] = planks as [number, number, number, number];
    const flip = shelfIndex % 2 === 1;
    const fx = (f: number): number => at(flip ? 1 - f : f);
    // Tầng dưới: hộp quà trắng, loa đỏ, hộp quà đỏ, loa đỏ.
    pieces.push(...giftPieces(fx(0.16), p0, cz, 0.3, 0.3, 0.28, GIFT_WHITE, RIBBON));
    pieces.push(...speakerPieces(fx(0.42), p0, cz, 1));
    pieces.push(...giftPieces(fx(0.64), p0, cz, 0.28, 0.24, 0.26, SPEAKER_RED, RIBBON));
    pieces.push(...speakerPieces(fx(0.87), p0, cz, 1));
    // Tầng hai: ba hộp quà trắng to.
    pieces.push(...giftPieces(fx(0.18), p1, cz, 0.36, 0.3, 0.28, GIFT_WHITE, RIBBON));
    pieces.push(...giftPieces(fx(0.5), p1, cz, 0.3, 0.34, 0.28, GIFT_WHITE, RIBBON));
    pieces.push(...giftPieces(fx(0.82), p1, cz, 0.32, 0.28, 0.28, GIFT_WHITE, RIBBON));
    // Tầng ba: một hộp quà, hai cuốn sách dựng, một cuốn nằm.
    pieces.push(...giftPieces(fx(0.2), p2, cz, 0.34, 0.26, 0.26, GIFT_WHITE, RIBBON));
    pieces.push(
      piece(new BoxGeometry(0.2, 0.26, 0.05), 0xd94f9a, {
        position: [fx(0.55), p2 + 0.13, cz + 0.04],
        rotation: [-0.08, 0, 0],
      }),
      piece(new BoxGeometry(0.22, 0.28, 0.05), 0x1f2a44, {
        position: [fx(0.82), p2 + 0.14, cz + 0.04],
        rotation: [-0.08, 0, 0],
      }),
      boxPiece(
        { minX: fx(0.55) - 0.16, maxX: fx(0.55) + 0.16, minZ: cz - 0.02, maxZ: cz + 0.12 },
        p2,
        p2 + 0.04,
        0x2b2b30,
      ),
    );
    // Tầng trên: hộp quà nhỏ và hai ba lô.
    pieces.push(...giftPieces(fx(0.13), p3, cz, 0.18, 0.26, 0.2, GIFT_WHITE, RIBBON));
    pieces.push(...backpackPieces(fx(0.42), p3, cz, 0x6b4a33, 0x2a1d14));
    pieces.push(...backpackPieces(fx(0.75), p3, cz, 0x5a5a63, 0xe9e4da));
  });
  return pieces;
}

/**
 * Decor rải dọc tường tây từ cổng vào trong: kệ giày cạnh cổng, giá treo áo trên tường, bục
 * trưng bày, bục ống quẻ KPI. Tượng gấu dựng riêng (bearGeometry).
 */
function decorPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { pedestals, bear, shoeRack, coatRacks } = layout.decor;
  // Kệ giày gỗ đen ba tầng, trên có vài đôi giày (một đôi đỏ).
  const r = shoeRack;
  pieces.push(boxPiece({ ...r, maxX: r.minX + 0.02 }, 0, 0.62, 0x1c1c21));
  pieces.push(boxPiece({ ...r, maxZ: r.minZ + 0.03 }, 0, 0.62, BLACK));
  pieces.push(boxPiece({ ...r, minZ: r.maxZ - 0.03 }, 0, 0.62, BLACK));
  for (const y of [0.04, 0.24, 0.44, 0.6]) pieces.push(boxPiece(r, y - 0.02, y, BLACK));
  // Giày sneaker: đế trắng, thân nhiều màu (một đôi đỏ), mũi tròn.
  const shoeColors = [CREAM, BLACK, RED, GRAY_LIGHT, 0x2b3a4f, CREAM, BLACK, 0x6b5a44, GRAY_LIGHT];
  shoeColors.forEach((color, i) => {
    const level = Math.floor(i / 3);
    const z = r.minZ + 0.2 + (i % 3) * 0.4;
    const y = 0.04 + level * 0.2;
    for (const dz of [-0.06, 0.06]) {
      const sx = (r.minX + r.maxX) / 2 + 0.03;
      pieces.push(
        boxPiece(
          { minX: sx - 0.13, maxX: sx + 0.13, minZ: z + dz - 0.045, maxZ: z + dz + 0.045 },
          y,
          y + 0.025,
          0xf4f2ee,
        ),
      );
      pieces.push(
        piece(new CapsuleGeometry(0.04, 0.16, 3, 8), color, {
          position: [sx, y + 0.06, z + dz],
          rotation: [0, 0, Math.PI / 2],
          scale: [1, 1, 1.05],
        }),
      );
      pieces.push(
        piece(new SphereGeometry(0.045, 8, 6), color, {
          position: [sx - 0.07, y + 0.085, z + dz],
          scale: [1, 0.8, 0.9],
        }),
      );
    }
  });
  // Kệ treo áo: khung thép đen, thanh treo chạy theo cạnh dài của kệ, kệ dưới để hộp.
  // u: dọc thanh treo, v: ngang thanh (tính từ tâm kệ).
  coatRacks.forEach((c, rackIndex) => {
    const alongX = c.maxX - c.minX > c.maxZ - c.minZ;
    const rcx = (c.minX + c.maxX) / 2;
    const rcz = (c.minZ + c.maxZ) / 2;
    const half = (alongX ? c.maxX - c.minX : c.maxZ - c.minZ) / 2;
    const halfD = (alongX ? c.maxZ - c.minZ : c.maxX - c.minX) / 2;
    const rackBox = (
      u0: number,
      u1: number,
      v0: number,
      v1: number,
      y0: number,
      y1: number,
      color: number,
    ): Piece =>
      boxPiece(
        alongX
          ? { minX: rcx + u0, maxX: rcx + u1, minZ: rcz + v0, maxZ: rcz + v1 }
          : { minX: rcx + v0, maxX: rcx + v1, minZ: rcz + u0, maxZ: rcz + u1 },
        y0,
        y1,
        color,
      );
    for (const u of [-half + 0.04, half - 0.04]) {
      pieces.push(rackBox(u - 0.02, u + 0.02, -0.02, 0.02, 0, 1.65, FRAME));
      pieces.push(rackBox(u - 0.03, u + 0.03, -halfD, halfD, 0, 0.03, FRAME));
    }
    pieces.push(
      piece(new CylinderGeometry(0.014, 0.014, half * 2, 8), STEEL, {
        position: [rcx, 1.62, rcz],
        rotation: alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0],
      }),
    );
    pieces.push(
      rackBox(-half + 0.03, half - 0.03, -halfD + 0.06, halfD - 0.06, 0.22, 0.25, 0x1c1c21),
    );
    // Bảy áo phông oversize treo dọc (vuông góc thanh như giá thật), cách thưa, đen / trắng / đỏ.
    const teeRng = seededRng(73 + rackIndex);
    const teeColors = [TEE_BLACK, TEE_WHITE, RED, TEE_BLACK, RED, TEE_WHITE, TEE_BLACK];
    const gap = 0.25;
    const railAngle = alongX ? Math.PI / 2 : 0;
    teeColors.forEach((color, k) => {
      const u = (k - (teeColors.length - 1) / 2) * gap;
      const jitter = (teeRng() - 0.5) * 0.12;
      const hem = 0.7 + teeRng() * 0.04;
      pieces.push(
        ...teePieces(alongX ? rcx + u : rcx, alongX ? rcz : rcz + u, railAngle, jitter, color, hem),
      );
    });
    // Vài hộp giày trên kệ dưới.
    for (const [du, color] of [
      [-0.62, CREAM],
      [-0.1, BLACK],
      [0.55, GRAY_LIGHT],
    ] as const) {
      pieces.push(rackBox(du - 0.18, du + 0.18, -halfD + 0.08, halfD - 0.08, 0.25, 0.42, color));
    }
  });
  // Bục gấu đen viền thép. Viền chỉ bọc quanh thân (thấp hơn mặt bục), không có mặt trên
  // trùng độ cao với mặt bục, nếu không hai mặt tranh nhau và nhấp nháy (z-fighting).
  pieces.push(boxPiece(bear, 0, 0.14, BLACK));
  pieces.push(
    boxPiece(
      {
        minX: bear.minX - 0.005,
        maxX: bear.maxX + 0.005,
        minZ: bear.minZ - 0.005,
        maxZ: bear.maxZ + 0.005,
      },
      0.112,
      0.13,
      METAL,
    ),
  );
  // Bục trưng bày xám nhạt đầu đen.
  for (const p of pedestals) {
    pieces.push(boxPiece(p, 0, 0.9, 0x6e6e76));
    pieces.push(
      boxPiece(
        { minX: p.minX - 0.02, maxX: p.maxX + 0.02, minZ: p.minZ - 0.02, maxZ: p.maxZ + 0.02 },
        0.9,
        0.94,
        BLACK,
      ),
    );
  }
  // Bục ống quẻ KPI (đen) với ống đỏ và thẻ tre.
  const shelf = layout.fortuneShelf;
  const f = centerOf(shelf);
  pieces.push(boxPiece(shelf, 0, 0.85, BLACK));
  pieces.push(boxPiece(shelf, 0.85, 0.88, METAL));
  pieces.push(
    piece(new CylinderGeometry(0.1, 0.09, 0.32, 16), RED, { position: [f.x, 1.04, f.z] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.105, 0.105, 0.04, 16), GOLD, { position: [f.x, 1.18, f.z] }),
  );
  for (let i = 0; i < 5; i += 1) {
    pieces.push(
      piece(new BoxGeometry(0.02, 0.22, 0.008), 0xe8cf9a, {
        position: [f.x - 0.04 + i * 0.02, 1.26 + (i % 2) * 0.03, f.z + ((i % 3) - 1) * 0.025],
        rotation: [0, 0, (i - 2) * 0.08],
      }),
    );
  }
  return pieces;
}

/**
 * Tượng gấu đỏ cách điệu (~1,2 m cả bục), dựng bằng khối tròn: thân, đầu, tai, mõm, tay chân.
 * Không có chữ hay logo thương hiệu nào.
 */
const TEE_WHITE = 0xf2efe8;
const TEE_BLACK = 0x1c1c21;

/** Pha sáng / tối một màu (nhân từng kênh), dùng cho cổ áo. */
function shade(color: number, factor: number): number {
  const ch = (shift: number): number =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor)) << shift;
  return ch(16) | ch(8) | ch(0);
}

/**
 * Một áo phông oversize trên móc (thân rộng, dài, vai rớt, tay to buông xuống). Dựng theo toạ độ riêng (rộng theo x, mỏng theo z, móc ôm thanh chạy
 * theo z) rồi xoay theo thanh treo (`railAngle`, lệch thêm `jitter`) và đặt tại (x, z).
 */
function teePieces(
  x: number,
  z: number,
  railAngle: number,
  jitter: number,
  color: number,
  hem: number,
): Piece[] {
  const local: Piece[] = [];
  const hook: Piece[] = [];
  const top = 1.46;
  const bodyW = 0.44;
  const thick = 0.038;
  const bodyH = top - hem;
  // Móc: nửa vòng ôm thanh, cổ móc, hai cánh vai.
  hook.push(
    piece(new TorusGeometry(0.02, 0.004, 3, 6, Math.PI), METAL, { position: [0, 1.6, 0] }),
    piece(new CylinderGeometry(0.004, 0.004, 0.05, 4), METAL, { position: [0, 1.555, 0] }),
  );
  for (const side of [-1, 1]) {
    local.push(
      piece(new BoxGeometry(0.22, 0.012, 0.012), 0x2a2a30, {
        position: [side * 0.1, 1.5, 0],
        rotation: [0, 0, -side * 0.3],
      }),
    );
  }
  // Thân rộng, vai rớt thoải, tay áo to buông thấp.
  local.push(
    piece(new BoxGeometry(bodyW, bodyH, thick), color, { position: [0, hem + bodyH / 2, 0] }),
  );
  for (const side of [-1, 1]) {
    local.push(
      piece(new BoxGeometry(bodyW / 2 + 0.03, 0.08, thick), color, {
        position: [side * (bodyW / 4 + 0.015), top - 0.02, 0],
        rotation: [0, 0, -side * 0.18],
      }),
      piece(new BoxGeometry(0.15, 0.25, thick * 0.95), color, {
        position: [side * (bodyW / 2 + 0.055), top - 0.16, 0],
        rotation: [0, 0, side * 0.22],
      }),
    );
  }
  // Cổ tròn (hai mặt) và hình in trước ngực.
  for (const face of [-1, 1]) {
    local.push(
      piece(
        new TorusGeometry(0.058, 0.011, 3, 8, Math.PI),
        shade(color, color === TEE_BLACK ? 1.6 : 0.85),
        {
          position: [0, top - 0.005, face * (thick / 2)],
          rotation: [0, 0, Math.PI],
        },
      ),
    );
  }
  const place = new Matrix4().makeRotationY(railAngle + jitter).setPosition(x, 0, z);
  for (const p of local) p.geometry.applyMatrix4(place);
  // Móc chỉ xoay theo thanh treo (không lệch theo áo): lúc nào cũng ôm thanh.
  const hookPlace = new Matrix4().makeRotationY(railAngle).setPosition(x, 0, z);
  for (const p of hook) p.geometry.applyMatrix4(hookPlace);
  return [...hook, ...local];
}

function bearGeometry(): BufferGeometry {
  const R = 0xd71f27;
  const RD = 0xa3161d;
  const pieces: Piece[] = [
    // Chân.
    piece(new CapsuleGeometry(0.1, 0.16, 4, 12), R, { position: [-0.11, 0.25, 0] }),
    piece(new CapsuleGeometry(0.1, 0.16, 4, 12), R, { position: [0.11, 0.25, 0] }),
    piece(new SphereGeometry(0.11, 14, 10), RD, {
      position: [-0.11, 0.17, 0.05],
      scale: [1, 0.6, 1.3],
    }),
    piece(new SphereGeometry(0.11, 14, 10), RD, {
      position: [0.11, 0.17, 0.05],
      scale: [1, 0.6, 1.3],
    }),
    // Thân tròn trịa.
    piece(new SphereGeometry(0.24, 20, 16), R, { position: [0, 0.56, 0], scale: [1, 1.15, 0.9] }),
    piece(new SphereGeometry(0.14, 16, 12), 0xef5a5f, {
      position: [0, 0.54, 0.13],
      scale: [1, 1.2, 0.5],
    }),
    // Tay.
    piece(new CapsuleGeometry(0.075, 0.22, 4, 10), R, {
      position: [-0.27, 0.6, 0.02],
      rotation: [0, 0, -0.45],
    }),
    piece(new CapsuleGeometry(0.075, 0.22, 4, 10), R, {
      position: [0.27, 0.6, 0.02],
      rotation: [0, 0, 0.45],
    }),
    // Đầu, tai, mõm.
    piece(new SphereGeometry(0.22, 22, 18), R, {
      position: [0, 0.98, 0],
      scale: [1.05, 0.95, 0.95],
    }),
    piece(new SphereGeometry(0.075, 14, 10), R, { position: [-0.16, 1.15, -0.01] }),
    piece(new SphereGeometry(0.075, 14, 10), R, { position: [0.16, 1.15, -0.01] }),
    piece(new SphereGeometry(0.045, 10, 8), 0xef5a5f, {
      position: [-0.16, 1.15, 0.04],
      scale: [1, 1, 0.4],
    }),
    piece(new SphereGeometry(0.045, 10, 8), 0xef5a5f, {
      position: [0.16, 1.15, 0.04],
      scale: [1, 1, 0.4],
    }),
    piece(new SphereGeometry(0.09, 14, 10), 0xf07a7d, {
      position: [0, 0.93, 0.17],
      scale: [1.2, 0.8, 0.8],
    }),
    piece(new SphereGeometry(0.028, 8, 6), 0x1a0a0a, { position: [0, 0.96, 0.24] }),
    piece(new SphereGeometry(0.026, 8, 6), 0x1a0a0a, { position: [-0.08, 1.03, 0.19] }),
    piece(new SphereGeometry(0.026, 8, 6), 0x1a0a0a, { position: [0.08, 1.03, 0.19] }),
  ];
  return mergePieces(pieces);
}

function entrancePieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { maxZ } = layout.bounds;
  const facingIn: [number, number, number] = [0, Math.PI, 0];
  const { doorX, doorWidth, reader } = layout.entrance;
  const doorTop = 2.4;
  pieces.push(
    piece(new PlaneGeometry(doorWidth + 0.2, doorTop + 0.1), FRAME, {
      position: [doorX, (doorTop + 0.1) / 2, maxZ - 0.01],
      rotation: facingIn,
    }),
  );
  for (const side of [-1, 1]) {
    pieces.push(
      piece(new PlaneGeometry(doorWidth / 2 - 0.06, doorTop - 0.12), 0x3b4650, {
        position: [doorX + side * (doorWidth / 4), (doorTop - 0.12) / 2 + 0.05, maxZ - 0.02],
        rotation: facingIn,
      }),
    );
    pieces.push(
      piece(new PlaneGeometry(0.04, 0.6), STEEL, {
        position: [doorX + side * 0.1, 1.1, maxZ - 0.03],
        rotation: facingIn,
      }),
    );
  }
  pieces.push(
    piece(new PlaneGeometry(doorWidth + 0.2, 0.03), NEON, {
      position: [doorX, doorTop + 0.12, maxZ - 0.02],
      rotation: facingIn,
    }),
  );
  // Máy chấm công: trụ đen, màn hình xanh, đèn xanh lá.
  const r = centerOf(reader);
  pieces.push(
    piece(new CylinderGeometry(0.05, 0.08, 0.9, 10), CHARCOAL, { position: [r.x, 0.45, r.z] }),
  );
  pieces.push(
    piece(new BoxGeometry(0.22, 0.3, 0.1), BLACK, {
      position: [r.x, 1.0, r.z],
      rotation: [-0.35, 0, 0],
    }),
  );
  pieces.push(
    piece(new BoxGeometry(0.14, 0.1, 0.02), 0x8fd3ff, {
      position: [r.x, 1.03, r.z - 0.06],
      rotation: [-0.35, 0, 0],
    }),
  );
  pieces.push(
    piece(new SphereGeometry(0.018, 6, 4), 0x6cc28a, { position: [r.x + 0.07, 0.9, r.z - 0.04] }),
  );
  return pieces;
}

function boardPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { minX } = layout.bounds;
  // Hai bảng dán note trên tường tây cạnh dãy ngồi (mặt quay vào phòng, +X): khung đen, nền
  // bần / trắng, giấy note nhiều màu nhạt, vài ghim đỏ.
  const facingEast: [number, number, number] = [0, Math.PI / 2, 0];
  const rng = seededRng(57);
  const noteColors = [0xfff3a8, 0xffffff, 0xd7ecff, 0xffe0e6, 0xe9ffe3, 0xfff3a8, 0xf1ece3];
  const boards: [{ minZ: number; maxZ: number }, number][] = [
    [layout.taskBoard, 0xf3f1ec],
    [layout.ventBoard, 0xa8774f],
  ];
  for (const [b, surface] of boards) {
    const bz = (b.minZ + b.maxZ) / 2;
    const width = b.maxZ - b.minZ;
    pieces.push(
      piece(new PlaneGeometry(width + 0.1, 1.1), FRAME, {
        position: [minX + 0.01, 1.45, bz],
        rotation: facingEast,
      }),
    );
    pieces.push(
      piece(new PlaneGeometry(width, 1.0), surface, {
        position: [minX + 0.02, 1.45, bz],
        rotation: facingEast,
      }),
    );
    for (let i = 0; i < 12; i += 1) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const z = b.minZ + 0.22 + col * ((width - 0.44) / 3) + (rng() - 0.5) * 0.06;
      const y = 1.78 - row * 0.32 + (rng() - 0.5) * 0.05;
      pieces.push(
        piece(new PlaneGeometry(0.22, 0.2), noteColors[i % noteColors.length] ?? 0xffffff, {
          position: [minX + 0.03 + i * 0.0004, y, z],
          rotation: [0, Math.PI / 2, (rng() - 0.5) * 0.25],
        }),
      );
      if (i % 3 === 0) {
        pieces.push(
          piece(new SphereGeometry(0.014, 6, 4), RED, { position: [minX + 0.04, y + 0.07, z] }),
        );
      }
    }
    // Khay bút dưới bảng.
    pieces.push(
      boxPiece(
        { minX, maxX: minX + 0.08, minZ: b.minZ + 0.1, maxZ: b.maxZ - 0.1 },
        0.88,
        0.91,
        METAL,
      ),
    );
  }
  // Máy in: mặt trước (khay giấy, đèn) quay về phía bắc, nơi người chơi đứng dùng.
  // Khay giấy nằm gọn trong khối máy, không thò ra ngoài vùng va chạm.
  const printer = layout.printer;
  pieces.push(boxPiece(printer, 0, 0.55, 0x2b2b31));
  pieces.push(
    boxPiece(
      { ...printer, minX: printer.minX + 0.05, maxX: printer.maxX - 0.05 },
      0.55,
      0.74,
      0x3a3a42,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: printer.minX + 0.15,
        maxX: printer.maxX - 0.15,
        minZ: printer.minZ + 0.02,
        maxZ: printer.minZ + 0.22,
      },
      0.55,
      0.57,
      CREAM,
    ),
  );
  pieces.push(
    piece(new SphereGeometry(0.02, 6, 4), 0x6cc28a, {
      position: [printer.maxX - 0.1, 0.75, printer.minZ + 0.1],
    }),
  );
  for (const cabinet of layout.cabinets) pieces.push(boxPiece(cabinet, 0, 1.2, BLACK));
  return pieces;
}

function staticPieces(layout: OfficeLayout): Piece[] {
  return [
    ...windowPieces(layout),
    ...floorPatches(layout),
    ...glassFramePieces(layout),
    ...ceoPieces(layout),
    ...meetingPieces(layout),
    ...loungePieces(layout),
    ...pantryPieces(layout),
    ...shelfPieces(layout),
    ...decorPieces(layout),
    ...benchPieces(layout),
    ...entrancePieces(layout),
    ...boardPieces(layout),
  ];
}

/** Một tấm phẳng có toạ độ UV lấy một đoạn [u0, u1] của họa tiết (để 3 ô cửa nối liền cảnh). */
function windowPlane(width: number, height: number, u0: number, u1: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) === 0 ? u0 : u1);
  uv.needsUpdate = true;
  return geometry;
}

export function buildOffice(
  layout: OfficeLayout,
  material: Material,
  period: DayPeriod,
): BuiltOffice {
  const group = new Group();
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;

  // Sàn xám đậm hơi bóng (Phong: có vệt phản chiếu đèn).
  const floorTexture = createDarkFloorTexture();
  floorTexture.repeat.set(width / 2, depth / 2);
  const floor = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshPhongMaterial({ map: floorTexture, shininess: 60, specular: new Color(0x3a3a40) }),
  );
  const floorMaterial = floor.material;
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // Trần: mặt phẳng một phía quay xuống. Từ trong phòng thấy trần (không nhìn vượt mép tường ra
  // ngoài được); nhìn từ trên xuống (chế độ "Nhìn từ trên") thì trần trong suốt.
  const CEILING_COLOR = 0x26262b;
  const ceilingMaterial = new MeshLambertMaterial({ color: CEILING_COLOR });
  const ceiling = new Mesh(new PlaneGeometry(width, depth), ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((minX + maxX) / 2, layout.wallHeight - 0.001, (minZ + maxZ) / 2);
  group.add(ceiling);

  // Tường + vách đặc: vật liệu riêng để bật "xuyên thấu".
  const plaster = createPlasterTexture();
  const wallMaterial = new MeshLambertMaterial({ vertexColors: true, map: plaster });
  const walls = new Mesh(addPlanarUv(mergePieces(wallPieces(layout)), 3), wallMaterial);
  walls.receiveShadow = true;
  group.add(walls);
  const partitionMaterial = new MeshLambertMaterial({ vertexColors: true, map: plaster });
  const partitions = new Mesh(
    addPlanarUv(mergePieces(partitionPieces(layout)), 3),
    partitionMaterial,
  );
  partitions.castShadow = true;
  partitions.receiveShadow = true;
  group.add(partitions);
  let xray = false;
  let faded = false;
  let partitionOpacity = 1;
  const applyOpacity = (material: MeshLambertMaterial, opacity: number): void => {
    const transparent = opacity < 0.999;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.depthWrite = !transparent;
      material.needsUpdate = true;
    }
    material.opacity = opacity;
  };

  const neon = new Mesh(
    mergePieces(neonPieces(layout)),
    new MeshBasicMaterial({ vertexColors: true }),
  );
  group.add(neon);

  // Cửa sổ: 3 ô dùng chung một họa tiết thành phố, UV nối liền.
  const cityTexture: CanvasTexture = createCityTexture(period);
  const w = layout.windows;
  const first = w.spans[0]?.minX ?? minX;
  const last = w.spans.at(-1)?.maxX ?? maxX;
  const windowGeometry = mergeTextured(
    w.spans.map((span) => {
      const g = windowPlane(
        span.maxX - span.minX,
        w.top - w.bottom,
        (span.minX - first) / (last - first),
        (span.maxX - first) / (last - first),
      );
      g.translate((span.minX + span.maxX) / 2, (w.top + w.bottom) / 2, minZ + 0.005);
      return g;
    }),
  );
  const windowMesh = new Mesh(windowGeometry, new MeshBasicMaterial({ map: cityTexture }));
  group.add(windowMesh);

  const statics = new Mesh(mergePieces(staticPieces(layout)), material);
  statics.castShadow = true;
  statics.receiveShadow = true;
  group.add(statics);

  // Tượng gấu đỏ bóng (vật liệu Phong riêng cho độ bóng).
  const bearSpot = centerOf(layout.decor.bear);
  const bear = new Mesh(
    bearGeometry(),
    new MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: new Color(0x664444) }),
  );
  bear.position.set(bearSpot.x, 0.14, bearSpot.z);
  bear.rotation.y = Math.PI / 2 - 0.35;
  bear.castShadow = true;
  group.add(bear);
  // Vật trang trí trên bục: nút xoắn đỏ bóng và cúp vàng.
  const [pedA, pedB] = layout.decor.pedestals;
  const ornamentPieces: Piece[] = [
    ...(pedA
      ? [
          piece(new TorusKnotGeometry(0.11, 0.035, 64, 8), RED, {
            position: [centerOf(pedA).x, 1.1, centerOf(pedA).z],
          }),
        ]
      : []),
    ...(pedB
      ? [
          piece(new CylinderGeometry(0.1, 0.05, 0.16, 16), GOLD, {
            position: [centerOf(pedB).x, 1.12, centerOf(pedB).z],
          }),
          piece(new CylinderGeometry(0.02, 0.02, 0.08, 8), GOLD, {
            position: [centerOf(pedB).x, 1.0, centerOf(pedB).z],
          }),
          piece(new CylinderGeometry(0.07, 0.08, 0.04, 12), BLACK, {
            position: [centerOf(pedB).x, 0.96, centerOf(pedB).z],
          }),
          piece(new TorusGeometry(0.05, 0.01, 6, 12), GOLD, {
            position: [centerOf(pedB).x + 0.1, 1.13, centerOf(pedB).z],
            rotation: [0, Math.PI / 2, 0],
          }),
        ]
      : []),
  ];
  if (ornamentPieces.length > 0) group.add(new Mesh(mergePieces(ornamentPieces), bear.material));

  const { width: dw, depth: dd, height: dh } = layout.desk;
  // Đồ trên bàn mỗi chỗ ngồi (mặt bàn dài liền khối nằm trong mesh tĩnh); xoay theo phía ngồi.
  const deskPlaces = layout.desks.map((desk) => ({
    x: desk.x,
    z: desk.z,
    rotY: deskRotation(desk),
  }));
  const desks = instanced(deskItemsGeometry(dw, dd, dh), material, deskPlaces);
  desks.castShadow = true;
  desks.receiveShadow = true;
  group.add(desks);

  const screenTextures = createScreenTextures();
  const screenGeo = screenGeometry(dd, dh);
  screenTextures.forEach((texture, variant) => {
    const placed = layout.desks
      .filter((desk) => desk.screen === variant)
      .map((desk) => ({ x: desk.x, z: desk.z, rotY: deskRotation(desk) }));
    if (placed.length === 0) return;
    const geometry = variant === 0 ? screenGeo : screenGeo.clone();
    group.add(instanced(geometry, new MeshBasicMaterial({ map: texture }), placed));
  });
  // TV phòng họp và màn hình sếp: biểu đồ / mã nguồn tự sáng.
  const tvTexture = screenTextures[2];
  if (tvTexture) {
    const { table, bounds } = layout.meeting;
    const tv = new Mesh(new PlaneGeometry(1.8, 0.92), new MeshBasicMaterial({ map: tvTexture }));
    tv.position.set((table.minX + table.maxX) / 2, 1.55, bounds.maxZ - 0.055);
    tv.rotation.y = Math.PI;
    group.add(tv);
  }
  const ceoDesk = layout.ceoRoom.desk;
  const sheet = screenTextures[1];
  if (sheet) {
    const screen = new Mesh(new PlaneGeometry(0.78, 0.43), new MeshBasicMaterial({ map: sheet }));
    screen.position.set((ceoDesk.minX + ceoDesk.maxX) / 2, 0.45 + 0.46, ceoDesk.minZ + 0.225);
    group.add(screen);
  }

  // Ghế: bàn làm việc (phía bắc bàn, quay mặt về nam) và ghế phòng họp quay vào bàn.
  const chairs = instanced(chairGeometry(), material, [
    ...layout.desks.map((desk) => {
      const dir = deskSeatDir(desk);
      return {
        x: desk.x + dir.x * (dd / 2 + 0.28),
        z: desk.z + dir.z * (dd / 2 + 0.28),
        rotY: deskRotation(desk),
      };
    }),
    ...layout.meeting.seats.map((seat) => ({
      x: seat.x,
      z: seat.z - Math.cos(seat.facing) * 0.03,
      rotY: seat.facing - Math.PI,
    })),
  ]);
  chairs.castShadow = true;
  chairs.receiveShadow = true;
  group.add(chairs);

  const plants = instanced(plantGeometry(), material, layout.plants);
  plants.castShadow = true;
  group.add(plants);

  // Đèn thả trên mỗi bàn + trên bàn họp, bàn sếp; bóng đèn tự sáng; vệt sáng ấm trên mặt bàn.
  // Mỗi cặp bàn quay lưng vào nhau một đèn thả ở giữa dãy.
  const pairSpots = [
    ...new Map(
      layout.desks.map((desk) => {
        const x = desk.x - desk.side * (dd / 2);
        return [`${x.toFixed(2)}|${desk.z.toFixed(2)}`, { x, z: desk.z }];
      }),
    ).values(),
  ];
  const lampSpots = [
    ...pairSpots,
    {
      x: (layout.meeting.table.minX + layout.meeting.table.maxX) / 2 - 0.75,
      z: centerOf(layout.meeting.table).z,
    },
    {
      x: (layout.meeting.table.minX + layout.meeting.table.maxX) / 2 + 0.75,
      z: centerOf(layout.meeting.table).z,
    },
    centerOf(ceoDesk),
    ...layout.pantry.tables.map(centerOf),
  ];
  const h = layout.wallHeight;
  group.add(instanced(pendantGeometry(h), material, lampSpots));
  const bulbGeometry = new CircleGeometry(0.17, 20);
  bulbGeometry.rotateX(Math.PI / 2);
  bulbGeometry.translate(0, PENDANT_Y - 0.17, 0);
  group.add(
    instanced(bulbGeometry, new MeshBasicMaterial({ color: WARM, side: DoubleSide }), lampSpots),
  );
  const poolGeometry = new PlaneGeometry(1.7, 1.7);
  poolGeometry.rotateX(-Math.PI / 2);
  const poolMaterial = new MeshBasicMaterial({
    map: createLightPoolTexture(),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const pools = instanced(poolGeometry, poolMaterial, [
    ...pairSpots.map((p) => ({ ...p, y: dh + 0.004 })),
    ...lampSpots.slice(pairSpots.length).map((p) => ({ ...p, y: 0.47 })),
  ]);
  pools.renderOrder = 1;
  group.add(pools);
  // Bóng đèn cây trong phòng nghỉ (chao ấm tự sáng).
  const { lamp } = layout.lounge;
  const lampShade = new Mesh(
    new CylinderGeometry(0.14, 0.2, 0.26, 18, 1, true),
    new MeshBasicMaterial({ color: 0xffc98a, side: DoubleSide }),
  );
  lampShade.position.set(lamp.x, 1.55, lamp.z);
  group.add(lampShade);

  // Kính: hơi xanh, có vệt phản chiếu chéo; nhìn được cả hai mặt.
  const glassTexture = createGlassTexture();
  const glassPieces = glassWalls(layout).map((glass) => {
    const alongX = glass.maxX - glass.minX > glass.maxZ - glass.minZ;
    const length = alongX ? glass.maxX - glass.minX : glass.maxZ - glass.minZ;
    const g = new PlaneGeometry(length, GLASS_HEIGHT - 0.1);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * length * 0.4);
    uv.needsUpdate = true;
    g.rotateY(alongX ? 0 : Math.PI / 2);
    g.translate((glass.minX + glass.maxX) / 2, GLASS_HEIGHT / 2, (glass.minZ + glass.maxZ) / 2);
    return g;
  });
  const glassMaterial = new MeshBasicMaterial({
    map: glassTexture,
    color: 0xbfd6e2,
    transparent: true,
    opacity: 0.32,
    side: DoubleSide,
    depthWrite: false,
  });
  const glass = new Mesh(mergeTextured(glassPieces), glassMaterial);
  glass.renderOrder = 2;
  group.add(glass);

  // Cửa kính phòng sếp (một tấm trên vách tây, trượt dọc trục Z khi mở) + biển + đèn quẹt thẻ.
  const door = ceoDoor(layout);
  const doorLength = door.maxZ - door.minZ;
  const doorPane = new PlaneGeometry(doorLength - 0.04, GLASS_HEIGHT - 0.12);
  doorPane.translate(0, GLASS_HEIGHT / 2, 0);
  const doorMesh = new Mesh(doorPane, glassMaterial);
  doorMesh.renderOrder = 2;
  const doorFrame = new Mesh(
    mergePieces([
      boxPiece(
        { minX: -doorLength / 2, maxX: -doorLength / 2 + 0.05, minZ: -0.03, maxZ: 0.03 },
        0,
        GLASS_HEIGHT - 0.06,
        FRAME,
      ),
      boxPiece(
        { minX: doorLength / 2 - 0.05, maxX: doorLength / 2, minZ: -0.03, maxZ: 0.03 },
        0,
        GLASS_HEIGHT - 0.06,
        FRAME,
      ),
      boxPiece(
        { minX: -doorLength / 2 + 0.12, maxX: -doorLength / 2 + 0.16, minZ: -0.07, maxZ: 0.07 },
        0.8,
        1.2,
        STEEL,
      ),
    ]),
    material,
  );
  const doorGroup = new Group();
  doorGroup.add(doorMesh, doorFrame);
  doorGroup.rotation.y = Math.PI / 2;
  const doorClosedZ = (door.minZ + door.maxZ) / 2;
  doorGroup.position.set((door.minX + door.maxX) / 2 - 0.06, 0, doorClosedZ);
  group.add(doorGroup);

  const plaque = createPlaqueTexture(STRINGS.ceo.plaque);
  const plaqueMesh = new Mesh(
    new PlaneGeometry(1.1, 0.3),
    new MeshBasicMaterial({ map: plaque, transparent: true }),
  );
  plaqueMesh.position.set(door.minX - 0.03, GLASS_HEIGHT - 0.25, doorClosedZ);
  plaqueMesh.rotation.y = -Math.PI / 2;
  group.add(plaqueMesh);

  const led = new Mesh(
    new BoxGeometry(0.02, 0.06, 0.06),
    new MeshBasicMaterial({ color: 0xe5534b }),
  );
  const reader = layout.ceoRoom.reader;
  led.position.set(reader.minX - 0.011, 1.18, (reader.minZ + reader.maxZ) / 2);
  group.add(led);

  // Nhãn thiết bị pantry trên tường đông (một tấm, ba chữ).
  const { counter, microwave, water } = layout.pantry;
  // Thứ tự từ bắc xuống nam: cây nước (dưới sàn), máy pha cà phê, lò vi sóng; cách đều nhau.
  const labelZ0 = water.z - 0.5;
  const labelZ1 = microwave.z + 0.5;
  const labels = STRINGS.pantryLabels;
  const labelTexture = createLabelTexture(labels, { width: 1536, height: 110, font: 44 });
  const labelMesh = new Mesh(
    new PlaneGeometry(labelZ1 - labelZ0, 0.3),
    new MeshBasicMaterial({ map: labelTexture, transparent: true }),
  );
  labelMesh.position.set(counter.maxX - 0.02, 1.55, (labelZ0 + labelZ1) / 2);
  labelMesh.rotation.y = -Math.PI / 2;
  // Ba nhãn chia đều theo chiều dài; vị trí thiết bị cũng xếp đều (nước, cà phê, lò).
  group.add(labelMesh);

  // Đèn thật (tuỳ mức đồ họa): đèn rọi ấm trên khu bàn, đèn cây phòng nghỉ, đèn phòng sếp,
  // đèn đỏ hắt lên tượng gấu.
  const realLights = new Group();
  const deskCenter = layout.desks.reduce(
    (acc, d) => ({ x: acc.x + d.x / layout.desks.length, z: acc.z + d.z / layout.desks.length }),
    { x: 0, z: 0 },
  );
  for (const dx of [-2.6, 2.2]) {
    const spot = new SpotLight(0xffd7a8, 26, 12, 0.85, 0.7, 1.6);
    spot.position.set(deskCenter.x + dx, h - 0.1, deskCenter.z);
    spot.target.position.set(deskCenter.x + dx, 0, deskCenter.z);
    realLights.add(spot, spot.target);
  }
  const loungeLight = new PointLight(0xffb36b, 5, 4.5, 1.6);
  loungeLight.position.set(lamp.x, 1.55, lamp.z);
  const ceoLight = new PointLight(0xffd2a0, 4, 5, 1.6);
  ceoLight.position.set((ceoDesk.minX + ceoDesk.maxX) / 2, 2.3, (ceoDesk.minZ + ceoDesk.maxZ) / 2);
  const bearLight = new PointLight(0xff3b30, 4, 3.2, 1.6);
  bearLight.position.set(bearSpot.x + 0.9, 1.9, bearSpot.z + 0.4);
  realLights.add(loungeLight, ceoLight, bearLight);
  group.add(realLights);

  let doorOpen = false;
  let doorOffset = 0;
  const codeTexture = screenTextures[0];
  // Ban ngày làm sáng sàn và tường (nhân màu vật liệu); ban đêm giữ tông đen gốc.
  const applyDaylight = (p: DayPeriod): void => {
    const boost = PERIOD_LIGHTING[p].surfaceBoost;
    floorMaterial.color.setScalar(boost);
    wallMaterial.color.setScalar(boost * 0.85);
    partitionMaterial.color.setScalar(boost * 0.85);
    ceilingMaterial.color.setHex(CEILING_COLOR).multiplyScalar(boost * 1.6);
  };
  applyDaylight(period);
  let currentPeriod = period;
  return {
    group,
    setPeriod(next) {
      if (next === currentPeriod) return;
      currentPeriod = next;
      applyDaylight(next);
      drawCityscape(cityTexture.image, next);
      cityTexture.needsUpdate = true;
    },
    update(dt) {
      // Mã trên màn hình cuộn chậm cho văn phòng có "sức sống".
      if (codeTexture) codeTexture.offset.y = (codeTexture.offset.y + dt * 0.04) % 1;
      const fadeTarget = xray || faded ? 0.25 : 1;
      if (partitionOpacity !== fadeTarget) {
        const step = dt * 3;
        partitionOpacity =
          Math.abs(fadeTarget - partitionOpacity) <= step
            ? fadeTarget
            : partitionOpacity + Math.sign(fadeTarget - partitionOpacity) * step;
        applyOpacity(partitionMaterial, partitionOpacity);
        partitions.renderOrder = partitionOpacity < 1 ? 3 : 0;
      }
      const target = doorOpen ? doorLength - 0.08 : 0;
      if (doorOffset !== target) {
        const step = dt * 2.5;
        doorOffset =
          Math.abs(target - doorOffset) <= step
            ? target
            : doorOffset + Math.sign(target - doorOffset) * step;
        doorGroup.position.z = doorClosedZ + doorOffset;
      }
    },
    setCeoDoorOpen(open) {
      doorOpen = open;
      led.material.color.setHex(open ? 0x4caf50 : 0xe5534b);
    },
    setXray(on) {
      xray = on;
      // Phòng kín: xuyên thấu chỉ làm mờ vách bên trong (xem update), tường bao giữ nguyên.
    },
    setPartitionsFaded(on) {
      faded = on;
    },
    setRealLights(on) {
      realLights.visible = on;
    },
  };
}

/**
 * Gắn UV theo mặt phẳng toạ độ thế giới (tường dọc X dùng (x, y), dọc Z dùng (z, y), mặt
 * ngang dùng (x, z)), `scale` mét cho một lần lặp họa tiết: vữa liền mạch trên mọi bức tường.
 */
function addPlanarUv(geometry: BufferGeometry, scale: number): BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const nz = Math.abs(normal.getZ(i));
    const [u, v] = nx > 0.5 ? [z, y] : nz > 0.5 ? [x, y] : [x, z];
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return geometry;
}

/** Gộp các tấm có UV (cửa sổ, kính) thành một geometry. */
function mergeTextured(geometries: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  return merged;
}

/** Biển tên nhỏ vẽ bằng canvas (chữ trắng trên nền đen viền đỏ). */
function createPlaqueTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#111114';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 64, 14);
    ctx.fill();
    ctx.strokeStyle = '#8a8a93';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff6e5';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 38);
  }
  const texture = new CanvasTextureClass(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
