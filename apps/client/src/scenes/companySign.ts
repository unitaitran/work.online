// Logo công ty kiểu chữ neon trắng trên tường xám (tường tây ở sảnh lối vào, phía trên tượng
// gấu), dòng khẩu hiệu chữ đen bên dưới. Vẽ bằng canvas, không dùng file ảnh hay logo thật.
// Văn phòng chung hiện tên Mây Hồng; phòng công ty hiện tên công ty người chơi đặt.
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { OfficeLayout } from '@dilam/shared';

export interface SignInfo {
  name: string;
  /** Màu công ty (vạch nhỏ dưới khẩu hiệu). */
  color: number;
  glyph: string;
  subtitle: string;
}

const W = 1024;
const H = 512;

/** Tách tên thành tối đa hai dòng cân nhau (giống logo hai tầng chữ). */
export function splitName(name: string): string[] {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    if (Math.abs(a - b) < bestDiff) {
      bestDiff = Math.abs(a - b);
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function drawNeon(ctx: CanvasRenderingContext2D, info: SignInfo): void {
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  ctx.clearRect(0, 0, W, H);
  const lines = splitName(info.name);
  const size = lines.length > 1 ? 150 : 170;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const y = lines.length > 1 ? 120 + i * 170 : 200;
    ctx.font = `900 ${String(size)}px ${font}`;
    // Quầng sáng, ống neon (viền), lõi trắng.
    ctx.shadowColor = 'rgba(220,235,255,0.95)';
    ctx.shadowBlur = 38;
    ctx.strokeStyle = 'rgba(235,244,255,0.9)';
    ctx.lineWidth = 16;
    ctx.strokeText(line, W / 2, y, W - 60);
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.strokeText(line, W / 2, y, W - 60);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(120,130,150,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeText(line, W / 2, y, W - 60);
  });
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#141416';
  ctx.font = `800 54px ${font}`;
  ctx.fillText(info.subtitle.toUpperCase(), W / 2, H - 52, W - 80);
  ctx.fillStyle = `#${info.color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(W / 2 - 60, H - 14, 120, 8);
}

export class CompanySign {
  readonly group = new Group();
  private readonly texture: CanvasTexture;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(layout: OfficeLayout, info: SignInfo) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (ctx) drawNeon(ctx, info);
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const face = new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false });
    const plane = new PlaneGeometry(2.8, 1.4);
    const board = new Mesh(plane, face);
    this.disposables.push(face, plane, this.texture);
    // Tường tây, sảnh lối vào: phía trên tượng gấu, quay mặt vào phòng (+X).
    const { bear } = layout.decor;
    board.position.set(layout.bounds.minX + 0.03, 2.25, (bear.minZ + bear.maxZ) / 2 + 0.3);
    board.rotation.y = Math.PI / 2;
    board.renderOrder = 2;
    this.group.add(board);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
