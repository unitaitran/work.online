// Nhân vật chibi dựng hoàn toàn bằng code. Mỗi bộ phận chuyển động (đầu, thân, 2 tay, 2 chân)
// là MỘT mesh gộp với màu đỉnh, dùng chung một vật liệu: 6 draw call cho cả nhân vật.
// Chuyển động bằng cách xoay/dịch các Group khớp (vai, hông, cổ), không dùng xương.
import {
  BoxGeometry,
  CapsuleGeometry,
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
import { hairColor, skinColor, type Appearance, type HairStyle, type Outfit } from './appearance';
import {
  bodyAccessoryPieces,
  hatPieces,
  HEAD_ACCESSORIES,
  headAccessoryPieces,
} from './equipmentPieces';
import { blendPose, computePose, type PoseName, type PoseState } from './pose';

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

interface OutfitStyle {
  top: number;
  sleeve: number;
  pants: number;
  shoes: number;
  details(): Piece[];
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
  // Mái tóc chung: chỏm cầu nghiêng ra sau (trán cao, gáy thấp) + mái bằng trước trán.
  const cap = piece(
    new SphereGeometry(HEAD_RADIUS + 0.018, 22, 12, 0, Math.PI * 2, 0, 1.45),
    color,
    { position: [0, 0.27, 0], rotation: [-0.42, 0, 0] },
  );
  const fringe = piece(new SphereGeometry(0.13, 14, 8), color, {
    position: [0, 0.43, 0.15],
    scale: [1.75, 0.6, 0.75],
    rotation: [0.35, 0, 0],
  });
  const pieces = [cap, fringe];

  switch (style) {
    case 'short':
      pieces.push(
        piece(new SphereGeometry(0.07, 10, 8), color, { position: [-0.24, 0.27, 0.05] }),
        piece(new SphereGeometry(0.07, 10, 8), color, { position: [0.24, 0.27, 0.05] }),
      );
      break;
    case 'bun':
      pieces.push(
        piece(new SphereGeometry(0.115, 14, 10), color, { position: [0, 0.56, -0.1] }),
        piece(new TorusGeometry(0.075, 0.018, 6, 14), 0xf28a8a, {
          position: [0, 0.48, -0.08],
          rotation: [Math.PI / 2 - 0.4, 0, 0],
        }),
      );
      break;
    case 'long':
      pieces.push(
        piece(new SphereGeometry(0.28, 16, 12), color, {
          position: [0, 0.13, -0.11],
          scale: [1.0, 1.12, 0.62],
        }),
      );
      break;
    case 'ponytail':
      pieces.push(
        piece(new SphereGeometry(0.04, 8, 6), 0xf28a8a, { position: [0, 0.33, -0.27] }),
        piece(new SphereGeometry(0.11, 12, 10), color, {
          position: [0, 0.16, -0.33],
          scale: [0.6, 1.55, 0.6],
          rotation: [0.25, 0, 0],
        }),
      );
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
    const outfit =
      gear.topTint !== undefined ? { ...base, top: gear.topTint, sleeve: gear.topTint } : base;
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
      ...outfit.details(),
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
          piece(new CylinderGeometry(0.066, 0.06, 0.25, 10), outfit.pants, {
            position: [0, -0.125, 0],
          }),
          piece(new SphereGeometry(0.075, 12, 8), outfit.shoes, {
            position: [0, -0.27, 0.025],
            scale: [0.95, 0.6, 1.35],
          }),
        ]),
      );
      this.root.add(leg);
    }

    this.upper.position.y = -HIP_Y;
    this.body.add(this.upper);
    this.root.add(this.body);
    this.applyPose(this.current);
  }

  get pose(): PoseName {
    return this.poseName;
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
    const target = computePose(this.poseName, this.poseTime);
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
    this.body.position.y = HIP_Y + pose.rootY;
    this.body.rotation.x = pose.bodyPitch;
    this.head.rotation.set(pose.headPitch, 0, pose.headRoll);
    this.armLeft.rotation.set(pose.armLeftX, 0, pose.armLeftZ);
    this.armRight.rotation.set(pose.armRightX, 0, pose.armRightZ);
    this.legLeft.position.y = HIP_Y + pose.rootY;
    this.legRight.position.y = HIP_Y + pose.rootY;
    this.legLeft.rotation.x = pose.legLeftX;
    this.legRight.rotation.x = pose.legRightX;
  }
}
