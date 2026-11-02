// Thú cưng, đồ bàn và trang trí ghế dựng hoàn toàn bằng code. Mỗi thứ là MỘT mesh gộp màu đỉnh
// (dùng chung vật liệu), nên 40 người cùng dắt thú cưng vẫn nhẹ.
// Thú cưng đi theo chủ; đồ bàn và trang trí ghế chỉ hiện khi chủ đang ngồi ở bàn làm việc.
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { equipmentFromIds, shopItem } from '@dilam/shared';
import { mergePieces, piece, type Piece } from '../engine/meshBuilder';
import { dampAngle } from '../engine/mathUtils';

function petPieces(model: string, color: number): Piece[] {
  switch (model) {
    case 'cat':
    case 'dog': {
      const dog = model === 'dog';
      const ear = dog
        ? (side: number) =>
            piece(new SphereGeometry(0.045, 8, 6), color - 0x202020, {
              position: [0.07 * side, 0.36, 0.1],
              scale: [0.6, 1.3, 0.5],
            })
        : (side: number) =>
            piece(new ConeGeometry(0.04, 0.08, 4), color, { position: [0.065 * side, 0.4, 0.1] });
      return [
        piece(new SphereGeometry(0.13, 12, 10), color, {
          position: [0, 0.15, 0],
          scale: [1, 0.85, 1.35],
        }),
        piece(new SphereGeometry(0.1, 12, 10), color, { position: [0, 0.3, 0.12] }),
        ear(-1),
        ear(1),
        piece(new SphereGeometry(0.015, 6, 4), 0x2d2433, { position: [-0.04, 0.32, 0.21] }),
        piece(new SphereGeometry(0.015, 6, 4), 0x2d2433, { position: [0.04, 0.32, 0.21] }),
        piece(new SphereGeometry(0.018, 6, 4), dog ? 0x2d2433 : 0xf4a7a6, {
          position: [0, 0.29, 0.22],
        }),
        piece(new CylinderGeometry(0.018, 0.012, 0.18, 6), color, {
          position: [0, 0.22, -0.2],
          rotation: [dog ? -0.6 : -1.1, 0, 0],
        }),
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) =>
            piece(new CylinderGeometry(0.025, 0.025, 0.09, 6), color, {
              position: [0.06 * sx, 0.045, 0.09 * sz],
            }),
          ),
        ),
      ];
    }
    case 'cactuspet':
      return [
        piece(new CylinderGeometry(0.09, 0.07, 0.1, 12), 0xc9744a, { position: [0, 0.05, 0] }),
        piece(new CylinderGeometry(0.06, 0.07, 0.24, 10), color, { position: [0, 0.22, 0] }),
        piece(new SphereGeometry(0.06, 10, 8), color, { position: [0, 0.34, 0] }),
        piece(new CylinderGeometry(0.03, 0.03, 0.1, 8), color, {
          position: [0.08, 0.24, 0],
          rotation: [0, 0, -0.9],
        }),
        piece(new SphereGeometry(0.015, 6, 4), 0x2d2433, { position: [-0.025, 0.32, 0.058] }),
        piece(new SphereGeometry(0.015, 6, 4), 0x2d2433, { position: [0.025, 0.32, 0.058] }),
        piece(new SphereGeometry(0.02, 6, 4), 0xff7eb6, { position: [0, 0.4, 0] }),
      ];
    case 'fishtank':
      return [
        piece(new BoxGeometry(0.34, 0.04, 0.22), 0x6b5a4a, { position: [0, 0.02, 0] }),
        piece(new BoxGeometry(0.32, 0.22, 0.2), color, { position: [0, 0.15, 0] }),
        piece(new SphereGeometry(0.03, 8, 6), 0xff8a3d, {
          position: [-0.05, 0.16, 0.02],
          scale: [1.5, 1, 0.6],
        }),
        piece(new SphereGeometry(0.025, 8, 6), 0xffd34d, {
          position: [0.07, 0.11, -0.03],
          scale: [1.5, 1, 0.6],
        }),
        piece(new ConeGeometry(0.02, 0.1, 5), 0x5f9e5a, { position: [0.11, 0.09, 0.05] }),
      ];
    case 'robot':
      return [
        piece(new CylinderGeometry(0.17, 0.17, 0.07, 18), color, { position: [0, 0.05, 0] }),
        piece(new CylinderGeometry(0.06, 0.06, 0.02, 12), 0x4a4f5c, { position: [0, 0.095, 0.03] }),
        piece(new SphereGeometry(0.015, 6, 4), 0x5ad87a, { position: [0, 0.1, 0.15] }),
        piece(new TorusGeometry(0.17, 0.012, 6, 20), 0x4a4f5c, {
          position: [0, 0.03, 0],
          rotation: [Math.PI / 2, 0, 0],
        }),
      ];
    default:
      return [];
  }
}

