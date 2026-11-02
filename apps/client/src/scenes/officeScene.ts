// Văn phòng thử Phase 1: đi lại bằng bàn phím, joystick ảo, hoặc chạm/bấm lên sàn.
import {
  Color,
  Fog,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  Vector3,
  type MeshLambertMaterial,
} from 'three';
import type { Appearance } from '../avatar/appearance';
import { AvatarModel } from '../avatar/avatarModel';
import { applyDrag, applyZoom, orbitOffset, type OrbitState } from '../engine/cameraMath';
import { disposeObject3D } from '../engine/disposal';
import { damp, dampAngle, lerp } from '../engine/mathUtils';
import { createVertexColorMaterial } from '../engine/meshBuilder';
import type { QualityPreset } from '../engine/quality';
import type { SceneController } from '../engine/types';
import { VirtualJoystick } from '../input/joystick';
import { KeyboardInput } from '../input/keyboard';
import { PointerControls } from '../input/pointerControls';
import { STRINGS } from '../strings';
import { moveWithCollisions, type Aabb, type Vec2 } from '../world/collision';
import { DustMotes } from '../world/dust';
import { createLighting, type Lighting } from '../world/lighting';
import { combineInputs, headingOf, inputToWorld, stepToward } from '../world/movement';
import { findPath } from '../world/pathfinding';
import { buildRoom } from '../world/room';
import { obstaclesOf, type RoomLayout } from '../world/roomLayout';
import { createSoftDotTexture } from '../world/textures';
import { createBlobShadow } from './blobShadow';

/** Tốc độ đi (m/s) và bán kính va chạm của nhân vật. */
export const WALK_SPEED = 2.6;
export const PLAYER_RADIUS = 0.28;
const TURN_SPEED = 14;
const CAMERA_FOLLOW = 9;
const LOOK_HEIGHT = 0.75;
const MARKER_SECONDS = 1.2;

export interface OfficeSceneOptions {
  canvas: HTMLElement;
  /** Lớp HUD để gắn joystick ảo. */
  hudLayer: HTMLElement;
  appearance: Appearance;
  layout: RoomLayout;
}

