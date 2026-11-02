// Dựng một tầng văn phòng từ OfficeLayout.
// Đồ lặp lại (bàn, ghế, cây, màn hình) dùng InstancedMesh: mỗi loại 1 draw call.
// Đồ chỉ có một cái (pantry, sofa, phòng họp...) gộp chung vào 1 mesh màu đỉnh.
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  CanvasTexture as CanvasTextureClass,
  SRGBColorSpace,
  type BufferGeometry,
  type CanvasTexture,
  type Material,
} from 'three';
import { mergePieces, piece, type Piece } from '../../engine/meshBuilder';
import { STRINGS } from '../../strings';
import type { Aabb } from '../collision';
import { createFloorTileTexture } from '../textures';
import { ceoDoor, ceoGlassWalls, glassWalls, PLANT_SIZE, type OfficeLayout } from './layout';
import { createCityTexture, createScreenTextures, drawCityscape } from './officeTextures';
import type { DayPeriod } from './period';

const WALL = 0xf6e7d8;
const BASEBOARD = 0xc9a684;
const WOOD = 0xd9a46c;
const WHITE = 0xf2efe9;
const DARK = 0x3a3f4b;
const FRAME = 0xb8c2cc;
const GLASS_HEIGHT = 2.2;

export interface BuiltOffice {
  readonly group: Group;
  setPeriod(period: DayPeriod): void;
  update(dt: number): void;
  /** Cửa phòng CEO: mở (có thẻ) thì cánh kính trượt sang bên, đèn máy quẹt thẻ xanh. */
  setCeoDoorOpen(open: boolean): void;
}

function boxPiece(b: Aabb, y0: number, y1: number, color: number): Piece {
  return piece(new BoxGeometry(b.maxX - b.minX, y1 - y0, b.maxZ - b.minZ), color, {
    position: [(b.minX + b.maxX) / 2, (y0 + y1) / 2, (b.minZ + b.maxZ) / 2],
  });
}

function instanced(
  geometry: BufferGeometry,
  material: Material,
  transforms: readonly { x: number; z: number; rotY?: number }[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, transforms.length);
  const matrix = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const scale = new Vector3(1, 1, 1);
  transforms.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rotY ?? 0);
    mesh.setMatrixAt(i, matrix.compose(new Vector3(t.x, 0, t.z), q, scale));
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

/** Bàn làm việc, tâm ở gốc toạ độ; người ngồi phía +Z. */
function deskGeometry(w: number, d: number, h: number): BufferGeometry {
  const monitorY = h + MONITOR_LIFT;
  return mergePieces([
    piece(new BoxGeometry(w, 0.04, d), WOOD, { position: [0, h - 0.02, 0] }),
    piece(new BoxGeometry(0.05, h - 0.04, d - 0.06), WHITE, {
      position: [-w / 2 + 0.05, (h - 0.04) / 2, 0],
    }),
    piece(new BoxGeometry(0.05, h - 0.04, d - 0.06), WHITE, {
      position: [w / 2 - 0.05, (h - 0.04) / 2, 0],
    }),
    piece(new BoxGeometry(w - 0.1, h * 0.5, 0.03), WHITE, {
      position: [0, h * 0.5, -d / 2 + 0.05],
    }),
    // Màn hình (phần vỏ; mặt hiển thị là InstancedMesh riêng).
    piece(new BoxGeometry(0.62, 0.38, 0.04), DARK, { position: [0, monitorY, -d / 2 + 0.15] }),
    // Chân đế cao (kiểu tay đỡ màn hình) và đế tròn.
    piece(new CylinderGeometry(0.025, 0.03, MONITOR_STAND, 8), DARK, {
      position: [0, h + MONITOR_STAND / 2, -d / 2 + 0.15],
    }),
    piece(new CylinderGeometry(0.09, 0.1, 0.02, 14), DARK, {
      position: [0, h + 0.01, -d / 2 + 0.15],
    }),
    piece(new BoxGeometry(0.36, 0.015, 0.12), 0x4a4f5c, { position: [0, h + 0.008, d / 2 - 0.17] }),
    piece(new BoxGeometry(0.06, 0.012, 0.09), 0xe6e6ea, {
      position: [0.27, h + 0.006, d / 2 - 0.17],
    }),
    piece(new CylinderGeometry(0.035, 0.03, 0.08, 10), 0xffffff, {
      position: [w / 2 - 0.2, h + 0.04, -0.02],
    }),
    piece(new BoxGeometry(0.2, 0.03, 0.27), 0xfdfaf0, {
      position: [-w / 2 + 0.25, h + 0.015, 0],
      rotation: [0, 0.2, 0],
    }),
  ]);
}