/** Đồ đặt trên bàn (gốc toạ độ: mặt bàn). */
function deskItemPieces(model: string, color: number): Piece[] {
  switch (model) {
    case 'cactus':
      return [
        piece(new CylinderGeometry(0.035, 0.03, 0.05, 10), 0xc9744a, { position: [0, 0.025, 0] }),
        piece(new CylinderGeometry(0.022, 0.025, 0.08, 8), color, { position: [0, 0.09, 0] }),
      ];
    case 'mug':
      return [
        piece(new CylinderGeometry(0.035, 0.03, 0.08, 12), color, { position: [0, 0.04, 0] }),
        piece(new TorusGeometry(0.022, 0.007, 6, 10), color, { position: [0.04, 0.045, 0] }),
      ];
    case 'lamp':
      return [
        piece(new CylinderGeometry(0.05, 0.05, 0.015, 12), 0x4a4f5c, { position: [0, 0.008, 0] }),
        piece(new CylinderGeometry(0.008, 0.008, 0.2, 6), 0x4a4f5c, { position: [0, 0.1, 0] }),
        piece(new ConeGeometry(0.06, 0.07, 12, 1, true), color, { position: [0, 0.2, 0.02] }),
      ];
    case 'nameplate':
      return [
        piece(new BoxGeometry(0.16, 0.05, 0.03), color, {
          position: [0, 0.025, 0],
          rotation: [-0.3, 0, 0],
        }),
      ];
    case 'frame':
      return [
        piece(new BoxGeometry(0.1, 0.12, 0.012), color, {
          position: [0, 0.06, 0],
          rotation: [-0.2, 0, 0],
        }),
        piece(new BoxGeometry(0.075, 0.09, 0.004), 0x8fc7ff, {
          position: [0, 0.06, 0.008],
          rotation: [-0.2, 0, 0],
        }),
      ];
    case 'bonsai':
      return [
        piece(new BoxGeometry(0.12, 0.04, 0.07), 0x5a4a3a, { position: [0, 0.02, 0] }),
        piece(new CylinderGeometry(0.008, 0.012, 0.08, 6), 0x7a5a3a, { position: [0, 0.08, 0] }),
        piece(new SphereGeometry(0.06, 10, 8), color, {
          position: [0.02, 0.14, 0],
          scale: [1.4, 0.7, 1],
        }),
      ];
    case 'globe':
      return [
        piece(new CylinderGeometry(0.03, 0.04, 0.02, 10), 0x6b5a4a, { position: [0, 0.01, 0] }),
        piece(new SphereGeometry(0.06, 14, 10), color, { position: [0, 0.09, 0] }),
      ];
    case 'trophy':
      return [
        piece(new BoxGeometry(0.06, 0.03, 0.06), 0x5a3a2a, { position: [0, 0.015, 0] }),
        piece(new CylinderGeometry(0.01, 0.01, 0.05, 6), color, { position: [0, 0.055, 0] }),
        piece(new CylinderGeometry(0.045, 0.02, 0.07, 12), color, { position: [0, 0.11, 0] }),
      ];
    case 'duck':
      return [
        piece(new SphereGeometry(0.035, 10, 8), color, {
          position: [0, 0.03, 0],
          scale: [1.2, 0.9, 1],
        }),
        piece(new SphereGeometry(0.025, 10, 8), color, { position: [0.025, 0.07, 0] }),
        piece(new ConeGeometry(0.01, 0.025, 5), 0xff8a3d, {
          position: [0.052, 0.068, 0],
          rotation: [0, 0, -Math.PI / 2],
        }),
      ];
    default:
      return [];
  }
}

/** Trang trí ghế (gốc toạ độ: chỗ ngồi, nhìn về +Z). */
function chairPieces(model: string, color: number): Piece[] {
  switch (model) {
    case 'cushion':
      return [piece(new BoxGeometry(0.3, 0.06, 0.28), color, { position: [0, 0.3, -0.02] })];
    case 'gaming':
      return [
        piece(new BoxGeometry(0.34, 0.55, 0.06), color, { position: [0, 0.62, -0.2] }),
        piece(new BoxGeometry(0.2, 0.08, 0.06), 0xd9534f, { position: [0, 0.82, -0.17] }),
      ];
    case 'bean':
      return [
        piece(new SphereGeometry(0.28, 14, 10), color, {
          position: [0, 0.18, -0.06],
          scale: [1.1, 0.7, 1.1],
        }),
      ];
    case 'throne':
      return [
        piece(new BoxGeometry(0.4, 0.7, 0.08), color, { position: [0, 0.68, -0.22] }),
        piece(new BoxGeometry(0.06, 0.18, 0.3), color, { position: [-0.2, 0.38, -0.05] }),
        piece(new BoxGeometry(0.06, 0.18, 0.3), color, { position: [0.2, 0.38, -0.05] }),
      ];
    default:
      return [];
  }
}

