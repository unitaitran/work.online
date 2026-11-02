import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  type Texture,
} from 'three';

export interface DustVolume {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

/** Hạt bụi lấp lánh trong nắng: 1 draw call, số hạt theo mức chất lượng (0 = tắt). */
export class DustMotes {
  readonly points: Points;
  private readonly material: PointsMaterial;
  private time = 0;

  constructor(
    private readonly volume: DustVolume,
    dotTexture: Texture,
  ) {
    this.material = new PointsMaterial({
      size: 0.06,
      map: dotTexture,
      color: 0xfff1c9,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(new BufferGeometry(), this.material);
    this.points.frustumCulled = false;
  }

  setCount(count: number): void {
    const positions = new Float32Array(count * 3);
    const { minX, maxX, minZ, maxZ, height } = this.volume;
    for (let i = 0; i < count; i += 1) {
      // Phân bố giả ngẫu nhiên cố định (dãy Halton cơ số 2, 3, 5).
      positions[i * 3] = minX + halton(i + 1, 2) * (maxX - minX);
      positions[i * 3 + 1] = 0.3 + halton(i + 1, 3) * (height - 0.3);
      positions[i * 3 + 2] = minZ + halton(i + 1, 5) * (maxZ - minZ);
    }
    this.points.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.points.geometry = geometry;
    this.points.visible = count > 0;
  }

  update(dt: number): void {
    if (!this.points.visible) return;
    this.time += dt;
    // Trôi nhẹ cả đám thay vì cập nhật từng hạt: rẻ mà vẫn có cảm giác lơ lửng.
    this.points.position.y = Math.sin(this.time * 0.4) * 0.15;
    this.points.rotation.y = Math.sin(this.time * 0.05) * 0.05;
    this.material.opacity = 0.55 + Math.sin(this.time * 1.3) * 0.15;
  }
}

function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  let i = index;
  while (i > 0) {
    result += fraction * (i % base);
    i = Math.floor(i / base);
    fraction /= base;
  }
  return result;
}
