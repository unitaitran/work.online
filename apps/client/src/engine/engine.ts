import { Material, PCFShadowMap, SRGBColorSpace, WebGLRenderer, type Object3D } from 'three';
import { advanceFixedStep, FIXED_STEP } from './loop';
import {
  createGovernorState,
  lowerQuality,
  QUALITY_PRESETS,
  updateGovernor,
  type QualityLevel,
  type QualityMode,
} from './quality';
import type { SceneController } from './types';

export interface EngineStats {
  fps: number;
  /** Thời gian CPU trung bình cho một khung hình (logic + gửi lệnh vẽ), mili giây. */
  cpuFrameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  level: QualityLevel;
  mode: QualityMode;
}

export interface EngineOptions {
  mode: QualityMode;
  /** Mức dùng khi mode là 'auto'. */
  autoStartLevel: QualityLevel;
  onAutoDowngrade?(level: QualityLevel): void;
  onStats?(stats: EngineStats): void;
}

const STATS_INTERVAL_SECONDS = 0.5;

/**
 * Renderer + vòng lặp bước cố định + chất lượng. Tự dừng khi tab bị ẩn.
 * Mỗi lúc chạy một SceneController; đổi màn thì màn cũ được dispose.
 */
export class Engine {
  readonly renderer: WebGLRenderer;
  private controller: SceneController | null = null;
  private mode: QualityMode;
  private level: QualityLevel;
  private governor = createGovernorState();
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;
  private avgFrameSeconds = FIXED_STEP;
  private avgCpuMs = 0;
  private statsTimer = 0;
  private stats: EngineStats;
  private disposed = false;

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  private readonly onResize = (): void => {
    this.resize();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: EngineOptions,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.mode = options.mode;
    this.level = options.mode === 'auto' ? options.autoStartLevel : options.mode;
    this.stats = {
      fps: 0,
      cpuFrameMs: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      level: this.level,
      mode: this.mode,
    };
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (!document.hidden) this.resume();
  }

  get qualityLevel(): QualityLevel {
    return this.level;
  }

  get qualityMode(): QualityMode {
    return this.mode;
  }

  getStats(): EngineStats {
    return { ...this.stats };
  }

  /** Đổi màn. Màn cũ (nếu có) bị dispose. */
  setController(controller: SceneController | null): void {
    const previous = this.controller;
    this.controller = controller;
    previous?.dispose();
    this.accumulator = 0;
    this.governor = createGovernorState();
    if (controller) {
      controller.applyQuality(QUALITY_PRESETS[this.level], this.level);
      this.resize();
    }
  }

  /**
   * Đổi cảnh tạm thời mà KHÔNG huỷ cảnh đang chạy (ví dụ mở "Sửa nhân vật" ngay trong văn phòng,
   * đóng lại thì quay về đúng chỗ cũ). Trả cảnh cũ để đổi lại sau.
   */
  swapController(controller: SceneController): SceneController | null {
    const previous = this.controller;
    this.controller = controller;
    this.accumulator = 0;
    controller.applyQuality(QUALITY_PRESETS[this.level], this.level);
    this.resize();
    return previous;
  }

  setQualityMode(mode: QualityMode): void {
    this.mode = mode;
    if (mode !== 'auto') this.level = mode;
    this.governor = createGovernorState();
    this.applyQuality();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.setController(null);
    this.renderer.dispose();
  }

  private pause(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.lastTime = null;
  }

  private resume(): void {
    if (this.rafId !== null || this.disposed) return;
    this.lastTime = null;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    const frameSeconds = this.lastTime === null ? 0 : (now - this.lastTime) / 1000;
    this.lastTime = now;

    const controller = this.controller;
    if (!controller) return;

    const cpuStart = performance.now();
    const step = advanceFixedStep(this.accumulator, frameSeconds);
    this.accumulator = step.accumulator;
    for (let i = 0; i < step.steps; i += 1) controller.fixedUpdate(FIXED_STEP);
    controller.frameUpdate(Math.min(frameSeconds, 0.25), step.alpha);
    this.renderer.render(controller.scene, controller.camera);
    this.avgCpuMs += (performance.now() - cpuStart - this.avgCpuMs) * 0.05;

    if (frameSeconds > 0) this.trackPerformance(frameSeconds);
  };

  private trackPerformance(frameSeconds: number): void {
    if (frameSeconds < 0.5) {
      this.avgFrameSeconds += (frameSeconds - this.avgFrameSeconds) * 0.05;
    }

    if (this.mode === 'auto') {
      const result = updateGovernor(this.governor, frameSeconds);
      this.governor = result.state;
      if (result.downgrade) {
        const next = lowerQuality(this.level);
        if (next) {
          this.level = next;
          this.applyQuality();
          this.options.onAutoDowngrade?.(next);
        }
      }
    }

    this.statsTimer += frameSeconds;
    if (this.statsTimer >= STATS_INTERVAL_SECONDS) {
      this.statsTimer = 0;
      const info = this.renderer.info;
      this.stats = {
        fps: Math.round(1 / this.avgFrameSeconds),
        cpuFrameMs: Math.round(this.avgCpuMs * 100) / 100,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        level: this.level,
        mode: this.mode,
      };
      this.options.onStats?.(this.getStats());
    }
  }

  private applyQuality(): void {
    const preset = QUALITY_PRESETS[this.level];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatioCap));
    const shadowsChanged = this.renderer.shadowMap.enabled !== preset.shadows;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.controller?.applyQuality(preset, this.level);
    // Bật/tắt bóng sau lần vẽ đầu cần biên dịch lại shader.
    if (shadowsChanged && this.controller) markMaterialsForUpdate(this.controller.scene);
    this.stats = { ...this.stats, level: this.level, mode: this.mode };
  }

  private resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.controller?.resize(width, height);
  }
}

function markMaterialsForUpdate(root: Object3D): void {
  root.traverse((object) => {
    const material = (object as Object3D & { material?: unknown }).material;
    const list: unknown[] = Array.isArray(material) ? material : [material];
    for (const item of list) if (item instanceof Material) item.needsUpdate = true;
  });
}