export interface OwnerState {
  x: number;
  z: number;
  facing: number;
  pose: string;
}

/** Thú cưng + đồ bàn + trang trí ghế của một người chơi. */
export class Companions {
  readonly group = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private pet: {
    mesh: Mesh;
    model: string;
    x: number;
    z: number;
    facing: number;
    t: number;
  } | null = null;
  private readonly deskGroup = new Group();
  private readonly chairGroup = new Group();

  constructor(equipped: readonly string[] | undefined, material: Material) {
    const e = equipmentFromIds(equipped ?? []);
    const pet = e.pet ? shopItem(e.pet) : null;
    if (pet) {
      const mesh = this.mesh(petPieces(pet.model, pet.color), material);
      this.group.add(mesh);
      this.pet = { mesh, model: pet.model, x: Number.NaN, z: 0, facing: 0, t: 0 };
    }
    e.desk.forEach((id, i) => {
      const item = shopItem(id);
      if (!item) return;
      const mesh = this.mesh(deskItemPieces(item.model, item.color), material);
      mesh.position.set((i - 1) * 0.4, 0, 0);
      this.deskGroup.add(mesh);
    });
    const chair = e.chair ? shopItem(e.chair) : null;
    if (chair) this.chairGroup.add(this.mesh(chairPieces(chair.model, chair.color), material));
    this.deskGroup.visible = false;
    this.chairGroup.visible = false;
    this.group.add(this.deskGroup, this.chairGroup);
  }

  get isEmpty(): boolean {
    return (
      !this.pet && this.deskGroup.children.length === 0 && this.chairGroup.children.length === 0
    );
  }

  update(dt: number, owner: OwnerState): void {
    const seatedAtDesk = owner.pose === 'type';
    const fx = Math.sin(owner.facing);
    const fz = Math.cos(owner.facing);
    // Mặt bàn ở phía trước người ngồi ~0,55 m, cao 0,43 m (theo bố cục văn phòng).
    this.deskGroup.visible = seatedAtDesk;
    if (seatedAtDesk) {
      this.deskGroup.position.set(owner.x + fx * 0.55, 0.43, owner.z + fz * 0.55);
      this.deskGroup.rotation.y = owner.facing;
    }
    this.chairGroup.visible = owner.pose === 'type' || owner.pose === 'sit';
    if (this.chairGroup.visible) {
      this.chairGroup.position.set(owner.x, 0, owner.z);
      this.chairGroup.rotation.y = owner.facing;
    }

    const pet = this.pet;
    if (!pet) return;
    pet.t += dt;
    // Chỗ đứng mong muốn: sau lưng bên phải chủ; robot hút bụi chạy vòng quanh.
    let tx = owner.x - fx * 0.55 + fz * 0.4;
    let tz = owner.z - fz * 0.55 - fx * 0.4;
    if (pet.model === 'robot') {
      tx = owner.x + Math.cos(pet.t * 0.8) * 0.8;
      tz = owner.z + Math.sin(pet.t * 0.8) * 0.8;
    }
    if (Number.isNaN(pet.x)) {
      pet.x = tx;
      pet.z = tz;
    }
    const dx = tx - pet.x;
    const dz = tz - pet.z;
    const dist = Math.hypot(dx, dz);
    const k = 1 - Math.exp(-3 * dt);
    pet.x += dx * k;
    pet.z += dz * k;
    if (pet.model === 'cactuspet') {
      // Xương rồng "nhìn" chủ.
      pet.facing = dampAngle(pet.facing, Math.atan2(owner.x - pet.x, owner.z - pet.z), 6, dt);
    } else if (dist > 0.05) {
      pet.facing = dampAngle(pet.facing, Math.atan2(dx, dz), 8, dt);
    }
    const hop = dist > 0.1 && pet.model !== 'fishtank' ? Math.abs(Math.sin(pet.t * 12)) * 0.03 : 0;
    pet.mesh.position.set(pet.x, hop, pet.z);
    pet.mesh.rotation.y = pet.facing;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geometries) g.dispose();
    this.geometries.length = 0;
  }

  private mesh(pieces: Piece[], material: Material): Mesh {
    const geometry = mergePieces(pieces.length > 0 ? pieces : [piece(new BoxGeometry(0, 0, 0), 0)]);
    this.geometries.push(geometry);
    return new Mesh(geometry, material);
  }
}
