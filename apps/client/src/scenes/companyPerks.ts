// Đồ công ty mua bằng quỹ (cửa hàng công ty): ghế massage và máy chơi game ở phòng nghỉ,
// decor trên mọi bàn làm việc. Dựng bằng hình học Three.js, gộp mesh, màn TV vẽ canvas.
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three';
import {
  deskRotation,
  PERK_SPOTS,
  type Aabb,
  type CompanyPerk,
  type Interactable,
  type OfficeLayout,
} from '@dilam/shared';
import { mergePieces, piece } from '../engine/meshBuilder';

interface TvScreen {
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  t: number;
  frame: number;
}

export class CompanyPerks {
  readonly group = new Group();
  readonly items: Interactable[] = [];
  readonly obstacles: Aabb[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private tv: TvScreen | null = null;

  constructor(layout: OfficeLayout, material: Material, perks: readonly CompanyPerk[]) {
    if (perks.includes('massage')) this.buildMassage(material);
    if (perks.includes('console')) this.buildConsole(material);
    if (perks.includes('deskDecor')) this.buildDeskDecor(layout, material);
  }

  private add(mesh: Mesh | InstancedMesh): void {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.disposables.push(mesh.geometry);
    this.group.add(mesh);
  }

  private buildMassage(material: Material): void {
    const { x, z, facing } = PERK_SPOTS.massage;
    const red = 0x8e2f35;
    const dark = 0x2a2a30;
    const geometry = mergePieces([
      // Đế, nệm ngồi, lưng ghế cao, gối đầu, tay vịn, gác chân, bảng điều khiển.
      piece(new BoxGeometry(0.62, 0.16, 0.62), dark, { position: [0, 0.08, 0] }),
      piece(new BoxGeometry(0.56, 0.16, 0.56), red, { position: [0, 0.26, 0] }),
      piece(new BoxGeometry(0.56, 0.7, 0.16), red, {
        position: [0, 0.62, -0.27],
        rotation: [-0.18, 0, 0],
      }),
      piece(new SphereGeometry(0.13, 12, 8), red, {
        position: [0, 1.0, -0.33],
        scale: [1.6, 0.9, 1],
      }),
      piece(new BoxGeometry(0.1, 0.22, 0.5), dark, { position: [-0.32, 0.36, 0] }),
      piece(new BoxGeometry(0.1, 0.22, 0.5), dark, { position: [0.32, 0.36, 0] }),
      piece(new BoxGeometry(0.42, 0.12, 0.34), red, {
        position: [0, 0.14, 0.42],
        rotation: [0.35, 0, 0],
      }),
      piece(new BoxGeometry(0.08, 0.02, 0.12), 0x7ad1c9, { position: [0.32, 0.48, 0.12] }),
    ]);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = facing;
    this.add(mesh);
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    this.obstacles.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
    this.items.push({
      id: 'perk-massage',
      kind: 'massage',
      approach: { x: x + fx * 0.65, z: z + fz * 0.65 },
      seat: { x, z },
      facing,
      pose: 'sit',
      seatHeight: 0.36,
      pick: { min: [x - 0.35, 0, z - 0.35], max: [x + 0.35, 1.1, z + 0.35] },
    });
  }

  private buildConsole(material: Material): void {
    const { x, z, tvZ, facing } = PERK_SPOTS.console;
    const back = tvZ - z;
    const geometry = mergePieces([
      // Kệ TV thấp, máy chơi game, tay cầm, khung TV, đệm ngồi tròn.
      piece(new BoxGeometry(1.1, 0.3, 0.32), 0x3b3b42, { position: [0, 0.15, back + 0.16] }),
      piece(new BoxGeometry(0.26, 0.06, 0.18), 0xf1f1f1, { position: [0.3, 0.33, back + 0.16] }),
      piece(new BoxGeometry(0.12, 0.03, 0.07), 0x2b2b31, { position: [-0.3, 0.315, back + 0.2] }),
      piece(new BoxGeometry(0.98, 0.58, 0.04), 0x0b0b0d, { position: [0, 0.68, back + 0.06] }),
      piece(new CylinderGeometry(0.26, 0.28, 0.14, 18), 0x6c8ed4, { position: [0, 0.07, 0] }),
    ]);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, 0, z);
    this.add(mesh);

    // Màn TV: canvas nhỏ đổi khung hình như đang chơi game.
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 54;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const screenMaterial = new MeshBasicMaterial({ map: texture });
    const screen = new Mesh(new PlaneGeometry(0.9, 0.5), screenMaterial);
    screen.position.set(x, 0.68, tvZ + 0.085);
    this.group.add(screen);
    this.disposables.push(screen.geometry, screenMaterial, texture);
    this.tv = { canvas, texture, t: 0, frame: 0 };
    this.drawTv();

    this.obstacles.push({ minX: x - 0.55, maxX: x + 0.55, minZ: tvZ - 0.05, maxZ: tvZ + 0.36 });
    this.items.push({
      id: 'perk-console',
      kind: 'console',
      approach: { x, z: z + 0.55 },
      seat: { x, z },
      facing,
      pose: 'sit',
      seatHeight: 0.18,
      pick: { min: [x - 0.55, 0, tvZ - 0.05], max: [x + 0.55, 1.0, z + 0.3] },
    });
  }

