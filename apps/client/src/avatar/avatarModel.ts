// Nhân vật chibi dựng hoàn toàn bằng code. Mỗi bộ phận chuyển động (đầu, thân, 2 tay, 2 chân)
// là MỘT mesh gộp với màu đỉnh, dùng chung một vật liệu: 6 draw call cho cả nhân vật.
// Chuyển động bằng cách xoay/dịch các Group khớp (vai, hông, cổ), không dùng xương.
import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergePieces, piece, type Piece } from '../engine/meshBuilder';
import {
  hairColor,
  OUTFIT_COLORS,
  skinColor,
  type Appearance,
  type HairStyle,
  type Outfit,
} from './appearance';
import {
  bodyAccessoryPieces,
  hatPieces,
  HEAD_ACCESSORIES,
  headAccessoryPieces,
} from './equipmentPieces';
import {
  applyEmote,
  blendPose,
  computePose,
  EMOTE_SECONDS,
  isSeated,
  type PoseName,
  type PoseState,
} from './pose';

/** Đồ đang mặc (từ cửa hàng): màu áo, nón, phụ kiện. */
export interface AvatarGear {
  topTint?: number;
  hat?: { model: string; color: number };
  accessory?: { model: string; color: number };
}

const EYE_COLOR = 0x2d2433;
const BLUSH_COLOR = 0xf4a7a6;

/** Kích thước chính (mét). Nhân vật cao khoảng 1,2 m. */
const HIP_Y = 0.32;
const SHOULDER_Y = 0.57;
const NECK_Y = 0.64;
const HEAD_RADIUS = 0.27;
/**
 * Nằm: nhấc trục người lên (m) để lưng (bán kính thân 0,17) chạm mặt đệm ghế dài (cao 0,32)
 * chứ không lún xuyên qua nệm: trục ở 0,45 + độ nâng chỗ nằm 0,05 = 0,5 m.
 */
const LIE_LIFT = 0.45;

interface OutfitStyle {
  top: number;
  sleeve: number;
  pants: number;
  shoes: number;
  /** Màu chân (mặc váy thì chân trần theo màu da). Mặc định = màu quần. */
  legs?: 'skin';
  /** Chi tiết trang phục; `top` là màu áo đang dùng (có thể đã đổi theo màu người chơi chọn). */
  details(top: number): Piece[];
}

/** Chân váy / vạt áo xoè quanh hông. */
function skirt(color: number, bottomRadius: number, length: number): Piece {
  return piece(new CylinderGeometry(0.168, bottomRadius, length, 20, 1, true), color, {
    position: [0, HIP_Y + 0.02 - length / 2, 0],
  });
}

/** Tối màu đi một chút (viền, cổ áo). */
function darker(color: number, k = 0.8): number {
  const ch = (shift: number): number => Math.round(((color >> shift) & 0xff) * k) << shift;
  return ch(16) | ch(8) | ch(0);
}

