import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface SpinningCubeScene {
  /** Dừng vòng lặp và giải phóng toàn bộ tài nguyên GPU. */
  dispose(): void;
}

const BACKGROUND = 0xfdf3e7;
const CUBE_COLOR = 0x7cc6c0;
/** Tốc độ xoay (radian mỗi giây) theo trục X và Y. */
const SPIN_X = 0.5;
const SPIN_Y = 0.8;
/** Giới hạn pixel ratio để máy yếu / điện thoại màn hình dày không phải vẽ quá nhiều điểm ảnh. */
const MAX_PIXEL_RATIO = 2;

/** Cảnh Phase 0: một khối lập phương bo góc xoay giữa màn hình. Ném lỗi nếu không có WebGL. */
export function createSpinningCube(canvas: HTMLCanvasElement): SpinningCubeScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const scene = new Scene();
  scene.background = new Color(BACKGROUND);

  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  // Nhìn hơi cao hơn tâm khối để khối nằm thấp xuống, không bị thẻ HUD phía trên che.
  camera.position.set(0, 0.9, 5);
  camera.lookAt(0, 0.6, 0);

  scene.add(new HemisphereLight(0xffffff, 0xf2c9a0, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 4, 5);
  scene.add(sun);

  const geometry = new RoundedBoxGeometry(1.4, 1.4, 1.4, 4, 0.18);
  const material = new MeshStandardMaterial({ color: CUBE_COLOR, roughness: 0.55 });
  const cube = new Mesh(geometry, material);
  scene.add(cube);

  const resize = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  // Góc xoay tính theo thời gian thực nên tốc độ như nhau dù máy chạy 30 hay 120 fps.
  renderer.setAnimationLoop((timeMs: number) => {
    const t = timeMs / 1000;
    cube.rotation.set(t * SPIN_X, t * SPIN_Y, 0);
    renderer.render(scene, camera);
  });

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
