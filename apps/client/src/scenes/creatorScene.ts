// Màn "Làm thẻ nhân viên": nhân vật đứng trên bục tròn, kéo để xoay, thử các tư thế.
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  type MeshLambertMaterial,
} from 'three';
import type { Appearance } from '../avatar/appearance';
import { AvatarModel } from '../avatar/avatarModel';
import { isSeated, type PoseName } from '../avatar/pose';
import { disposeObject3D } from '../engine/disposal';
import { damp } from '../engine/mathUtils';
import { createVertexColorMaterial, mergePieces, piece } from '../engine/meshBuilder';
import type { QualityPreset } from '../engine/quality';
import type { SceneController } from '../engine/types';
import { PointerControls } from '../input/pointerControls';
import { createLighting, type Lighting } from '../world/lighting';
import { createSoftDotTexture } from '../world/textures';
import { createBlobShadow } from './blobShadow';

/** Phần màn hình bị bảng chọn che (pixel): nhân vật được dời vào phần còn lại. */
export interface ViewInset {
  right: number;
  bottom: number;
}

const BACKGROUND = 0xfdf3e7;
const ROTATE_PER_PIXEL = 0.012;
/** Tự xoay (rad/giây) và thời gian chờ sau lần kéo tay cuối trước khi xoay lại. */
const AUTO_ROTATE_SPEED = 0.45;
const AUTO_ROTATE_PAUSE_S = 2.5;

export class CreatorScene implements SceneController {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 50);
  private readonly material: MeshLambertMaterial = createVertexColorMaterial();
  private readonly lighting: Lighting;
  private readonly turntable = new Group();
  private readonly seat: Mesh;
  private readonly desk: Mesh;
  private readonly blob: Mesh;
  private readonly controls: PointerControls;
  private avatar: AvatarModel;
  private shadows = false;
  private yaw = -0.35;
  private targetYaw = -0.35;
  private inset: ViewInset = { right: 0, bottom: 0 };
  private size = { width: 1, height: 1 };
  private autoRotate = false;
  private sinceDrag = AUTO_ROTATE_PAUSE_S;

  constructor(canvas: HTMLElement, appearance: Appearance) {
    this.scene.background = new Color(BACKGROUND);
    this.lighting = createLighting(this.scene, 2);
    this.camera.position.set(0, 1.05, 4.6);
    this.camera.lookAt(0, 0.58, 0);

    const pedestal = new Mesh(
      mergePieces([
        piece(new CylinderGeometry(0.75, 0.8, 0.08, 40), 0xf7c9a8, { position: [0, -0.04, 0] }),
        piece(new CylinderGeometry(0.62, 0.62, 0.012, 40), 0xfbe0c8, { position: [0, 0.006, 0] }),
      ]),
      this.material,
    );
    pedestal.receiveShadow = true;
    this.scene.add(pedestal);

    // Ghế đẩu và bàn phím chỉ hiện khi thử tư thế ngồi / gõ phím.
    this.seat = new Mesh(
      mergePieces([
        piece(new CylinderGeometry(0.17, 0.17, 0.05, 20), 0x7c9cbf, {
          position: [0, 0.255, -0.03],
        }),
        piece(new CylinderGeometry(0.03, 0.03, 0.23, 8), 0x9aa3ad, { position: [0, 0.12, -0.03] }),
        piece(new CylinderGeometry(0.14, 0.14, 0.02, 16), 0x9aa3ad, { position: [0, 0.01, -0.03] }),
      ]),
      this.material,
    );
    this.desk = new Mesh(
      mergePieces([
        piece(new BoxGeometry(0.8, 0.04, 0.34), 0xd9a46c, { position: [0, 0.43, 0.45] }),
        piece(new BoxGeometry(0.04, 0.41, 0.3), 0xf2efe9, { position: [-0.36, 0.205, 0.45] }),
        piece(new BoxGeometry(0.04, 0.41, 0.3), 0xf2efe9, { position: [0.36, 0.205, 0.45] }),
        piece(new BoxGeometry(0.34, 0.02, 0.11), 0x4a4f5c, { position: [0, 0.46, 0.36] }),
      ]),
      this.material,
    );
    this.turntable.add(this.seat, this.desk);

    this.blob = createBlobShadow(createSoftDotTexture(), 0.34);
    this.turntable.add(this.blob);

    this.avatar = new AvatarModel(appearance, this.material);
    this.turntable.add(this.avatar.root);
    this.scene.add(this.turntable);
    this.updateProps();

    this.controls = new PointerControls(canvas, {
      onDrag: (dx) => {
        this.targetYaw += dx * ROTATE_PER_PIXEL;
        this.sinceDrag = 0;
      },
    });
  }

  setAppearance(appearance: Appearance): void {
    const pose = this.avatar.pose;
    this.avatar.dispose();
    this.avatar = new AvatarModel(appearance, this.material);
    this.avatar.setPose(pose);
    this.avatar.setShadows(this.shadows);
    this.turntable.add(this.avatar.root);
  }

  /** Tự xoay chậm để xem nhân vật mọi phía (tắt khi người dùng chọn giảm chuyển động). */
  setAutoRotate(on: boolean): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.autoRotate = on && !reduced;
  }

  setPose(pose: PoseName): void {
    this.avatar.setPose(pose);
    this.updateProps();
  }

  setViewInset(inset: ViewInset): void {
    this.inset = inset;
    this.updateView();
  }

  fixedUpdate(dt: number): void {
    this.avatar.update(dt);
  }

  frameUpdate(frameSeconds: number): void {
    this.sinceDrag += frameSeconds;
    if (this.autoRotate && this.sinceDrag >= AUTO_ROTATE_PAUSE_S) {
      this.targetYaw += AUTO_ROTATE_SPEED * frameSeconds;
    }
    this.yaw = damp(this.yaw, this.targetYaw, 10, frameSeconds);
    this.turntable.rotation.y = this.yaw;
  }

  applyQuality(preset: QualityPreset): void {
    this.shadows = preset.shadows;
    this.lighting.applyQuality(preset);
    this.avatar.setShadows(preset.shadows);
    this.seat.castShadow = preset.shadows;
    this.desk.castShadow = preset.shadows;
    this.blob.visible = !preset.shadows;
  }

  resize(width: number, height: number): void {
    this.size = { width, height };
    this.updateView();
  }

  dispose(): void {
    this.controls.dispose();
    this.avatar.dispose();
    disposeObject3D(this.scene);
    this.material.dispose();
  }

  private updateProps(): void {
    const seated = isSeated(this.avatar.pose);
    this.seat.visible = seated;
    this.desk.visible = this.avatar.pose === 'type';
  }

  /** Dời tâm hình sang phần màn hình không bị bảng chọn che. */
  private updateView(): void {
    const { width, height } = this.size;
    const visibleWidth = Math.max(1, width - this.inset.right);
    const visibleHeight = Math.max(1, height - this.inset.bottom);
    this.camera.aspect = width / height;
    // Màn hẹp (điện thoại dọc): lùi camera để nhân vật vừa phần nhìn thấy.
    const fit = Math.max(1, (height / visibleHeight) * 0.85, 0.75 / (visibleWidth / visibleHeight));
    this.camera.position.set(0, 1.05, 4.6 * fit);
    this.camera.lookAt(0, 0.58, 0);
    this.camera.setViewOffset(
      width,
      height,
      this.inset.right / 2,
      this.inset.bottom / 2,
      width,
      height,
    );
    this.camera.updateProjectionMatrix();
  }
}