const OUTFIT_STYLES: Readonly<Record<Outfit, OutfitStyle>> = {
  shirt: {
    top: 0xfbfbf8,
    sleeve: 0xfbfbf8,
    pants: 0x3e4554,
    shoes: 0x2b2b31,
    details: () => [
      // Cổ áo hai vạt và cà vạt xanh.
      piece(new BoxGeometry(0.09, 0.05, 0.02), 0xe9e9e4, {
        position: [-0.045, 0.6, 0.12],
        rotation: [0.4, 0, -0.5],
      }),
      piece(new BoxGeometry(0.09, 0.05, 0.02), 0xe9e9e4, {
        position: [0.045, 0.6, 0.12],
        rotation: [0.4, 0, 0.5],
      }),
      piece(new BoxGeometry(0.045, 0.16, 0.02), 0x3d6fb6, { position: [0, 0.49, 0.17] }),
      piece(new SphereGeometry(0.028, 8, 6), 0x3d6fb6, { position: [0, 0.575, 0.155] }),
    ],
  },
  suit: {
    top: 0x2f3b5c,
    sleeve: 0x2f3b5c,
    pants: 0x2a3450,
    shoes: 0x4a3328,
    details: () => [
      // Áo sơ mi lộ ra ở cổ chữ V, cà vạt đỏ, khuy áo.
      piece(new BoxGeometry(0.1, 0.13, 0.02), 0xffffff, {
        position: [0, 0.545, 0.158],
        rotation: [-0.25, 0, 0],
      }),
      piece(new BoxGeometry(0.035, 0.12, 0.02), 0xd2464b, {
        position: [0, 0.52, 0.17],
        rotation: [-0.2, 0, 0],
      }),
      piece(new SphereGeometry(0.014, 6, 4), 0xd8c08a, { position: [0, 0.43, 0.172] }),
      piece(new SphereGeometry(0.014, 6, 4), 0xd8c08a, { position: [0, 0.38, 0.17] }),
    ],
  },
  hoodie: {
    top: 0xf3a65d,
    sleeve: 0xf3a65d,
    pants: 0x4b6fa6,
    shoes: 0xf2f2f2,
    details: () => [
      // Mũ trùm sau gáy, túi kangaroo, hai dây rút.
      piece(new TorusGeometry(0.12, 0.05, 8, 16), 0xe8954a, {
        position: [0, 0.6, -0.08],
        rotation: [1.25, 0, 0],
      }),
      piece(new BoxGeometry(0.2, 0.08, 0.02), 0xe8954a, { position: [0, 0.4, 0.165] }),
      piece(new CylinderGeometry(0.008, 0.008, 0.1, 5), 0xffffff, {
        position: [-0.04, 0.55, 0.165],
      }),
      piece(new CylinderGeometry(0.008, 0.008, 0.1, 5), 0xffffff, {
        position: [0.04, 0.55, 0.165],
      }),
    ],
  },
  tee: {
    top: 0xf6f6f2,
    sleeve: 0xf6f6f2,
    pants: 0x4b6fa6,
    shoes: 0xf2f2f2,
    details: (top) => [
      // Cổ tròn và hình in nhỏ trước ngực.
      piece(new TorusGeometry(0.07, 0.014, 6, 16), darker(top), {
        position: [0, 0.618, 0.02],
        rotation: [Math.PI / 2 + 0.3, 0, 0],
      }),
      piece(new BoxGeometry(0.1, 0.07, 0.01), 0xff8a65, { position: [0, 0.49, 0.172] }),
    ],
  },
  blouse: {
    top: 0xfbe4ea,
    sleeve: 0xfbe4ea,
    pants: 0x2f3b5c,
    shoes: 0x2b2b31,
    legs: 'skin',
    details: (top) => [
      // Nơ cổ áo và chân váy bút chì xanh than.
      piece(new SphereGeometry(0.035, 8, 6), darker(top, 0.85), {
        position: [-0.035, 0.6, 0.13],
        scale: [1, 0.6, 0.5],
      }),
      piece(new SphereGeometry(0.035, 8, 6), darker(top, 0.85), {
        position: [0.035, 0.6, 0.13],
        scale: [1, 0.6, 0.5],
      }),
      skirt(0x2f3b5c, 0.18, 0.17),
    ],
  },
  dress: {
    top: 0xf2a7b8,
    sleeve: 0xf2a7b8,
    pants: 0xf2a7b8,
    shoes: 0xd84a4a,
    legs: 'skin',
    details: (top) => [
      // Váy liền xoè cùng màu áo, thắt lưng trắng.
      skirt(top, 0.25, 0.2),
      piece(new CylinderGeometry(0.17, 0.17, 0.03, 18, 1, true), 0xffffff, {
        position: [0, 0.36, 0],
      }),
    ],
  },
  cardigan: {
    top: 0xc98b6b,
    sleeve: 0xc98b6b,
    pants: 0x3e4554,
    shoes: 0x5d4636,
    details: () => [
      // Áo thun trắng bên trong (cổ chữ V) và hàng khuy.
      piece(new BoxGeometry(0.09, 0.2, 0.02), 0xffffff, {
        position: [0, 0.5, 0.162],
        rotation: [-0.1, 0, 0],
      }),
      piece(new SphereGeometry(0.012, 6, 4), 0xf3eadb, { position: [0.06, 0.47, 0.17] }),
      piece(new SphereGeometry(0.012, 6, 4), 0xf3eadb, { position: [0.06, 0.41, 0.172] }),
    ],
  },
  overalls: {
    top: 0xffffff,
    sleeve: 0xffffff,
    pants: 0x5b7fb4,
    shoes: 0xf2f2f2,
    details: () => [
      // Yếm bò trước ngực, hai dây đeo, khuy vàng.
      piece(new BoxGeometry(0.2, 0.16, 0.02), 0x5b7fb4, { position: [0, 0.42, 0.165] }),
      piece(new BoxGeometry(0.03, 0.2, 0.02), 0x5b7fb4, {
        position: [-0.08, 0.53, 0.15],
        rotation: [-0.2, 0, 0.1],
      }),
      piece(new BoxGeometry(0.03, 0.2, 0.02), 0x5b7fb4, {
        position: [0.08, 0.53, 0.15],
        rotation: [-0.2, 0, -0.1],
      }),
      piece(new SphereGeometry(0.014, 6, 4), 0xe0b84a, { position: [-0.075, 0.49, 0.178] }),
      piece(new SphereGeometry(0.014, 6, 4), 0xe0b84a, { position: [0.075, 0.49, 0.178] }),
    ],
  },
  aodai: {
    top: 0xd84a4a,
    sleeve: 0xd84a4a,
    pants: 0xf7f4ee,
    shoes: 0xf3eadb,
    details: (top) => [
      // Cổ cao, hai vạt áo dài trước / sau buông qua gối, hàng khuy chéo.
      piece(new CylinderGeometry(0.06, 0.065, 0.06, 12), top, { position: [0, 0.645, 0] }),
      piece(new BoxGeometry(0.24, 0.26, 0.015), top, { position: [0, 0.17, 0.14] }),
      piece(new BoxGeometry(0.24, 0.26, 0.015), top, { position: [0, 0.17, -0.14] }),
      piece(new SphereGeometry(0.012, 6, 4), 0xf3d78a, { position: [0.05, 0.58, 0.155] }),
      piece(new SphereGeometry(0.012, 6, 4), 0xf3d78a, { position: [0.1, 0.55, 0.155] }),
    ],
  },
  sweater: {
    top: 0x8fbcaa,
    sleeve: 0x8fbcaa,
    pants: 0xc9b18e,
    shoes: 0x5d4636,
    details: () => [
      // Cổ lọ và hai sọc kem quanh thân.
      piece(new TorusGeometry(0.075, 0.03, 8, 16), 0x7fae9b, {
        position: [0, 0.625, 0],
        rotation: [Math.PI / 2, 0, 0],
      }),
      piece(new CylinderGeometry(0.173, 0.173, 0.035, 18, 1, true), 0xf5ecd7, {
        position: [0, 0.47, 0],
      }),
      piece(new CylinderGeometry(0.17, 0.17, 0.035, 18, 1, true), 0xf5ecd7, {
        position: [0, 0.41, 0],
      }),
    ],
  },
};

