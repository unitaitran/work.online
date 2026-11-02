// Thẻ khoe thành tích: ảnh 1080×1350 vẽ bằng canvas (nhân vật 3D chụp từ một renderer nhỏ riêng,
// chức danh, số liệu hôm nay). KHÔNG có tên hay mã nhân viên (không thông tin định danh).
import { EMPTY_DAILY_STATS, type Appearance, type DailyStats } from '@dilam/shared';
import { AmbientLight, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { AvatarModel } from '../avatar/avatarModel';
import { gearFromEquipped } from '../avatar/gear';
import { createVertexColorMaterial } from '../engine/meshBuilder';
import { STRINGS } from '../strings';

export const BRAG_WIDTH = 1080;
export const BRAG_HEIGHT = 1350;

export interface BragData {
  appearance: Appearance;
  equipped: readonly string[];
  level: number;
  title: string;
  streak: number;
  stats: DailyStats | undefined;
  /** Khoá ngày (in trên thẻ). */
  day: string;
}

/** Các ô số liệu (thuần, để test). */
export function bragTiles(stats: DailyStats | undefined): { value: string; label: string }[] {
  const s = STRINGS.brag;
  const st = stats ?? EMPTY_DAILY_STATS;
  const fmt = new Intl.NumberFormat('vi-VN');
  return [
    { value: fmt.format(st.keys), label: s.keys },
    { value: fmt.format(st.coffees), label: s.coffees },
    { value: fmt.format(st.meetings), label: s.meetings },
    { value: fmt.format(st.dodged), label: s.dodged },
  ];
}

/** Chụp nhân vật (nền trong suốt) để dán vào thẻ. */
function renderPortrait(
  appearance: Appearance,
  equipped: readonly string[],
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  let renderer: WebGLRenderer | null = null;
  const material = createVertexColorMaterial();
  const avatar = new AvatarModel(appearance, material, gearFromEquipped(equipped));
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(640, 760, false);
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.9);
    sun.position.set(2, 3, 3);
    scene.add(sun, avatar.root);
    avatar.root.rotation.y = 0.35;
    avatar.update(0.016);
    const camera = new PerspectiveCamera(30, 640 / 760, 0.1, 20);
    camera.position.set(0, 0.85, 3);
    camera.lookAt(0, 0.6, 0);
    renderer.render(scene, camera);
    return canvas;
  } catch {
    return null;
  } finally {
    avatar.dispose();
    material.dispose();
    renderer?.dispose();
  }
}

/** Vẽ thẻ khoe; trả về canvas 1080×1350. */
export async function drawBragCard(data: BragData): Promise<HTMLCanvasElement> {
  const s = STRINGS.brag;
  const canvas = document.createElement('canvas');
  canvas.width = BRAG_WIDTH;
  canvas.height = BRAG_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  await document.fonts.ready.catch(() => undefined);
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';

  // Nền.
  const bg = ctx.createLinearGradient(0, 0, 0, BRAG_HEIGHT);
  bg.addColorStop(0, '#ffe7d6');
  bg.addColorStop(1, '#fdf3e7');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, BRAG_WIDTH, BRAG_HEIGHT);
  ctx.fillStyle = 'rgba(255, 138, 101, 0.16)';
  for (let i = 0; i < 14; i += 1) {
    ctx.beginPath();
    ctx.arc((i * 173) % BRAG_WIDTH, ((i * 97) % 420) + 40, 24 + (i % 4) * 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tiêu đề và ngày.
  ctx.fillStyle = '#3b3241';
  ctx.textAlign = 'center';
  ctx.font = `800 64px ${font}`;
  ctx.fillText(s.heading, BRAG_WIDTH / 2, 120);
  ctx.font = `600 36px ${font}`;
  ctx.fillStyle = '#7a6e80';
  ctx.fillText(data.day.split('-').reverse().join('/'), BRAG_WIDTH / 2, 175);

  // Nhân vật.
  const portrait = renderPortrait(data.appearance, data.equipped);
  if (portrait) ctx.drawImage(portrait, (BRAG_WIDTH - 540) / 2, 200, 540, 641);

  // Chức danh.
  ctx.fillStyle = '#ff8a65';
  roundRect(ctx, 140, 830, BRAG_WIDTH - 280, 96, 48);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 44px ${font}`;
  ctx.fillText(s.level(data.level, data.title), BRAG_WIDTH / 2, 893);

  // Số liệu hôm nay.
  const tiles = bragTiles(data.stats);
  const tileW = 210;
  const gap = 24;
  const startX = (BRAG_WIDTH - (tileW * 4 + gap * 3)) / 2;
  tiles.forEach((tile, i) => {
    const x = startX + i * (tileW + gap);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, 970, tileW, 190, 28);
    ctx.fill();
    ctx.fillStyle = '#3b3241';
    ctx.font = `800 60px ${font}`;
    ctx.fillText(tile.value, x + tileW / 2, 1060);
    ctx.fillStyle = '#7a6e80';
    ctx.font = `600 28px ${font}`;
    ctx.fillText(tile.label, x + tileW / 2, 1115);
  });

  ctx.fillStyle = '#3b3241';
  ctx.font = `700 36px ${font}`;
  ctx.fillText(s.streak(data.streak), BRAG_WIDTH / 2, 1225);
  ctx.fillStyle = '#b0a3b5';
  ctx.font = `700 30px ${font}`;
  ctx.fillText(s.footer, BRAG_WIDTH / 2, 1300);
  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Chia sẻ bằng navigator.share (nếu máy hỗ trợ gửi file), không thì tải về. */
export async function shareOrDownload(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<'shared' | 'downloaded'> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) return 'downloaded';
  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: STRINGS.brag.shareTitle });
      return 'shared';
    } catch {
      // Người chơi huỷ: tải về thay thế.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
  return 'downloaded';
}
