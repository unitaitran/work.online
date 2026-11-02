import { DirectionalLight, HemisphereLight, type Object3D, type Scene } from 'three';
import type { QualityPreset } from '../engine/quality';

export interface Lighting {
  readonly sun: DirectionalLight;
  applyQuality(preset: QualityPreset): void;
  /** Cho mặt trời (và vùng bóng) đi theo một điểm, giữ bóng sắc nét quanh nhân vật. */
  follow(x: number, z: number): void;
}

/** Ánh sáng ấm kiểu văn phòng buổi sáng: trời + một nguồn nắng xiên có bóng. */
export function createLighting(scene: Scene, shadowHalfExtent: number): Lighting {
  scene.add(new HemisphereLight(0xfff6ea, 0xc9a98a, 1.7));

  const sun = new DirectionalLight(0xffffff, 2.1);
  const offset = { x: 4, y: 9, z: 5 };
  sun.position.set(offset.x, offset.y, offset.z);
  sun.shadow.camera.left = -shadowHalfExtent;
  sun.shadow.camera.right = shadowHalfExtent;
  sun.shadow.camera.top = shadowHalfExtent;
  sun.shadow.camera.bottom = -shadowHalfExtent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  return {
    sun,
    applyQuality(preset) {
      sun.castShadow = preset.shadows;
      if (sun.shadow.mapSize.x !== preset.shadowMapSize) {
        sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
    follow(x, z) {
      sun.position.set(x + offset.x, offset.y, z + offset.z);
      sun.target.position.set(x, 0, z);
    },
  };
}

export function setShadowFlags(root: Object3D, cast: boolean, receive: boolean): void {
  root.traverse((object) => {
    object.castShadow = cast;
    object.receiveShadow = receive;
  });
}