function hairPieces(style: HairStyle, color: number): Piece[] {
  // Toạ độ trong nhóm đầu: tâm đầu ở y = 0.25, bán kính đầu 0.27, mặt quay về +Z.
  const dark = darker(color, 0.82);
  const tie = 0xf28a8a;
  const ball = (
    r: number,
    x: number,
    y: number,
    z: number,
    scale?: [number, number, number],
    c = color,
  ): Piece =>
    piece(new SphereGeometry(r, 14, 10), c, { position: [x, y, z], ...(scale ? { scale } : {}) });

  // Mái chung: chỏm tròn phồng nhẹ (trán cao, gáy thấp) + lớp phồng phía sau đỉnh đầu.
  const pieces: Piece[] = [
    piece(new SphereGeometry(HEAD_RADIUS + 0.022, 24, 14, 0, Math.PI * 2, 0, 1.5), color, {
      position: [0, 0.265, -0.005],
      rotation: [-0.42, 0, 0],
    }),
    ball(0.2, 0, 0.42, -0.06, [1.25, 0.7, 1.15]),
  ];
  // Mái trước: ba lọn cong nhẹ trên trán (trông mềm hơn một khối mái bằng).
  const fringe = (sweep = 0): void => {
    for (const [x, y, s] of [
      [-0.11, 0.425, 0.95],
      [0.0, 0.44, 1.05],
      [0.11, 0.425, 0.95],
    ] as const) {
      pieces.push(
        piece(new SphereGeometry(0.085, 12, 8), color, {
          position: [x + sweep, y, 0.17],
          scale: [1.1 * s, 0.62, 0.7],
          rotation: [0.45, 0, -x * 1.6],
        }),
      );
    }
  };
  // Hai lọn tóc mai ôm má.
  const sideLocks = (length: number): void => {
    for (const side of [-1, 1]) {
      pieces.push(
        piece(new CapsuleGeometry(0.045, length, 4, 10), color, {
          position: [side * 0.245, 0.3 - length / 2, 0.08],
          rotation: [0.12, 0, side * 0.12],
        }),
      );
    }
  };

  switch (style) {
    case 'short':
      // Ngắn: mái hất sang một bên, hai bên gọn sát tai.
      fringe(0.03);
      pieces.push(
        ball(0.08, -0.235, 0.3, 0.03, [0.7, 1, 1]),
        ball(0.08, 0.235, 0.3, 0.03, [0.7, 1, 1]),
      );
      pieces.push(ball(0.07, 0.12, 0.5, 0.06, [1.2, 0.6, 0.9]));
      break;
    case 'bun':
      // Búi tròn cao trên đỉnh, có dây buộc và hai lọn mai.
      fringe();
      sideLocks(0.1);
      pieces.push(ball(0.12, 0, 0.6, -0.08, [1, 0.95, 1]));
      pieces.push(ball(0.06, 0.07, 0.66, -0.03, undefined, dark));
      pieces.push(
        piece(new TorusGeometry(0.08, 0.02, 8, 18), tie, {
          position: [0, 0.52, -0.07],
          rotation: [Math.PI / 2 - 0.35, 0, 0],
        }),
      );
      break;
    case 'long':
      // Dài: tóc buông qua vai phía sau, hai lọn dài ôm mặt.
      fringe();
      sideLocks(0.26);
      pieces.push(ball(0.28, 0, 0.12, -0.12, [1.05, 1.35, 0.6]));
      pieces.push(ball(0.16, 0, -0.12, -0.15, [1.3, 0.8, 0.55]));
      break;
    case 'ponytail':
      // Đuôi ngựa buộc cao sau gáy, cong xuống.
      fringe();
      sideLocks(0.08);
      pieces.push(ball(0.04, 0, 0.36, -0.27, undefined, tie));
      pieces.push(
        piece(new CapsuleGeometry(0.075, 0.22, 4, 12), color, {
          position: [0, 0.22, -0.34],
          rotation: [0.35, 0, 0],
        }),
      );
      pieces.push(ball(0.07, 0, 0.06, -0.31, [0.9, 1.2, 0.9]));
      break;
    case 'bob':
      // Bob: tóc tròn ngang cằm, mái thẳng đều, hai bên phồng ôm mặt.
      fringe();
      for (const side of [-1, 1]) {
        pieces.push(ball(0.13, side * 0.23, 0.2, 0.02, [0.62, 1.2, 1.05]));
      }
      pieces.push(ball(0.27, 0, 0.2, -0.1, [1.08, 1.0, 0.62]));
      break;
    case 'twintails':
      // Buộc hai bên: hai đuôi tóc cong xuống, nơ hồng ở chỗ buộc.
      fringe();
      for (const side of [-1, 1]) {
        pieces.push(ball(0.04, side * 0.26, 0.38, -0.05, undefined, tie));
        pieces.push(
          piece(new CapsuleGeometry(0.065, 0.2, 4, 12), color, {
            position: [side * 0.33, 0.24, -0.08],
            rotation: [0.15, 0, side * 0.35],
          }),
        );
        pieces.push(ball(0.06, side * 0.37, 0.08, -0.06, [0.9, 1.2, 0.9]));
      }
      break;
    case 'curly': {
      // Xoăn bồng: vòng lọn tròn quanh đầu, cao hơn mắt và chừa trọn phía mặt (+Z), thêm lọn trên đỉnh.
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        const x = Math.cos(a);
        const z = Math.sin(a);
        if (z > 0.35) continue; // phía mặt
        pieces.push(
          ball(
            0.085,
            x * 0.27,
            0.36 + (i % 2) * 0.03,
            z * 0.25,
            undefined,
            i % 3 === 0 ? dark : color,
          ),
        );
      }
      // Viền mái xoăn nhỏ trên trán (cao hơn lông mày).
      for (const x of [-0.13, -0.045, 0.045, 0.13]) {
        pieces.push(ball(0.06, x, 0.47, 0.17));
      }
      for (const [x, z] of [
        [-0.12, 0.02],
        [0.12, 0.02],
        [0, 0.06],
        [0, -0.12],
        [-0.15, -0.1],
        [0.15, -0.1],
      ] as const) {
        pieces.push(ball(0.09, x, 0.52, z, undefined, Math.abs(x) > 0.1 ? dark : color));
      }
      break;
    }
    case 'spiky': {
      // Dựng: chóp nhọn mọc vuông góc da đầu theo từng hàng, vuốt ngược ra sau; hàng trước hất lên.
      fringe(0.02);
      const spike = (theta: number, phi: number, h: number, lean: number, c = color): void => {
        // Điểm trên đầu (phi tính từ đỉnh), pháp tuyến nghiêng thêm ra sau (lean).
        const nx = Math.sin(phi) * Math.sin(theta);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.cos(theta);
        const dx = nx;
        const dy = ny + 0.35;
        const dz = nz - lean;
        const len = Math.hypot(dx, dy, dz);
        const ux = dx / len;
        const uy = dy / len;
        const uz = dz / len;
        pieces.push(
          piece(new ConeGeometry(0.055, h, 8), c, {
            position: [
              nx * 0.27 + ux * h * 0.35,
              0.25 + ny * 0.27 + uy * h * 0.35,
              nz * 0.27 + uz * h * 0.35,
            ],
            rotation: [Math.atan2(uz, uy), 0, -Math.asin(ux)],
          }),
        );
      };
      // Hàng trước (trên trán), hàng đỉnh, hàng sau.
      for (const t of [-0.6, -0.2, 0.2, 0.6]) spike(t, 0.7, 0.16, -0.1);
      for (const t of [-1.2, -0.4, 0.4, 1.2]) spike(t, 0.35, 0.2, 0.45, dark);
      spike(0, 0.05, 0.2, 0.5);
      // Hàng sau đỉnh đầu (trên phần tóc phồng phía sau, không bị che).
      for (const t of [2.4, Math.PI, -2.4]) spike(t, 0.55, 0.18, 0.55, dark);
      break;
    }
    case 'braid':
      // Tết bím: đốt tóc so le trái phải buông sau lưng, nơ ở đuôi.
      fringe();
      sideLocks(0.08);
      for (let k = 0; k < 6; k += 1) {
        pieces.push(
          ball(
            0.058 - k * 0.004,
            (k % 2 === 0 ? -1 : 1) * 0.018,
            0.22 - k * 0.07,
            -0.28 - k * 0.012,
            [1.1, 0.85, 0.9],
            k % 2 === 0 ? color : dark,
          ),
        );
      }
      pieces.push(ball(0.032, 0, -0.2, -0.36, undefined, tie));
      break;
  }
  return pieces;
}