/** Màn hình hiển thị (mặt phẳng), cùng toạ độ với deskGeometry. */
function screenGeometry(d: number, h: number): BufferGeometry {
  const geometry = new PlaneGeometry(0.56, 0.33);
  geometry.translate(0, h + MONITOR_LIFT, -d / 2 + 0.15 + 0.021);
  return geometry;
}

/** Ghế văn phòng, người ngồi quay mặt về -Z (lưng tựa ở phía +Z). */
function chairGeometry(): BufferGeometry {
  return mergePieces([
    piece(new BoxGeometry(0.36, 0.06, 0.34), 0x5c8fa8, { position: [0, 0.24, 0] }),
    piece(new BoxGeometry(0.34, 0.3, 0.05), 0x5c8fa8, {
      position: [0, 0.44, 0.19],
      rotation: [-0.12, 0, 0],
    }),
    piece(new CylinderGeometry(0.025, 0.025, 0.2, 8), 0x9aa3ad, { position: [0, 0.12, 0] }),
    piece(new BoxGeometry(0.42, 0.03, 0.05), 0x6b737d, { position: [0, 0.025, 0] }),
    piece(new BoxGeometry(0.05, 0.03, 0.42), 0x6b737d, { position: [0, 0.025, 0] }),
  ]);
}

function plantGeometry(): BufferGeometry {
  const r = PLANT_SIZE / 2;
  return mergePieces([
    piece(new CylinderGeometry(r * 0.75, r * 0.55, 0.34, 14), 0xe08a6d, { position: [0, 0.17, 0] }),
    piece(new CylinderGeometry(r * 0.7, r * 0.7, 0.02, 14), 0x6b4a32, { position: [0, 0.33, 0] }),
    piece(new SphereGeometry(r * 0.95, 12, 9), 0x77b07a, {
      position: [0, 0.62, 0],
      scale: [1, 1.15, 1],
    }),
    piece(new SphereGeometry(r * 0.6, 10, 8), 0x8cc58c, { position: [r * 0.3, 0.92, r * 0.1] }),
    piece(new SphereGeometry(r * 0.5, 10, 8), 0x6aa56e, { position: [-r * 0.35, 0.82, -r * 0.15] }),
  ]);
}

function wallPieces(layout: OfficeLayout): Piece[] {
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const h = layout.wallHeight;
  const w = layout.window;
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
    // Tường kính phía sau: phần dưới, phần trên và hai mép ngoài khung cửa.
    plane(width, w.bottom, cx, w.bottom / 2, minZ, 0),
    plane(width, h - w.top, cx, (h + w.top) / 2, minZ, 0),
    plane(w.minX - minX, w.top - w.bottom, (minX + w.minX) / 2, (w.top + w.bottom) / 2, minZ, 0),
    plane(maxX - w.maxX, w.top - w.bottom, (maxX + w.maxX) / 2, (w.top + w.bottom) / 2, minZ, 0),
  ];
  // Len chân tường (nhô vào 2 cm).
  const walls = [
    { x: cx, z: maxZ - 0.02, rotY: Math.PI, length: width },
    { x: cx, z: minZ + 0.02, rotY: 0, length: width },
    { x: minX + 0.02, z: cz, rotY: Math.PI / 2, length: depth },
    { x: maxX - 0.02, z: cz, rotY: -Math.PI / 2, length: depth },
  ];
  for (const wall of walls)
    pieces.push(plane(wall.length, 0.14, wall.x, 0.07, wall.z, wall.rotY, BASEBOARD));
  return pieces;
}

