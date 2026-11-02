// Họa tiết vẽ bằng canvas: không dùng file ảnh.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  return [canvas, context];
}

/** Sàn gạch kem 2×2 viên, có ron và chút lốm đốm cho đỡ phẳng. Một lần lặp = 2 m. */
export function createFloorTileTexture(): CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size);
  const half = size / 2;
  const colors = ['#f3e2c9', '#ead3b4'];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      ctx.fillStyle = colors[(row + col) % 2] ?? '#f3e2c9';
      ctx.fillRect(col * half, row * half, half, half);
    }
  }
  // Lốm đốm cố định (không ngẫu nhiên) để lần nào vẽ cũng giống nhau.
  ctx.fillStyle = 'rgba(160, 120, 80, 0.06)';
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 73) % size;
    const y = (i * 151) % size;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Ron gạch.
  ctx.strokeStyle = '#d6bd9b';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half, size);
  ctx.moveTo(0, half);
  ctx.lineTo(size, half);
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Chấm tròn mờ dần ra mép: dùng cho bóng giả dưới chân và hạt bụi. */
export function createSoftDotTexture(): CanvasTexture {
  const size = 64;
  const [canvas, ctx] = createCanvas(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