  private drawTv(): void {
    const tv = this.tv;
    const ctx = tv?.canvas.getContext('2d');
    if (!tv || !ctx) return;
    const f = tv.frame;
    ctx.fillStyle = '#1c2a4a';
    ctx.fillRect(0, 0, 96, 54);
    ctx.fillStyle = '#5fb27a';
    ctx.fillRect(0, 42, 96, 12);
    // Hai nhân vật khối nhảy qua lại, ngôi sao bay và thanh điểm.
    const hop = Math.abs(Math.sin(f * 0.6)) * 10;
    ctx.fillStyle = '#ff8a65';
    ctx.fillRect(18 + (f % 20), 30 - hop, 10, 12);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(66 - (f % 16), 32, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10 + ((f * 7) % 80), 8, 3, 3);
    ctx.fillRect(4, 4, 16 + (f % 10), 3);
    tv.texture.needsUpdate = true;
  }

  private buildDeskDecor(layout: OfficeLayout, material: Material): void {
    const { width: w, depth: d, height: h } = layout.desk;
    const geometry = mergePieces([
      // Chậu sen đá (góc sau bên phải).
      piece(new CylinderGeometry(0.045, 0.035, 0.06, 10), 0xc98b6b, {
        position: [w / 2 - 0.12, h + 0.03, -d / 2 + 0.12],
      }),
      piece(new SphereGeometry(0.045, 8, 6), 0x5fb27a, {
        position: [w / 2 - 0.12, h + 0.075, -d / 2 + 0.12],
        scale: [1, 0.7, 1],
      }),
      // Đèn bàn nhỏ (góc sau bên trái).
      piece(new CylinderGeometry(0.04, 0.045, 0.015, 10), 0x2b2b31, {
        position: [-w / 2 + 0.12, h + 0.008, -d / 2 + 0.12],
      }),
      piece(new CylinderGeometry(0.008, 0.008, 0.16, 6), 0x2b2b31, {
        position: [-w / 2 + 0.12, h + 0.09, -d / 2 + 0.12],
      }),
      piece(new CylinderGeometry(0.02, 0.055, 0.06, 10), 0xf3c35d, {
        position: [-w / 2 + 0.12, h + 0.18, -d / 2 + 0.12],
      }),
      // Thú bông nhỏ cạnh bàn phím.
      piece(new SphereGeometry(0.035, 8, 6), 0xf2a0b6, {
        position: [-w / 2 + 0.3, h + 0.035, d / 2 - 0.15],
      }),
      piece(new SphereGeometry(0.026, 8, 6), 0xf2a0b6, {
        position: [-w / 2 + 0.3, h + 0.085, d / 2 - 0.15],
      }),
    ]);
    const mesh = new InstancedMesh(geometry, material, layout.desks.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    layout.desks.forEach((desk, i) => {
      q.setFromAxisAngle(up, deskRotation(desk));
      mesh.setMatrixAt(i, m.compose(new Vector3(desk.x, 0, desk.z), q, one));
    });
    this.add(mesh);
  }

  update(dt: number): void {
    const tv = this.tv;
    if (!tv) return;
    tv.t += dt;
    if (tv.t < 0.2) return;
    tv.t = 0;
    tv.frame += 1;
    this.drawTv();
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.tv = null;
  }
}
