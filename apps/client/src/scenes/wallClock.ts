// Đồng hồ treo tường lớn, chạy theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè) dù máy đặt múi
// giờ nào. Mặt số vẽ bằng canvas, kim là hình khối; chỉ cập nhật góc kim mỗi khung hình.
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  SRGBColorSpace,
  TorusGeometry,
} from 'three';

/** Giờ, phút, giây hiện tại ở Việt Nam. */
export function vietnamTime(nowMs: number): { h: number; m: number; s: number } {
  const d = new Date(nowMs + 7 * 3_600_000);
  return {
    h: d.getUTCHours(),
    m: d.getUTCMinutes(),
    s: d.getUTCSeconds() + d.getUTCMilliseconds() / 1000,
  };
}

/** Góc kim (radian, theo chiều kim đồng hồ từ số 12). */
export function handAngles(t: { h: number; m: number; s: number }): {
  hour: number;
  minute: number;
  second: number;
} {
  const second = (t.s / 60) * Math.PI * 2;
  const minute = ((t.m + t.s / 60) / 60) * Math.PI * 2;
  const hour = (((t.h % 12) + (t.m + t.s / 60) / 60) / 12) * Math.PI * 2;
  return { hour, minute, second };
}

export class WallClock {
  readonly group = new Group();
  private readonly hour: Group;
  private readonly minute: Group;
  private readonly second: Group;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(radius = 0.62) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
      ctx.fillStyle = '#fffaf3';
      ctx.beginPath();
      ctx.arc(256, 256, 256, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b3241';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 64px ${font}`;
      for (let n = 1; n <= 12; n += 1) {
        const a = (n / 12) * Math.PI * 2;
        ctx.fillText(String(n), 256 + Math.sin(a) * 190, 256 - Math.cos(a) * 190);
      }
      for (let i = 0; i < 60; i += 1) {
        const a = (i / 60) * Math.PI * 2;
        const r0 = i % 5 === 0 ? 232 : 240;
        ctx.strokeStyle = i % 5 === 0 ? '#3b3241' : '#b0a3b5';
        ctx.lineWidth = i % 5 === 0 ? 6 : 3;
        ctx.beginPath();
        ctx.moveTo(256 + Math.sin(a) * r0, 256 - Math.cos(a) * r0);
        ctx.lineTo(256 + Math.sin(a) * 250, 256 - Math.cos(a) * 250);
        ctx.stroke();
      }
      ctx.fillStyle = '#ff8a65';
      ctx.font = `700 30px ${font}`;
      ctx.fillText('Giờ Việt Nam', 256, 340);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const faceGeo = new CircleGeometry(radius, 48);
    const faceMat = new MeshBasicMaterial({ map: texture });
    const face = new Mesh(faceGeo, faceMat);
    face.position.z = 0.03;
    const rimGeo = new TorusGeometry(radius, 0.05, 10, 48);
    const backGeo = new CylinderGeometry(radius, radius, 0.05, 48);
    const frameMat = new MeshLambertMaterial({ color: 0x5a3a2a });
    const rim = new Mesh(rimGeo, frameMat);
    rim.position.z = 0.03;
    const back = new Mesh(backGeo, frameMat);
    back.rotation.x = Math.PI / 2;
    this.group.add(back, face, rim);

    const handMat = new MeshLambertMaterial({ color: 0x2d2433 });
    const secondMat = new MeshLambertMaterial({ color: 0xe0575b });
    const makeHand = (
      length: number,
      width: number,
      z: number,
      material: MeshLambertMaterial,
    ): Group => {
      const pivot = new Group();
      const geo = new BoxGeometry(width, length, 0.012);
      geo.translate(0, length / 2 - length * 0.12, 0);
      pivot.add(new Mesh(geo, material));
      pivot.position.z = z;
      this.disposables.push(geo);
      this.group.add(pivot);
      return pivot;
    };
    this.hour = makeHand(radius * 0.52, 0.045, 0.05, handMat);
    this.minute = makeHand(radius * 0.78, 0.03, 0.06, handMat);
    this.second = makeHand(radius * 0.85, 0.012, 0.07, secondMat);
    const capGeo = new CylinderGeometry(0.035, 0.035, 0.03, 16);
    const cap = new Mesh(capGeo, secondMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.08;
    this.group.add(cap);
    this.disposables.push(
      texture,
      faceGeo,
      faceMat,
      rimGeo,
      backGeo,
      frameMat,
      handMat,
      secondMat,
      capGeo,
    );
    this.update(Date.now());
  }

  update(nowMs: number): void {
    const a = handAngles(vietnamTime(nowMs));
    // Quay quanh trục Z (mặt đồng hồ nhìn về +Z): chiều kim đồng hồ = góc âm.
    this.hour.rotation.z = -a.hour;
    this.minute.rotation.z = -a.minute;
    this.second.rotation.z = -a.second;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
