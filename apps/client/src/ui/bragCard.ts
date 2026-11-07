// Thẻ khoe thành tích: ảnh 1080×1350 vẽ bằng canvas (ảnh nhân vật 3D / chibi cute,
// tên người chơi, chức danh, số liệu hôm nay, chuỗi ngày).
import {
  EMPTY_DAILY_STATS,
  HAIR_COLORS,
  OUTFIT_COLORS,
  SKIN_TONES,
  type Appearance,
  type DailyStats,
} from '@dilam/shared';
import { AmbientLight, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { AvatarModel } from '../avatar/avatarModel';
import { gearFromEquipped } from '../avatar/gear';
import { createVertexColorMaterial } from '../engine/meshBuilder';
import { STRINGS } from '../strings';

export const BRAG_WIDTH = 1080;
export const BRAG_HEIGHT = 1350;

export interface BragData {
  name?: string | undefined;
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
export function bragTiles(
  stats: DailyStats | undefined,
): { value: string; label: string; icon: string }[] {
  const s = STRINGS.brag;
  const st = stats ?? EMPTY_DAILY_STATS;
  const fmt = new Intl.NumberFormat('vi-VN');
  return [
    { value: fmt.format(st.keys), label: s.keys, icon: '⌨️' },
    { value: fmt.format(st.coffees), label: s.coffees, icon: '☕' },
    { value: fmt.format(st.meetings), label: s.meetings, icon: '📋' },
    { value: fmt.format(st.dodged), label: s.dodged, icon: '👀' },
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
    scene.add(new AmbientLight(0xffffff, 2.0));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 3, 3);
    scene.add(sun, avatar.root);
    avatar.root.rotation.y = 0.32;
    avatar.update(0.016);
    const camera = new PerspectiveCamera(30, 640 / 760, 0.1, 20);
    camera.position.set(0, 0.82, 2.75);
    camera.lookAt(0, 0.58, 0);
    renderer.render(scene, camera);

    // Sao chép sang canvas 2D trước khi giải phóng WebGL
    const copy = document.createElement('canvas');
    copy.width = 640;
    copy.height = 760;
    const c2d = copy.getContext('2d');
    if (c2d) {
      c2d.drawImage(canvas, 0, 0);
      return copy;
    }
    return null;
  } catch {
    return null;
  } finally {
    avatar.dispose();
    material.dispose();
    renderer?.dispose();
  }
}

function toHexColor(num: number | undefined, fallback: string): string {
  if (num === undefined || num < 0) return fallback;
  return `#${num.toString(16).padStart(6, '0')}`;
}

/** Vẽ hình chibi dễ thương làm fallback khi WebGL không render được */
function drawChibiFallback(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  appearance: Appearance,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const skinColor = toHexColor(SKIN_TONES[appearance.skin], '#ffdfc4');
  const hairColor = toHexColor(HAIR_COLORS[appearance.hairColor], '#332211');
  const shirtColor = toHexColor(
    appearance.outfitColor !== undefined && appearance.outfitColor > 0
      ? OUTFIT_COLORS[appearance.outfitColor]
      : 0x6f9fd8,
    '#4a90e2',
  );

  // Bóng đổ
  ctx.fillStyle = 'rgba(255, 138, 101, 0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 185, 135, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Thân áo
  ctx.fillStyle = shirtColor;
  roundRect(ctx, -65, 80, 130, 110, 24);
  ctx.fill();

  // Cổ áo sơ mi trắng
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-35, 80);
  ctx.lineTo(0, 115);
  ctx.lineTo(35, 80);
  ctx.closePath();
  ctx.fill();

  // Dây thẻ nhân viên cam
  ctx.fillStyle = '#ff6b4a';
  ctx.beginPath();
  ctx.moveTo(-12, 112);
  ctx.lineTo(12, 112);
  ctx.lineTo(8, 165);
  ctx.lineTo(0, 178);
  ctx.lineTo(-8, 165);
  ctx.closePath();
  ctx.fill();

  // Khuôn mặt
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(0, 10, 85, 0, Math.PI * 2);
  ctx.fill();

  // Má hồng
  ctx.fillStyle = 'rgba(255, 100, 120, 0.35)';
  ctx.beginPath();
  ctx.arc(-48, 22, 15, 0, Math.PI * 2);
  ctx.arc(48, 22, 15, 0, Math.PI * 2);
  ctx.fill();

  // Tóc
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.arc(0, -5, 88, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(88, 5);
  ctx.quadraticCurveTo(50, -40, 20, 0);
  ctx.quadraticCurveTo(0, -50, -30, -5);
  ctx.quadraticCurveTo(-60, -35, -88, 5);
  ctx.closePath();
  ctx.fill();

  // Mắt
  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.arc(-28, 10, 9, 0, Math.PI * 2);
  ctx.arc(28, 10, 9, 0, Math.PI * 2);
  ctx.fill();

  // Ánh sáng trong mắt
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-26, 7, 3.5, 0, Math.PI * 2);
  ctx.arc(30, 7, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Nụ cười
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#c05040';
  ctx.beginPath();
  ctx.arc(0, 24, 14, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.restore();
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

  // Nền gradient ấm áp
  const bg = ctx.createLinearGradient(0, 0, 0, BRAG_HEIGHT);
  bg.addColorStop(0, '#fff6f0');
  bg.addColorStop(0.5, '#fef0e4');
  bg.addColorStop(1, '#fee5d5');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, BRAG_WIDTH, BRAG_HEIGHT);

  // Khung thẻ bo góc chính
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  roundRect(ctx, 36, 36, BRAG_WIDTH - 72, BRAG_HEIGHT - 72, 44);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 179, 138, 0.35)';
  ctx.stroke();

  // Khe móc thẻ nhân viên kim loại ở trên cùng
  ctx.fillStyle = '#e8ded4';
  roundRect(ctx, (BRAG_WIDTH - 140) / 2, 54, 140, 18, 9);
  ctx.fill();
  ctx.fillStyle = '#d5c8be';
  roundRect(ctx, (BRAG_WIDTH - 136) / 2, 56, 136, 14, 7);
  ctx.fill();

  // Bong bóng trang trí
  ctx.fillStyle = 'rgba(255, 138, 101, 0.12)';
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath();
    ctx.arc(
      ((i * 187 + 60) % (BRAG_WIDTH - 120)) + 60,
      ((i * 103) % 400) + 90,
      20 + (i % 4) * 12,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Header: Tiêu đề và ngày
  ctx.fillStyle = '#ff754b';
  roundRect(ctx, (BRAG_WIDTH - 280) / 2, 95, 280, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `800 24px ${font}`;
  ctx.fillText('ĐI LÀM ONLINE • THẺ THÀNH TÍCH', BRAG_WIDTH / 2, 126);

  ctx.fillStyle = '#2d2232';
  ctx.font = `800 58px ${font}`;
  ctx.fillText(s.heading, BRAG_WIDTH / 2, 205);
  ctx.font = `600 32px ${font}`;
  ctx.fillStyle = '#837488';
  ctx.fillText(data.day.split('-').reverse().join('/'), BRAG_WIDTH / 2, 250);

  // Vòng bệ đỡ nhân vật
  const pedestalGrad = ctx.createRadialGradient(BRAG_WIDTH / 2, 520, 50, BRAG_WIDTH / 2, 520, 240);
  pedestalGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  pedestalGrad.addColorStop(0.7, 'rgba(255, 235, 220, 0.8)');
  pedestalGrad.addColorStop(1, 'rgba(255, 215, 190, 0)');
  ctx.fillStyle = pedestalGrad;
  ctx.beginPath();
  ctx.arc(BRAG_WIDTH / 2, 520, 240, 0, Math.PI * 2);
  ctx.fill();

  // Nhân vật (chụp từ 3D, nếu không có thì vẽ chibi fallback)
  const portrait = renderPortrait(data.appearance, data.equipped);
  if (portrait) {
    ctx.drawImage(portrait, (BRAG_WIDTH - 500) / 2, 260, 500, 594);
  } else {
    drawChibiFallback(ctx, BRAG_WIDTH / 2, 520, 1.45, data.appearance);
  }

  // Tên người chơi
  const playerName = data.name && data.name.trim().length > 0 ? data.name : 'Đồng nghiệp';
  ctx.fillStyle = '#261b2a';
  ctx.textAlign = 'center';
  ctx.font = `800 52px ${font}`;
  ctx.fillText(playerName, BRAG_WIDTH / 2, 855);

  // Chức danh & Cấp
  const titleGrad = ctx.createLinearGradient(160, 875, BRAG_WIDTH - 160, 875);
  titleGrad.addColorStop(0, '#ff6740');
  titleGrad.addColorStop(1, '#ff9660');
  ctx.fillStyle = titleGrad;
  roundRect(ctx, 160, 878, BRAG_WIDTH - 320, 80, 40);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 38px ${font}`;
  ctx.fillText(s.level(data.level, data.title), BRAG_WIDTH / 2, 932);

  // 4 Ô số liệu hôm nay (Bento tiles)
  const tiles = bragTiles(data.stats);
  const tileW = 210;
  const gap = 20;
  const startX = (BRAG_WIDTH - (tileW * 4 + gap * 3)) / 2;
  tiles.forEach((tile, i) => {
    const x = startX + i * (tileW + gap);
    const y = 985;
    // Nền trắng có bóng
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, tileW, 165, 24);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 185, 145, 0.4)';
    ctx.stroke();

    // Vạch màu trên đầu card
    ctx.fillStyle = ['#ff8a65', '#ffb74d', '#4db6ac', '#ba68c8'][i % 4] ?? '#ff8a65';
    roundRect(ctx, x + 20, y + 10, tileW - 40, 5, 2.5);
    ctx.fill();

    // Icon + Số
    ctx.fillStyle = '#2a1e2f';
    ctx.font = `800 50px ${font}`;
    ctx.fillText(tile.value, x + tileW / 2, y + 90);

    // Label
    ctx.fillStyle = '#7a6a7f';
    ctx.font = `600 24px ${font}`;
    ctx.fillText(tile.label, x + tileW / 2, y + 135);
  });

  // Chuỗi chấm công
  ctx.fillStyle = '#34263a';
  ctx.font = `700 34px ${font}`;
  ctx.fillText(`🔥 ${s.streak(data.streak)}`, BRAG_WIDTH / 2, 1205);

  // Chân thẻ
  ctx.fillStyle = '#a697a8';
  ctx.font = `600 26px ${font}`;
  ctx.fillText('dilam.online • Game văn phòng 3D nhiều người chơi', BRAG_WIDTH / 2, 1260);

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