/** Đồ chỉ có một cái: gộp tất cả vào một mesh. */
function staticPieces(layout: OfficeLayout): Piece[] {
  const pieces: Piece[] = [];
  const { minZ } = layout.bounds;
  const w = layout.window;

  // Khung cửa kính: bậu, khung trên và các thanh dọc mỗi 2,5 m.
  const sill = { minX: w.minX, maxX: w.maxX, minZ, maxZ: minZ + 0.16 };
  pieces.push(boxPiece(sill, w.bottom - 0.04, w.bottom, 0xe9e3da));
  pieces.push(boxPiece({ ...sill, maxZ: minZ + 0.06 }, w.top, w.top + 0.05, FRAME));
  for (let x = w.minX; x <= w.maxX + 0.01; x += 2.5) {
    pieces.push(
      boxPiece({ minX: x - 0.03, maxX: x + 0.03, minZ, maxZ: minZ + 0.06 }, w.bottom, w.top, FRAME),
    );
  }

  // Thảm và nền các khu (mỏng, nằm sát sàn).
  const floorPatch = (b: Aabb, color: number): Piece => boxPiece(b, 0.001, 0.008, color);
  pieces.push(floorPatch(layout.meeting.bounds, 0x9db7c9));
  pieces.push(floorPatch(layout.pantry.floor, 0xf4efe6));
  pieces.push(floorPatch(layout.lounge.rug, 0xf3b9a7));
  pieces.push(floorPatch(layout.ceoRoom.bounds, 0xc9a98a));

  // Phòng họp: bàn dài, khung kính.
  const table = layout.meeting.table;
  pieces.push(boxPiece(table, 0.4, 0.45, 0xf0e2cf));
  pieces.push(
    boxPiece(
      {
        minX: table.minX + 0.4,
        maxX: table.minX + 0.5,
        minZ: table.minZ + 0.3,
        maxZ: table.maxZ - 0.3,
      },
      0,
      0.4,
      DARK,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: table.maxX - 0.5,
        maxX: table.maxX - 0.4,
        minZ: table.minZ + 0.3,
        maxZ: table.maxZ - 0.3,
      },
      0,
      0.4,
      DARK,
    ),
  );
  for (const glass of [...glassWalls(layout), ...ceoGlassWalls(layout)]) {
    const posts =
      glass.maxX - glass.minX > glass.maxZ - glass.minZ
        ? [
            { ...glass, maxX: glass.minX + 0.06 },
            { ...glass, minX: glass.maxX - 0.06 },
          ]
        : [
            { ...glass, maxZ: glass.minZ + 0.06 },
            { ...glass, minZ: glass.maxZ - 0.06 },
          ];
    for (const post of posts) pieces.push(boxPiece(post, 0, GLASS_HEIGHT, FRAME));
    pieces.push(boxPiece(glass, GLASS_HEIGHT - 0.05, GLASS_HEIGHT, FRAME));
    pieces.push(boxPiece(glass, 0, 0.05, FRAME));
  }

  // Phòng CEO: bàn gỗ sẫm, màn hình quay về phía người ngồi (phía cửa kính), biển tên,
  // máy quẹt thẻ gắn mặt ngoài vách trước.
  const ceo = layout.ceoRoom;
  const cd = ceo.desk;
  const DESK_TOP = 0.43;
  pieces.push(boxPiece(cd, DESK_TOP - 0.05, DESK_TOP, 0x7a4e32));
  pieces.push(boxPiece({ ...cd, minZ: cd.maxZ - 0.06 }, 0.05, DESK_TOP - 0.05, 0x8d5e3c));
  pieces.push(boxPiece({ ...cd, maxX: cd.minX + 0.08 }, 0, DESK_TOP - 0.05, 0x8d5e3c));
  pieces.push(boxPiece({ ...cd, minX: cd.maxX - 0.08 }, 0, DESK_TOP - 0.05, 0x8d5e3c));
  const cx = (cd.minX + cd.maxX) / 2;
  pieces.push(
    boxPiece(
      { minX: cx - 0.36, maxX: cx + 0.36, minZ: cd.maxZ - 0.2, maxZ: cd.maxZ - 0.15 },
      DESK_TOP + 0.2,
      DESK_TOP + 0.62,
      DARK,
    ),
  );
  pieces.push(
    boxPiece(
      { minX: cx - 0.04, maxX: cx + 0.04, minZ: cd.maxZ - 0.2, maxZ: cd.maxZ - 0.14 },
      DESK_TOP,
      DESK_TOP + 0.22,
      DARK,
    ),
  );
  pieces.push(
    boxPiece(
      { minX: cd.minX + 0.12, maxX: cd.minX + 0.42, minZ: cd.minZ + 0.08, maxZ: cd.minZ + 0.16 },
      DESK_TOP,
      DESK_TOP + 0.08,
      0xf2c14e,
    ),
  );
  pieces.push(boxPiece(ceo.reader, 0.95, 1.25, DARK));

  // Pantry: quầy, máy pha cà phê, tủ lạnh, bàn tròn.
  const { counter, coffee, fridge, table: pantryTable } = layout.pantry;
  pieces.push(boxPiece(counter, 0, 0.56, 0xb7d3c4));
  pieces.push(boxPiece(counter, 0.56, 0.6, 0xf6f3ee));
  pieces.push(
    piece(new BoxGeometry(0.34, 0.42, 0.36), 0x3d3f47, { position: [coffee.x, 0.81, coffee.z] }),
  );
  pieces.push(
    piece(new BoxGeometry(0.3, 0.12, 0.3), 0x2b2c31, {
      position: [coffee.x, 0.62 + 0.42 + 0.06, coffee.z],
    }),
  );
  pieces.push(
    piece(new BoxGeometry(0.04, 0.08, 0.1), 0x9aa3ad, {
      position: [coffee.x - 0.17, 0.82, coffee.z],
    }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.04, 0.035, 0.08, 10), 0xffffff, {
      position: [coffee.x - 0.12, 0.64, coffee.z],
    }),
  );
  pieces.push(
    piece(new SphereGeometry(0.018, 6, 4), 0xff5a4f, {
      position: [coffee.x - 0.172, 0.96, coffee.z + 0.1],
    }),
  );
  for (let i = 0; i < 3; i += 1) {
    pieces.push(
      piece(
        new CylinderGeometry(0.035, 0.03, 0.07, 10),
        [0xf28a8a, 0x8fc7ff, 0xffd479][i] ?? 0xffffff,
        {
          position: [coffee.x, 0.635, coffee.z + 0.5 + i * 0.12],
        },
      ),
    );
  }
  pieces.push(boxPiece(fridge, 0, 1.35, 0xeaf1f5));
  pieces.push(
    boxPiece(
      {
        minX: fridge.minX - 0.005,
        maxX: fridge.minX,
        minZ: fridge.minZ + 0.05,
        maxZ: fridge.maxZ - 0.05,
      },
      0.88,
      0.9,
      0xb8c2cc,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: fridge.minX - 0.04,
        maxX: fridge.minX,
        minZ: fridge.minZ + 0.1,
        maxZ: fridge.minZ + 0.14,
      },
      0.95,
      1.25,
      0x9aa3ad,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: fridge.minX - 0.04,
        maxX: fridge.minX,
        minZ: fridge.minZ + 0.1,
        maxZ: fridge.minZ + 0.14,
      },
      0.45,
      0.8,
      0x9aa3ad,
    ),
  );
  const ptx = (pantryTable.minX + pantryTable.maxX) / 2;
  const ptz = (pantryTable.minZ + pantryTable.maxZ) / 2;
  pieces.push(
    piece(new CylinderGeometry(0.45, 0.45, 0.04, 20), WHITE, { position: [ptx, 0.42, ptz] }),
  );
  pieces.push(piece(new CylinderGeometry(0.04, 0.04, 0.4, 8), DARK, { position: [ptx, 0.2, ptz] }));
  pieces.push(
    piece(new CylinderGeometry(0.22, 0.22, 0.02, 16), DARK, { position: [ptx, 0.01, ptz] }),
  );

  // Khu nghỉ trưa: sofa và bàn trà.
  const { sofa, table: loungeTable } = layout.lounge;
  pieces.push(boxPiece({ ...sofa, maxZ: sofa.maxZ - 0.25 }, 0, 0.3, 0xf0a7a0));
  pieces.push(boxPiece({ ...sofa, minZ: sofa.maxZ - 0.25 }, 0, 0.7, 0xe8968f));
  pieces.push(boxPiece({ ...sofa, maxX: sofa.minX + 0.2 }, 0, 0.45, 0xe8968f));
  pieces.push(boxPiece({ ...sofa, minX: sofa.maxX - 0.2 }, 0, 0.45, 0xe8968f));
  for (const x of layout.lounge.seatXs) {
    pieces.push(
      piece(new BoxGeometry(0.5, 0.12, 0.35), 0xffd0b8, {
        position: [x, 0.5, sofa.maxZ - 0.33],
        rotation: [-0.3, 0, 0],
      }),
    );
  }
  pieces.push(boxPiece(loungeTable, 0.26, 0.3, WOOD));
  pieces.push(
    boxPiece(
      {
        ...loungeTable,
        minX: loungeTable.minX + 0.1,
        maxX: loungeTable.maxX - 0.1,
        minZ: loungeTable.minZ + 0.1,
        maxZ: loungeTable.maxZ - 0.1,
      },
      0,
      0.26,
      0xb98552,
    ),
  );

  // Máy in.
  const printer = layout.printer;
  pieces.push(boxPiece(printer, 0, 0.5, 0xdedfe3));
  pieces.push(
    boxPiece(
      { ...printer, minX: printer.minX + 0.05, maxX: printer.maxX - 0.05 },
      0.5,
      0.7,
      0xc7c9cf,
    ),
  );
  pieces.push(
    boxPiece(
      {
        minX: printer.minX + 0.15,
        maxX: printer.maxX - 0.15,
        minZ: printer.minZ - 0.2,
        maxZ: printer.minZ + 0.05,
      },
      0.5,
      0.52,
      0xffffff,
    ),
  );
  pieces.push(
    piece(new SphereGeometry(0.02, 6, 4), 0x6cc28a, {
      position: [printer.maxX - 0.1, 0.71, printer.minZ + 0.1],
    }),
  );

  // Tủ hồ sơ sát tường trái.
  for (const cabinet of layout.cabinets) {
    pieces.push(boxPiece(cabinet, 0, 1.2, 0x9cb8c9));
    for (let i = 0; i < 3; i += 1) {
      const y = 0.2 + i * 0.38;
      pieces.push(
        boxPiece(
          {
            minX: cabinet.maxX,
            maxX: cabinet.maxX + 0.02,
            minZ: cabinet.minZ + 0.1,
            maxZ: cabinet.maxZ - 0.1,
          },
          y,
          y + 0.3,
          0xbcd3e0,
        ),
      );
    }
  }

  // Tranh trang trí trên tường trước: mặt phẳng một phía quay vào phòng, nên giống tường,
  // nhìn từ ngoài vào (camera vòng ra sau tường) thì không thấy.
  const { maxZ } = layout.bounds;
  const facingIn: [number, number, number] = [0, Math.PI, 0];
  [
    [-6, 0xffd479],
    [-1, 0x8fc7ff],
    [8, 0xf28a8a],
  ].forEach(([x = 0, color = 0xffffff]) => {
    pieces.push(
      piece(new PlaneGeometry(1.1, 0.75), 0xffffff, {
        position: [x, 1.7, maxZ - 0.01],
        rotation: facingIn,
      }),
    );
    pieces.push(
      piece(new PlaneGeometry(0.9, 0.55), color, {
        position: [x, 1.7, maxZ - 0.02],
        rotation: facingIn,
      }),
    );
    pieces.push(
      piece(new CircleGeometry(0.12, 16), 0xffffff, {
        position: [x + 0.18, 1.75, maxZ - 0.03],
        rotation: facingIn,
      }),
    );
  });

  // Cửa ra vào (hai cánh kính, khung tối) và máy quẹt thẻ chấm công.
  const { doorX, doorWidth, reader } = layout.entrance;
  const doorTop = 2.2;
  pieces.push(
    piece(new PlaneGeometry(doorWidth + 0.16, doorTop + 0.08), 0x5d6670, {
      position: [doorX, (doorTop + 0.08) / 2, maxZ - 0.01],
      rotation: facingIn,
    }),
  );
  for (const side of [-1, 1]) {
    pieces.push(
      piece(new PlaneGeometry(doorWidth / 2 - 0.06, doorTop - 0.1), 0xb9d7e6, {
        position: [doorX + side * (doorWidth / 4), (doorTop - 0.1) / 2 + 0.04, maxZ - 0.02],
        rotation: facingIn,
      }),
    );
    pieces.push(
      piece(new PlaneGeometry(0.04, 0.5), 0xd0d4d8, {
        position: [doorX + side * 0.1, 1.05, maxZ - 0.03],
        rotation: facingIn,
      }),
    );
  }
  const rx = (reader.minX + reader.maxX) / 2;
  const rz = (reader.minZ + reader.maxZ) / 2;
  pieces.push(
    piece(new CylinderGeometry(0.05, 0.08, 0.9, 10), 0x6b737d, { position: [rx, 0.45, rz] }),
  );
  pieces.push(
    piece(new BoxGeometry(0.22, 0.3, 0.1), 0x3d3f47, {
      position: [rx, 1.0, rz],
      rotation: [-0.35, 0, 0],
    }),
  );
  pieces.push(
    piece(new BoxGeometry(0.14, 0.1, 0.02), 0x8fd3ff, {
      position: [rx, 1.03, rz - 0.06],
      rotation: [-0.35, 0, 0],
    }),
  );
  pieces.push(
    piece(new SphereGeometry(0.018, 6, 4), 0x6cc28a, { position: [rx + 0.07, 0.9, rz - 0.04] }),
  );

  // Kệ nhỏ sát tường trái, trên có ống quẻ KPI màu đỏ với các thẻ tre.
  const shelf = layout.fortuneShelf;
  const sx = (shelf.minX + shelf.maxX) / 2;
  const sz = (shelf.minZ + shelf.maxZ) / 2;
  pieces.push(boxPiece(shelf, 0, 0.55, 0xb98552));
  pieces.push(boxPiece(shelf, 0.55, 0.59, WOOD));
  pieces.push(
    piece(new CylinderGeometry(0.1, 0.09, 0.32, 16), 0xd94b4b, { position: [sx, 0.75, sz] }),
  );
  pieces.push(
    piece(new CylinderGeometry(0.105, 0.105, 0.04, 16), 0xf2c14e, { position: [sx, 0.88, sz] }),
  );
  for (let i = 0; i < 5; i += 1) {
    pieces.push(
      piece(new BoxGeometry(0.02, 0.22, 0.008), 0xe8cf9a, {
        position: [sx - 0.04 + i * 0.02, 0.96 + (i % 2) * 0.03, sz + ((i % 3) - 1) * 0.025],
        rotation: [0, 0, (i - 2) * 0.08],
      }),
    );
  }

  // Bảng việc trên tường phải: bảng trắng có giấy nhớ màu (mặt phẳng quay vào phòng).
  const { maxX } = layout.bounds;
  const board = layout.taskBoard;
  const bz = (board.minZ + board.maxZ) / 2;
  const facingWest: [number, number, number] = [0, -Math.PI / 2, 0];
  pieces.push(
    piece(new PlaneGeometry(board.maxZ - board.minZ + 0.1, 1.0), 0x9aa3ad, {
      position: [maxX - 0.01, 1.45, bz],
      rotation: facingWest,
    }),
  );
  pieces.push(
    piece(new PlaneGeometry(board.maxZ - board.minZ, 0.9), 0xfbfbf8, {
      position: [maxX - 0.02, 1.45, bz],
      rotation: facingWest,
    }),
  );
  const notes = [0xffd479, 0x8fc7ff, 0xf28a8a, 0x9fe0a8, 0xffd479, 0xd6b4ff];
  notes.forEach((color, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    pieces.push(
      piece(new PlaneGeometry(0.32, 0.26), color, {
        position: [maxX - 0.03, 1.66 - row * 0.4, board.maxZ - 0.35 - col * 0.55],
        rotation: [0, -Math.PI / 2, (i % 2 ? 1 : -1) * 0.06],
      }),
    );
  });

  // Tường than thở: bảng ghim bần trên tường trước, dán những mẩu giấy nhỏ.
  const vent = layout.ventBoard;
  const vx = (vent.minX + vent.maxX) / 2;
  pieces.push(
    piece(new PlaneGeometry(vent.maxX - vent.minX + 0.1, 1.0), 0x8a5a3b, {
      position: [vx, 1.45, maxZ - 0.01],
      rotation: facingIn,
    }),
  );
  pieces.push(
    piece(new PlaneGeometry(vent.maxX - vent.minX, 0.9), 0xc79a6b, {
      position: [vx, 1.45, maxZ - 0.02],
      rotation: facingIn,
    }),
  );
  [0xffffff, 0xfff3c4, 0xffe0e6, 0xe3f2ff, 0xffffff, 0xe9ffe3, 0xfff3c4].forEach((color, i) => {
    pieces.push(
      piece(new PlaneGeometry(0.26, 0.18), color, {
        position: [
          vent.minX + 0.2 + (i % 4) * 0.33,
          1.68 - Math.floor(i / 4) * 0.36 - (i % 2) * 0.06,
          maxZ - 0.03,
        ],
        rotation: [0, Math.PI, ((i % 3) - 1) * 0.1],
      }),
    );
  });
  return pieces;
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

  const floorTexture = createFloorTileTexture();
  floorTexture.repeat.set(width / 2, depth / 2);
  const floor = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshLambertMaterial({ map: floorTexture }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  const walls = new Mesh(mergePieces(wallPieces(layout)), material);
  walls.receiveShadow = true;
  group.add(walls);

  const cityTexture: CanvasTexture = createCityTexture(period);
  const w = layout.window;
  const windowMesh = new Mesh(
    new PlaneGeometry(w.maxX - w.minX, w.top - w.bottom),
    new MeshBasicMaterial({ map: cityTexture }),
  );
  windowMesh.position.set((w.minX + w.maxX) / 2, (w.top + w.bottom) / 2, minZ + 0.005);
  group.add(windowMesh);

  const statics = new Mesh(mergePieces(staticPieces(layout)), material);
  statics.castShadow = true;
  statics.receiveShadow = true;
  group.add(statics);

  const { width: dw, depth: dd, height: dh } = layout.desk;
  const desks = instanced(deskGeometry(dw, dd, dh), material, layout.desks);
  desks.castShadow = true;
  desks.receiveShadow = true;
  group.add(desks);

  const screenTextures = createScreenTextures();
  const screenGeo = screenGeometry(dd, dh);
  screenTextures.forEach((texture, variant) => {
    const placed = layout.desks.filter((desk) => desk.screen === variant);
    if (placed.length === 0) return;
    const geometry = variant === 0 ? screenGeo : screenGeo.clone();
    group.add(instanced(geometry, new MeshBasicMaterial({ map: texture }), placed));
  });

  // Ghế bàn làm việc (sát mép bàn, phía người ngồi) và ghế phòng họp quay vào bàn.
  const chairs = instanced(chairGeometry(), material, [
    ...layout.desks.map((desk) => ({ x: desk.x, z: desk.z + dd / 2 + 0.28 })),
    ...layout.meeting.seats.map((seat) => ({
      x: seat.x,
      z: seat.z - Math.cos(seat.facing) * 0.03,
      rotY: seat.facing - Math.PI,
    })),
    // Ghế CEO: sau bàn, quay mặt ra văn phòng (+Z).
    {
      x: (layout.ceoRoom.desk.minX + layout.ceoRoom.desk.maxX) / 2,
      z: layout.ceoRoom.desk.minZ - 0.28,
      rotY: -Math.PI,
    },
  ]);
  chairs.castShadow = true;
  chairs.receiveShadow = true;
  group.add(chairs);

  const plants = instanced(plantGeometry(), material, layout.plants);
  plants.castShadow = true;
  group.add(plants);

  // Kính phòng họp: một mesh trong suốt, nhìn được cả hai mặt.
  const glassPieces = [...glassWalls(layout), ...ceoGlassWalls(layout)].map((glass) => {
    const alongX = glass.maxX - glass.minX > glass.maxZ - glass.minZ;
    const length = alongX ? glass.maxX - glass.minX : glass.maxZ - glass.minZ;
    return piece(new PlaneGeometry(length, GLASS_HEIGHT - 0.1), 0xffffff, {
      position: [(glass.minX + glass.maxX) / 2, GLASS_HEIGHT / 2, (glass.minZ + glass.maxZ) / 2],
      rotation: [0, alongX ? 0 : Math.PI / 2, 0],
    });
  });
  const glass = new Mesh(
    mergePieces(glassPieces),
    new MeshBasicMaterial({
      color: 0xbfe6ff,
      transparent: true,
      opacity: 0.22,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  glass.renderOrder = 2;
  group.add(glass);

  // Cửa kính phòng CEO (một tấm, trượt sang phải khi mở) + biển "Phòng CEO" + đèn máy quẹt thẻ.
  const door = ceoDoor(layout);
  const doorWidth = door.maxX - door.minX;
  const doorMesh = new Mesh(
    mergePieces([
      piece(new PlaneGeometry(doorWidth - 0.04, GLASS_HEIGHT - 0.12), 0xd7efff, {
        position: [0, GLASS_HEIGHT / 2, 0],
      }),
    ]),
    glass.material,
  );
  doorMesh.renderOrder = 2;
  const doorFrame = new Mesh(
    mergePieces([
      boxPiece(
        { minX: -doorWidth / 2, maxX: -doorWidth / 2 + 0.05, minZ: -0.03, maxZ: 0.03 },
        0,
        GLASS_HEIGHT - 0.06,
        FRAME,
      ),
      boxPiece(
        { minX: doorWidth / 2 - 0.05, maxX: doorWidth / 2, minZ: -0.03, maxZ: 0.03 },
        0,
        GLASS_HEIGHT - 0.06,
        FRAME,
      ),
      boxPiece(
        { minX: doorWidth / 2 - 0.16, maxX: doorWidth / 2 - 0.12, minZ: 0.03, maxZ: 0.07 },
        0.8,
        1.2,
        0xd6dde4,
      ),
    ]),
    material,
  );
  const doorGroup = new Group();
  doorGroup.add(doorMesh, doorFrame);
  const doorClosedX = (door.minX + door.maxX) / 2;
  doorGroup.position.set(doorClosedX, 0, (door.minZ + door.maxZ) / 2 + 0.06);
  group.add(doorGroup);

  const plaque = createPlaqueTexture(STRINGS.ceo.plaque);
  const plaqueMesh = new Mesh(
    new PlaneGeometry(1.1, 0.3),
    new MeshBasicMaterial({ map: plaque, transparent: true }),
  );
  plaqueMesh.position.set(
    doorClosedX + 0.6,
    GLASS_HEIGHT + 0.22,
    layout.ceoRoom.bounds.maxZ + 0.04,
  );
  group.add(plaqueMesh);

  const led = new Mesh(
    new BoxGeometry(0.06, 0.06, 0.02),
    new MeshBasicMaterial({ color: 0xe5534b }),
  );
  const reader = layout.ceoRoom.reader;
  led.position.set((reader.minX + reader.maxX) / 2, 1.18, reader.maxZ + 0.011);
  group.add(led);

  let doorOpen = false;
  let doorOffset = 0;

  const codeTexture = screenTextures[0];
  let currentPeriod = period;
  return {
    group,
    setPeriod(next) {
      if (next === currentPeriod) return;
      currentPeriod = next;
      drawCityscape(cityTexture.image, next);
      cityTexture.needsUpdate = true;
    },
    update(dt) {
      // Mã trên màn hình cuộn chậm cho văn phòng có "sức sống".
      if (codeTexture) codeTexture.offset.y = (codeTexture.offset.y + dt * 0.04) % 1;
      const target = doorOpen ? doorWidth - 0.08 : 0;
      if (doorOffset !== target) {
        const step = dt * 2.5;
        doorOffset =
          Math.abs(target - doorOffset) <= step
            ? target
            : doorOffset + Math.sign(target - doorOffset) * step;
        doorGroup.position.x = doorClosedX + doorOffset;
      }
    },
    setCeoDoorOpen(open) {
      doorOpen = open;
      led.material.color.setHex(open ? 0x4caf50 : 0xe5534b);
    },
  };
}

/** Biển tên nhỏ vẽ bằng canvas (chữ trắng trên nền gỗ sẫm). */
function createPlaqueTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#5d3b26';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 64, 14);
    ctx.fill();
    ctx.strokeStyle = '#f2c14e';
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