function torsoLathe(): LatheGeometry {
  const profile = [
    [0.001, 0.3],
    [0.15, 0.31],
    [0.172, 0.37],
    [0.172, 0.48],
    [0.16, 0.56],
    [0.11, 0.62],
    [0.001, 0.635],
  ].map(([r = 0, y = 0]) => new Vector2(r, y));
  return new LatheGeometry(profile, 18);
}

/** Một nhân vật. Vật liệu do nơi tạo truyền vào và quản lý (dùng chung). */
export class AvatarModel {
  readonly root = new Group();
  /** Khớp hông: thân nghiêng quanh điểm này. */
  /** Khung cả người: ngả ra sau khi nằm (quay quanh gót chân). */
  private readonly rig = new Group();
  private readonly body = new Group();
  /** Phần trên cơ thể, dời xuống để toạ độ bên trong tính từ mặt sàn. */
  private readonly upper = new Group();
  private readonly head = new Group();
  private readonly armLeft = new Group();
  private readonly armRight = new Group();
  private readonly legLeft = new Group();
  private readonly legRight = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private poseName: PoseName = 'stand';
  private poseTime = 0;
  private current: PoseState = computePose('stand', 0);

  constructor(appearance: Appearance, material: Material, gear: AvatarGear = {}) {
    const base = OUTFIT_STYLES[appearance.outfit];
    // Màu áo: áo mua ở cửa hàng > màu người chơi chọn > màu mặc định của kiểu.
    const chosen = OUTFIT_COLORS[appearance.outfitColor ?? 0] ?? -1;
    const tint = gear.topTint ?? (chosen >= 0 ? chosen : undefined);
    const outfit = tint !== undefined ? { ...base, top: tint, sleeve: tint } : base;
    const acc = gear.accessory;
    const headAcc = acc && HEAD_ACCESSORIES.has(acc.model) ? acc : null;
    const bodyAcc = acc && !HEAD_ACCESSORIES.has(acc.model) ? acc : null;
    const skin = skinColor(appearance);
    const hair = hairColor(appearance);

    // Thân: áo (lathe), hông quần, cổ, chi tiết trang phục.
    const torso = this.mesh(material, [
      piece(torsoLathe(), outfit.top),
      piece(new CylinderGeometry(0.165, 0.15, 0.1, 18), outfit.pants, {
        position: [0, HIP_Y - 0.01, 0],
      }),
      piece(new CylinderGeometry(0.05, 0.055, 0.08, 10), skin, { position: [0, NECK_Y, 0] }),
      ...outfit.details(outfit.top),
      ...(bodyAcc ? bodyAccessoryPieces(bodyAcc.model, bodyAcc.color) : []),
    ]);
    this.upper.add(torso);

    // Đầu: khớp cổ ở NECK_Y, mọi chi tiết trên mặt gộp chung.
    this.head.position.y = NECK_Y;
    const headCenterY = 0.25;
    this.head.add(
      this.mesh(material, [
        piece(new SphereGeometry(HEAD_RADIUS, 24, 18), skin, {
          position: [0, headCenterY, 0],
          scale: [1.04, 0.96, 1],
        }),
        piece(new SphereGeometry(0.05, 10, 8), skin, { position: [-0.27, headCenterY, 0.01] }),
        piece(new SphereGeometry(0.05, 10, 8), skin, { position: [0.27, headCenterY, 0.01] }),
        piece(new SphereGeometry(0.036, 10, 8), EYE_COLOR, {
          position: [-0.09, headCenterY + 0.01, 0.245],
          scale: [0.85, 1.2, 0.5],
        }),
        piece(new SphereGeometry(0.036, 10, 8), EYE_COLOR, {
          position: [0.09, headCenterY + 0.01, 0.245],
          scale: [0.85, 1.2, 0.5],
        }),
        piece(new SphereGeometry(0.012, 6, 4), 0xffffff, {
          position: [-0.08, headCenterY + 0.03, 0.262],
        }),
        piece(new SphereGeometry(0.012, 6, 4), 0xffffff, {
          position: [0.1, headCenterY + 0.03, 0.262],
        }),
        piece(new SphereGeometry(0.042, 10, 6), BLUSH_COLOR, {
          position: [-0.155, headCenterY - 0.06, 0.215],
          scale: [1, 0.6, 0.35],
        }),
        piece(new SphereGeometry(0.042, 10, 6), BLUSH_COLOR, {
          position: [0.155, headCenterY - 0.06, 0.215],
          scale: [1, 0.6, 0.35],
        }),
        // Miệng cười: nửa vòng xuyến lật ngược.
        piece(new TorusGeometry(0.032, 0.008, 6, 12, Math.PI), EYE_COLOR, {
          position: [0, headCenterY - 0.07, 0.258],
          rotation: [0, 0, Math.PI],
        }),
        ...hairPieces(appearance.hairStyle, hair),
        ...(gear.hat ? hatPieces(gear.hat.model, gear.hat.color) : []),
        ...(headAcc ? headAccessoryPieces(headAcc.model, headAcc.color) : []),
      ]),
    );
    this.upper.add(this.head);

    // Tay: khớp vai, ống tay áo + bàn tay.
    for (const [arm, side] of [
      [this.armLeft, 1],
      [this.armRight, -1],
    ] as const) {
      arm.position.set(0.2 * side, SHOULDER_Y, 0);
      arm.add(
        this.mesh(material, [
          piece(new CapsuleGeometry(0.056, 0.15, 4, 10), outfit.sleeve, {
            position: [0.01 * side, -0.11, 0],
          }),
          piece(new SphereGeometry(0.058, 10, 8), skin, { position: [0.01 * side, -0.255, 0] }),
        ]),
      );
      this.upper.add(arm);
    }

    // Chân: khớp hông, ống quần + giày.
    for (const [leg, side] of [
      [this.legLeft, 1],
      [this.legRight, -1],
    ] as const) {
      leg.position.set(0.085 * side, HIP_Y, 0);
      leg.add(
        this.mesh(material, [
          piece(
            new CylinderGeometry(0.066, 0.06, 0.25, 10),
            outfit.legs === 'skin' ? skin : outfit.pants,
            {
              position: [0, -0.125, 0],
            },
          ),
          piece(new SphereGeometry(0.075, 12, 8), outfit.shoes, {
            position: [0, -0.27, 0.025],
            scale: [0.95, 0.6, 1.35],
          }),
        ]),
      );
      this.rig.add(leg);
    }

    this.upper.position.y = -HIP_Y;
    this.body.add(this.upper);
    this.rig.add(this.body);
    this.root.add(this.rig);
    this.applyPose(this.current);
  }

