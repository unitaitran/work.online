import type { PerspectiveCamera, Scene } from 'three';
import type { QualityLevel, QualityPreset } from './quality';

/** Một màn 3D (tạo nhân vật, văn phòng...) do Engine chạy. */
export interface SceneController {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Logic chạy với bước thời gian cố định (FIXED_STEP). */
  fixedUpdate(dt: number): void;
  /** Gọi mỗi khung hình trước khi vẽ; alpha (0..1) để nội suy giữa hai bước logic. */
  frameUpdate(frameSeconds: number, alpha: number): void;
  applyQuality(preset: QualityPreset, level: QualityLevel): void;
  resize(width: number, height: number): void;
  /** Giải phóng mọi tài nguyên GPU và gỡ sự kiện. */
  dispose(): void;
}
