// Khóm hoa người chơi đã tưới, ở lại trong phòng cho mọi người thấy (tối đa 30, server giữ).
// Mỗi khóm là một mesh gộp màu đỉnh, dùng chung vật liệu với văn phòng.
import type { PlantView } from '@dilam/shared';
import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergePieces, piece, type Piece } from '../engine/meshBuilder';

/** Khóm hoa cách chậu trong khoảng này thì dời vào chậu; mép trong chậu và mặt đất trong chậu. */
const POT_SNAP = 2.2;
const POT_RIM = 0.17;
const SOIL_Y = 0.42;

const PETALS = [0xff8fb1, 0xffd34d, 0xb48cf2, 0xff9e5e] as const;

function flowerPieces(kind: number): Piece[] {
  const petal = PETALS[kind % PETALS.length] ?? 0xff8fb1;
  const pieces: Piece[] = [];
  const stems = 3;
  for (let i = 0; i < stems; i += 1) {
    const a = (i / stems) * Math.PI * 2 + kind;
    const ox = Math.cos(a) * 0.07;
    const oz = Math.sin(a) * 0.07;
    const h = 0.16 + ((i * 37 + kind * 11) % 7) * 0.012;
    pieces.push(
      piece(new CylinderGeometry(0.006, 0.008, h, 5), 0x5f9e5a, { position: [ox, h / 2, oz] }),
      piece(new ConeGeometry(0.025, 0.05, 5), 0x6fb36a, {
        position: [ox + 0.02, h * 0.45, oz],
        rotation: [0, 0, -1],
      }),
    );
    if (kind === 1) {
      // Hoa cúc: nhuỵ vàng + cánh trắng.
      pieces.push(
        piece(new SphereGeometry(0.035, 8, 6), 0xffffff, {
          position: [ox, h, oz],
          scale: [1, 0.35, 1],
        }),
        piece(new SphereGeometry(0.016, 6, 4), petal, { position: [ox, h + 0.01, oz] }),
      );
    } else {
      pieces.push(
        piece(new SphereGeometry(0.03, 8, 6), petal, { position: [ox, h + 0.01, oz] }),
        piece(new SphereGeometry(0.012, 6, 4), 0xfff2a8, { position: [ox, h + 0.035, oz] }),
      );
    }
  }
  return pieces;
}

export class RoomPlants {
  readonly group = new Group();
  private readonly meshes = new Map<number, { mesh: Mesh; geometry: BufferGeometry }>();

  /** `pots`: tâm các chậu cây trong phòng; khóm hoa mọc trong chậu gần nhất. */
  constructor(
    private readonly material: Material,
    private readonly pots: readonly { x: number; z: number }[] = [],
  ) {}

  set(plants: readonly PlantView[]): void {
    for (const id of [...this.meshes.keys()]) this.remove([id]);
    for (const plant of plants) this.add(plant);
  }

  add(plant: PlantView): void {
    if (this.meshes.has(plant.id)) return;
    const geometry = mergePieces(flowerPieces(plant.kind));
    const mesh = new Mesh(geometry, this.material);
    // Dời vào mép trong chậu gần nhất (trên mặt đất trong chậu, nhô ra dưới tán cây).
    let best: { x: number; z: number } | null = null;
    let bestD = POT_SNAP;
    for (const pot of this.pots) {
      const d = Math.hypot(plant.x - pot.x, plant.z - pot.z);
      if (d < bestD) {
        bestD = d;
        best = pot;
      }
    }
    if (!best) {
      // Không thuộc chậu nào: không hiện (hoa không mọc giữa sàn).
      geometry.dispose();
      return;
    }
    const a = Math.atan2(plant.z - best.z, plant.x - best.x) + plant.id * 0.9;
    mesh.position.set(best.x + Math.cos(a) * POT_RIM, SOIL_Y, best.z + Math.sin(a) * POT_RIM);
    mesh.scale.setScalar(0.8);
    this.group.add(mesh);
    this.meshes.set(plant.id, { mesh, geometry });
  }

  remove(ids: readonly number[]): void {
    for (const id of ids) {
      const entry = this.meshes.get(id);
      if (!entry) continue;
      entry.mesh.removeFromParent();
      entry.geometry.dispose();
      this.meshes.delete(id);
    }
  }

  get count(): number {
    return this.meshes.size;
  }

  dispose(): void {
    this.remove([...this.meshes.keys()]);
    this.group.removeFromParent();
  }
}
