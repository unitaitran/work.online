// Họa tiết vẽ bằng canvas cho văn phòng: màn hình máy tính và cảnh thành phố ngoài cửa kính.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { seededRng } from '../../npc/schedule';
import type { DayPeriod } from './period';

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return [canvas, ctx];
}

function finish(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Trình soạn mã nền tối: các dòng "code" màu, lặp theo chiều dọc để cuộn được. */
function drawCode(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#23263a';
  ctx.fillRect(0, 0, w, h);
  const rng = seededRng(11);
  const colors = ['#ff9e8a', '#ffd479', '#9fe0a8', '#8fc7ff', '#d6b4ff', '#c9cfdc'];
  const lineHeight = 9;
  for (let y = 6, line = 0; y < h - 4; y += lineHeight, line += 1) {
    ctx.fillStyle = '#5b6079';
    ctx.fillRect(4, y, 8, 4);
    let x = 18 + Math.floor(rng() * 4) * 8;
    const tokens = 1 + Math.floor(rng() * 5);
    for (let t = 0; t < tokens && x < w - 10; t += 1) {
      const len = 8 + Math.floor(rng() * 30);
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? '#c9cfdc';
      ctx.fillRect(x, y, Math.min(len, w - 8 - x), 4);
      x += len + 6;
    }
  }
}

/** Bảng tính: lưới ô, hàng tiêu đề, vài ô tô màu. */
function drawSheet(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2f9e6b';
  ctx.fillRect(0, 0, w, 14);
  const rng = seededRng(23);
  const cellW = 32;
  const cellH = 11;
  for (let row = 0; row * cellH + 18 < h; row += 1) {
    for (let col = 0; col * cellW < w; col += 1) {
      const x = col * cellW;
      const y = 18 + row * cellH;
      if (row === 0) ctx.fillStyle = '#dff3e8';
      else if (rng() < 0.08) ctx.fillStyle = '#ffe9a8';
      else ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, cellW, cellH);
      if (rng() < 0.7) {
        ctx.fillStyle = '#7b8494';
        ctx.fillRect(x + 4, y + 4, 6 + Math.floor(rng() * 18), 3);
      }
    }
  }
  ctx.strokeStyle = '#d6dbe3';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += cellW) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 18);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 18; y <= h; y += cellH) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
}

/** Bảng điều khiển: biểu đồ cột và đường "KPI". */
function drawChart(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f6f2ff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#7a5cc4';
  ctx.fillRect(0, 0, w, 14);
  const rng = seededRng(37);
  const bars = 9;
  const base = h - 12;
  for (let i = 0; i < bars; i += 1) {
    const bh = 20 + rng() * (h - 60);
    ctx.fillStyle = i % 3 === 0 ? '#ff8a65' : '#9b86e0';
    ctx.fillRect(14 + i * ((w - 28) / bars), base - bh, (w - 28) / bars - 6, bh);
  }
  ctx.strokeStyle = '#2f9e6b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 10; i += 1) {
    const x = 10 + (i * (w - 20)) / 10;
    const y = 40 + Math.sin(i * 0.9) * 14 + (10 - i) * 4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** 3 loại màn hình: 0 mã nguồn (cuộn được), 1 bảng tính, 2 biểu đồ. */
export function createScreenTextures(): CanvasTexture[] {
  const w = 256;
  const h = 160;
  return [drawCode, drawSheet, drawChart].map((draw, i) => {
    const [canvas, ctx] = canvas2d(w, h);
    draw(ctx, w, h);
    const texture = finish(canvas);
    if (i === 0) {
      texture.wrapT = RepeatWrapping;
    }
    return texture;
  });
}

const SKY: Readonly<Record<DayPeriod, readonly [string, string]>> = {
  morning: ['#9fd3ff', '#fff1d6'],
  afternoon: ['#ffb38a', '#ffe0a8'],
  night: ['#141a3a', '#3d3266'],
};

const BUILDING: Readonly<Record<DayPeriod, readonly [string, string]>> = {
  morning: ['#a9bccf', '#c9d6e3'],
  afternoon: ['#b48f8a', '#d3aa95'],
  night: ['#232842', '#2e3354'],
};

/** Vẽ đường chân trời thành phố (tòa nhà sinh theo hạt giống cố định nên lần nào cũng giống). */
export function drawCityscape(canvas: HTMLCanvasElement, period: DayPeriod): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;

  const [top, bottom] = SKY[period];
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (period === 'night') {
    const stars = seededRng(5);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 70; i += 1) ctx.fillRect(stars() * w, stars() * h * 0.5, 2, 2);
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.2, 16, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = period === 'morning' ? '#fff8d0' : '#ffdf8a';
    ctx.beginPath();
    ctx.arc(
      period === 'morning' ? w * 0.2 : w * 0.82,
      h * (period === 'morning' ? 0.22 : 0.42),
      22,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Hai lớp nhà: lớp xa nhạt hơn, lớp gần đậm hơn và có cửa sổ.
  const [far, near] = BUILDING[period];
  for (const [layer, color] of [
    [0, far],
    [1, near],
  ] as const) {
    const rng = seededRng(100 + layer);
    let x = -10;
    while (x < w) {
      const bw = 40 + rng() * 70;
      const bh = h * (layer === 0 ? 0.35 + rng() * 0.35 : 0.2 + rng() * 0.35);
      ctx.fillStyle = color;
      ctx.fillRect(x, h - bh, bw, bh);
      if (layer === 1) {
        const lit = period === 'night' ? 0.55 : 0.06;
        for (let wy = h - bh + 8; wy < h - 6; wy += 12) {
          for (let wx = x + 6; wx < x + bw - 8; wx += 11) {
            const on = rng() < lit;
            ctx.fillStyle = on
              ? '#ffd98a'
              : period === 'night'
                ? 'rgba(10,12,30,0.6)'
                : 'rgba(255,255,255,0.35)';
            ctx.fillRect(wx, wy, 6, 7);
          }
        }
      }
      x += bw + (layer === 0 ? 4 : 10 + rng() * 20);
    }
  }
}

export function createCityTexture(period: DayPeriod): CanvasTexture {
  const [canvas] = canvas2d(1024, 192);
  drawCityscape(canvas, period);
  return finish(canvas);
}
