// Biển hiệu công ty treo trên tường trước (phòng riêng của công ty): chữ vẽ bằng canvas,
// màu và biểu tượng chọn từ bộ có sẵn (không tải ảnh lên).
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { OfficeLayout } from '@dilam/shared';

export interface SignInfo {
  name: string;
  color: number;
  glyph: string;
  subtitle: string;
}

export class CompanySign {
  readonly group = new Group();
  private readonly texture: CanvasTexture;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(layout: OfficeLayout, info: SignInfo) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const color = `#${info.color.toString(16).padStart(6, '0')}`;
    if (ctx) {
      const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
      ctx.fillStyle = '#fffaf3';
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1024, 18);
      ctx.fillRect(0, 238, 1024, 18);
      ctx.beginPath();
      ctx.arc(128, 128, 78, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 92px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.glyph, 128, 132);
      ctx.fillStyle = '#3b3241';
      ctx.textAlign = 'left';
      ctx.font = `800 76px ${font}`;
      ctx.fillText(info.name, 240, 108, 740);
      ctx.fillStyle = '#7a6e80';
      ctx.font = `600 40px ${font}`;
      ctx.fillText(info.subtitle, 240, 182, 740);
    }
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const face = new MeshBasicMaterial({ map: this.texture });
    const plane = new PlaneGeometry(3.2, 0.8);
    const board = new Mesh(plane, face);
    const frameGeo = new BoxGeometry(3.3, 0.9, 0.06);
    const frameMat = new MeshLambertMaterial({ color: info.color });
    const frame = new Mesh(frameGeo, frameMat);
    this.disposables.push(face, plane, frameGeo, frameMat, this.texture);
    // Tường trước (phía +Z), phía trên cửa ra vào, quay mặt vào trong phòng.
    const z = layout.bounds.maxZ - 0.05;
    const x = layout.entrance.doorX + 2.6;
    frame.position.set(x, layout.wallHeight - 0.65, z);
    board.position.set(x, layout.wallHeight - 0.65, z - 0.035);
    board.rotation.y = Math.PI;
    this.group.add(frame, board);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