export class OfficeScene implements SceneController {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 60);
  private readonly material: MeshLambertMaterial = createVertexColorMaterial();
  private readonly avatar: AvatarModel;
  private readonly lighting: Lighting;
  private readonly dust: DustMotes;
  private readonly blob: Mesh;
  private readonly marker: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly keyboard = new KeyboardInput();
  private readonly joystick: VirtualJoystick;
  private readonly pointer: PointerControls;
  private readonly raycaster = new Raycaster();
  private readonly floorPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly obstacles: Aabb[];
  private readonly bounds: Aabb;
  private readonly canvas: HTMLElement;

  private position: Vec2;
  private previous: Vec2;
  private facing = Math.PI;
  private path: Vec2[] = [];
  private stuckSeconds = 0;
  private markerSeconds = 0;
  private orbit: OrbitState = { yaw: 0.5, pitch: 0.7, distance: 6.5 };
  private readonly lookTarget = new Vector3();

  constructor(options: OfficeSceneOptions) {
    this.canvas = options.canvas;
    const { layout } = options;
    this.bounds = layout.bounds;
    this.obstacles = obstaclesOf(layout);
    this.position = { ...layout.spawn };
    this.previous = { ...layout.spawn };

    this.scene.background = new Color(0xfdf3e7);
    this.scene.fog = new Fog(0xfdf3e7, 18, 40);
    this.lighting = createLighting(this.scene, 9);

    const room = buildRoom(layout, this.material);
    this.scene.add(room.group);

    const dotTexture = createSoftDotTexture();
    this.dust = new DustMotes({ ...layout.bounds, height: layout.wallHeight }, dotTexture);
    this.scene.add(this.dust.points);

    this.blob = createBlobShadow(dotTexture);
    this.scene.add(this.blob);

    this.marker = new Mesh(
      new RingGeometry(0.16, 0.22, 28),
      new MeshBasicMaterial({ color: 0xff8a65, transparent: true, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.avatar = new AvatarModel(options.appearance, this.material);
    this.scene.add(this.avatar.root);

    this.lookTarget.set(this.position.x, LOOK_HEIGHT, this.position.z);
    this.joystick = new VirtualJoystick(options.hudLayer, STRINGS.office.joystick);
    this.pointer = new PointerControls(options.canvas, {
      onTap: (x, y) => {
        this.handleTap(x, y);
      },
      onDrag: (dx, dy) => {
        this.orbit = applyDrag(this.orbit, dx, dy);
      },
      onZoom: (factor) => {
        this.orbit = applyZoom(this.orbit, factor);
      },
    });
  }

  /** Vị trí hiện tại (dùng cho kiểm thử tự động / debug). */
  getPlayerPosition(): Vec2 {
    return { ...this.position };
  }

  getOrbit(): OrbitState {
    return { ...this.orbit };
  }

  /** Toạ độ màn hình (pixel CSS) của một điểm trên sàn; null nếu điểm ở sau camera. */
  projectFloorPoint(x: number, z: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const v = new Vector3(x, 0, z).project(this.camera);
    if (v.z > 1) return null;
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  }

  fixedUpdate(dt: number): void {
    this.previous = { ...this.position };
    const input = combineInputs(this.keyboard.vector(), this.joystick.vector());
    let delta: Vec2 = { x: 0, z: 0 };

    if (Math.hypot(input.x, input.y) > 0.05) {
      this.cancelPath();
      const direction = inputToWorld(input, this.orbit.yaw);
      delta = { x: direction.x * WALK_SPEED * dt, z: direction.z * WALK_SPEED * dt };
    } else {
      const next = this.path[0];
      if (next) {
        const step = stepToward(this.position, next, WALK_SPEED * dt);
        delta = { x: step.pos.x - this.position.x, z: step.pos.z - this.position.z };
        if (step.arrived) this.path.shift();
      }
    }

    const moved = moveWithCollisions(
      this.position,
      delta,
      PLAYER_RADIUS,
      this.obstacles,
      this.bounds,
    );
    const movedX = moved.x - this.position.x;
    const movedZ = moved.z - this.position.z;
    const distance = Math.hypot(movedX, movedZ);
    this.position = moved;

    // Đang đi theo đường mà gần như không nhích được: bỏ đường (tránh đứng dậm chân mãi).
    if (this.path.length > 0 && distance < WALK_SPEED * dt * 0.2) {
      this.stuckSeconds += dt;
      if (this.stuckSeconds > 0.4) this.cancelPath();
    } else {
      this.stuckSeconds = 0;
    }
    if (this.path.length === 0 && this.markerSeconds > 0.3) this.markerSeconds = 0.3;

    const walking = distance > 0.0005;
    if (walking) {
      this.facing = dampAngle(this.facing, headingOf({ x: movedX, z: movedZ }), TURN_SPEED, dt);
    }
    this.avatar.setPose(walking ? 'walk' : 'stand');
    this.avatar.update(dt);
  }

  frameUpdate(frameSeconds: number, alpha: number): void {
    const x = lerp(this.previous.x, this.position.x, alpha);
    const z = lerp(this.previous.z, this.position.z, alpha);
    this.avatar.root.position.set(x, 0, z);
    this.avatar.root.rotation.y = this.facing;
    this.blob.position.set(x, 0.006, z);
    this.lighting.follow(x, z);

    this.lookTarget.set(
      damp(this.lookTarget.x, x, CAMERA_FOLLOW, frameSeconds),
      LOOK_HEIGHT,
      damp(this.lookTarget.z, z, CAMERA_FOLLOW, frameSeconds),
    );
    const offset = orbitOffset(this.orbit);
    this.camera.position.set(
      this.lookTarget.x + offset.x,
      this.lookTarget.y + offset.y,
      this.lookTarget.z + offset.z,
    );
    this.camera.lookAt(this.lookTarget);

    if (this.markerSeconds > 0) {
      this.markerSeconds = Math.max(0, this.markerSeconds - frameSeconds);
      const k = this.markerSeconds / MARKER_SECONDS;
      this.marker.material.opacity = Math.min(1, k * 2);
      this.marker.scale.setScalar(1 + (1 - k) * 0.4);
      this.marker.visible = this.markerSeconds > 0;
    }
    this.dust.update(frameSeconds);
  }

  applyQuality(preset: QualityPreset): void {
    this.lighting.applyQuality(preset);
    this.avatar.setShadows(preset.shadows);
    this.blob.visible = !preset.shadows;
    this.dust.setCount(preset.particles);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    // Màn dọc: mở rộng góc nhìn một chút để không thấy quá chật.
    this.camera.fov = width < height ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.keyboard.dispose();
    this.joystick.dispose();
    this.pointer.dispose();
    this.avatar.dispose();
    disposeObject3D(this.scene);
    this.material.dispose();
  }

  private cancelPath(): void {
    this.path = [];
    this.stuckSeconds = 0;
  }

  private handleTap(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, new Vector3());
    if (!hit) return;
    const { minX, maxX, minZ, maxZ } = this.bounds;
    if (hit.x < minX || hit.x > maxX || hit.z < minZ || hit.z > maxZ) return;

    const path = findPath(
      this.position,
      { x: hit.x, z: hit.z },
      this.obstacles,
      PLAYER_RADIUS,
      this.bounds,
    );
    const destination = path?.at(-1);
    if (!path || !destination) return;
    this.path = path;
    this.stuckSeconds = 0;
    this.marker.position.set(destination.x, 0.012, destination.z);
    this.marker.visible = true;
    this.markerSeconds = MARKER_SECONDS;
  }
}
