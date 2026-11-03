// Tên các khu (PHÒNG SẾP, PHÒNG HỌP 1...): sprite chữ vẽ bằng canvas, luôn quay về phía camera.
// Đang đứng trong khu nào thì hiện tên khu đó treo dưới trần; nhìn từ trên thì hiện tất cả. Dọn sạch họa tiết, vật liệu khi bỏ.
import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import type { OfficeLayout } from '@dilam/shared';
import { STRINGS } from '../strings';

function labelTexture(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 56px system-ui, sans-serif';
    const w = Math.min(500, ctx.measureText(text).width + 70);
    const x = (512 - w) / 2;
    ctx.fillStyle = 'rgba(14,14,16,0.82)';
    ctx.beginPath();
    ctx.roundRect(x, 18, w, 92, 46);
    ctx.fill();
    ctx.strokeStyle = '#9a9aa3';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

interface Zone {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  sprite: Sprite;
}

/** Độ cao treo tên khu: dưới trần, trong tầm nhìn khi đứng trong khu. */
const INSIDE_Y = 2.55;
const TOP_Y = 3.35;

export class ZoneLabels {
  readonly group = new Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly zones: Zone[] = [];

  constructor(layout: OfficeLayout) {
    const z = STRINGS.zones;
    const { bounds, entrance, pantry } = layout;
    // Thứ tự ưu tiên khi các vùng chồng nhau: phòng trước, rồi pantry, lối vào, khu làm việc.
    const list: [string, Zone['bounds']][] = [
      [z.ceo, layout.ceoRoom.bounds],
      [z.meeting, layout.meeting.bounds],
      [z.lounge, layout.lounge.bounds],
      [z.pantry, pantry.floor],
      [
        z.entrance,
        {
          minX: bounds.minX,
          maxX: entrance.doorX + 1.2,
          minZ: layout.ceoRoom.bounds.minZ,
          maxZ: bounds.maxZ,
        },
      ],
      [
        z.work,
        {
          minX: bounds.minX,
          maxX: pantry.floor.minX,
          minZ: bounds.minZ,
          maxZ: layout.ceoRoom.bounds.minZ,
        },
      ],
    ];
    for (const [text, b] of list) {
      const texture = labelTexture(text);
      const material = new SpriteMaterial({ map: texture, depthWrite: false, transparent: true });
      const sprite = new Sprite(material);
      sprite.renderOrder = 5;
      sprite.visible = false;
      this.group.add(sprite);
      this.disposables.push(texture, material);
      this.zones.push({ bounds: b, sprite });
    }
  }

  /** Hiện tên khu người chơi đang đứng (hoặc tất cả khi nhìn từ trên). */
  update(x: number, z: number, enabled: boolean, top: boolean): void {
    const inside = (b: Zone['bounds']): boolean =>
      x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
    const current = this.zones.find((zone) => inside(zone.bounds)) ?? null;
    for (const zone of this.zones) {
      const b = zone.bounds;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const show = enabled && (top || zone === current);
      zone.sprite.visible = show;
      if (!show) continue;
      if (top) {
        zone.sprite.position.set(cx, TOP_Y, cz);
        zone.sprite.scale.set(2.2, 0.55, 1);
      } else {
        // Trong khu: treo phía trước nhân vật một chút, giữa khu theo chiều còn lại.
        zone.sprite.position.set(
          Math.min(Math.max(x, b.minX + 0.8), b.maxX - 0.8),
          INSIDE_Y,
          Math.min(Math.max(cz, b.minZ + 0.6), b.maxZ - 0.6),
        );
        zone.sprite.scale.set(1.2, 0.3, 1);
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