  get pose(): PoseName {
    return this.poseName;
  }

  private emote: { name: string; time: number } | null = null;

  /** Làm một động tác biểu cảm (vẫy tay, vỗ tay...) khoảng 2,5 giây. */
  playEmote(name: string): void {
    this.emote = { name, time: 0 };
  }

  setPose(pose: PoseName): void {
    if (pose === this.poseName) return;
    this.poseName = pose;
    this.poseTime = 0;
  }

  setShadows(cast: boolean): void {
    this.root.traverse((object) => {
      object.castShadow = cast;
    });
  }

  /** Tiến động tác và trộn mượt sang tư thế đích. */
  update(dt: number): void {
    this.poseTime += dt;
    let target = computePose(this.poseName, this.poseTime);
    if (this.emote) {
      this.emote.time += dt;
      if (this.emote.time >= EMOTE_SECONDS) this.emote = null;
      else target = applyEmote(target, this.emote.name, this.emote.time, isSeated(this.poseName));
    }
    const k = 1 - Math.exp(-12 * dt);
    this.current = blendPose(this.current, target, k);
    this.applyPose(this.current);
  }

  /** Chỉ giải phóng geometry của nhân vật; vật liệu dùng chung do nơi tạo giải phóng. */
  dispose(): void {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
  }

