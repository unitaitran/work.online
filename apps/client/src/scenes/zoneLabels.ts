// Tên các khu nổi trên không (PHÒNG SẾP, PHÒNG HỌP 1...): sprite chữ vẽ bằng canvas, luôn
// quay về phía camera. Dọn sạch họa tiết, vật liệu khi bỏ.
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

export class ZoneLabels {
  readonly group = new Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(layout: OfficeLayout) {
    const z = STRINGS.zones;
    const mid = (a: number, b: number): number => (a + b) / 2;
    const at = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => ({
      x: mid(b.minX, b.maxX),
      z: mid(b.minZ, b.maxZ),
    });
    const spots: [string, { x: number; z: number }, number][] = [
      [z.ceo, at(layout.ceoRoom.bounds), 3.35],
      [z.meeting, at(layout.meeting.bounds), 3.35],
      [z.lounge, at(layout.lounge.bounds), 3.35],
      [z.pantry, at(layout.pantry.floor), 2.9],
      [z.entrance, { x: layout.entrance.doorX, z: layout.bounds.maxZ - 0.9 }, 2.95],
    ];
    for (const [text, p, y] of spots) {
      const texture = labelTexture(text);
      const material = new SpriteMaterial({ map: texture, depthWrite: false, transparent: true });
      const sprite = new Sprite(material);
      sprite.scale.set(2.2, 0.55, 1);
      sprite.position.set(p.x, y, p.z);
      sprite.renderOrder = 5;
      this.group.add(sprite);
      this.disposables.push(texture, material);
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