  private mesh(material: Material, pieces: Piece[]): Mesh {
    const geometry = mergePieces(pieces);
    this.geometries.push(geometry);
    return new Mesh(geometry, material);
  }

  private applyPose(pose: PoseState): void {
    // Nằm ngửa: ngả cả người ra sau 90° quanh gót chân, nhấc lên cho lưng và đầu nằm trên đệm.
    this.rig.rotation.x = (-Math.PI / 2) * pose.lie;
    this.rig.rotation.y = 0;
    this.rig.rotation.z = 0;
    this.rig.position.y = LIE_LIFT * pose.lie;
    this.body.position.y = HIP_Y + pose.rootY;
    this.body.rotation.x = pose.bodyPitch;
    // Nâng đầu tựa lên gối khi nằm (trục Z local ngả ra thành Y thế giới), tránh bị chìm/lún khuất đầu.
    this.head.position.set(0, NECK_Y, -0.14 * pose.lie);
    this.head.rotation.set(pose.headPitch, 0, pose.headRoll);
    this.armLeft.rotation.set(pose.armLeftX, 0, pose.armLeftZ);
    this.armRight.rotation.set(pose.armRightX, 0, pose.armRightZ);
    this.legLeft.position.y = HIP_Y + pose.rootY;
    this.legRight.position.y = HIP_Y + pose.rootY;
    this.legLeft.rotation.x = pose.legLeftX;
    this.legRight.rotation.x = pose.legRightX;
  }
}
