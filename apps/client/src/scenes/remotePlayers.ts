// Người chơi khác trong phòng: nội suy vị trí cho mượt, nhãn tên + chức danh, bong bóng biểu cảm
// và câu nhanh. Chỉ vẽ chi tiết vài người gần nhất; xa hơn vẽ khối đơn giản bằng một InstancedMesh
// (1 draw call cho tất cả) để máy yếu vẫn chạy.
import {
  poseAt,
  titleName,
  type PlayerProfile,
  type PlayerSnapshot,
  type Pose,
  type StateTuple,
} from '@dilam/shared';
import {
  CylinderGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Scene,
} from 'three';
import { AvatarModel } from '../avatar/avatarModel';
import { Companions } from '../avatar/companions';
import { gearFromEquipped } from '../avatar/gear';
import { dampAngle } from '../engine/mathUtils';
import type { BubbleLayer } from '../ui/bubbles';

/** Vẽ chậm hơn thời gian thật chừng này để luôn có hai mốc mà nội suy (server phát 5 lần/giây). */
const INTERP_DELAY_MS = 250;
const SPEECH_SECONDS = 4;
const MAX_PROXIES = 128;
const BUBBLE_HEIGHT = 1.45;
const OUTFIT_TINT: Readonly<Record<string, number>> = {
  shirt: 0xe8e4dc,
  suit: 0x2f3b5c,
  hoodie: 0x7fa7d8,
  sweater: 0xd98b6b,
};

interface Sample {
  t: number;
  x: number;
  z: number;
  facing: number;
  pose: Pose;
}

interface Remote {
  profile: PlayerProfile;
  samples: Sample[];
  x: number;
  z: number;
  facing: number;
  pose: Pose;
  avatar: AvatarModel | null;
  companions: Companions | null;
  speech: { text: string; seconds: number } | null;
}

export interface RemoteListEntry {
  sid: number;
  code: string;
  name: string;
  title: string;
  hidden: boolean;
}

export class RemotePlayers {
  private readonly players = new Map<number, Remote>();
  private readonly proxies: InstancedMesh;
  private readonly proxyMaterial = new MeshLambertMaterial();
  private readonly tmpMatrix = new Matrix4();
  private readonly tmpPos = new Vector3();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpQuat = new Quaternion();
  private readonly tmpColor = new Color();
  private detailed = 12;
  private shadows = false;
  private hiddenCodes: ReadonlySet<string> = new Set();

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
    private readonly bubbles: BubbleLayer,
    private readonly now: () => number = () => performance.now(),
  ) {
    const geometry = new CylinderGeometry(0.2, 0.24, 1.1, 8);
    geometry.translate(0, 0.55, 0);
    this.proxies = new InstancedMesh(geometry, this.proxyMaterial, MAX_PROXIES);
    this.proxies.count = 0;
    this.proxies.frustumCulled = false;
    scene.add(this.proxies);
  }

  setQuality(detailedAvatars: number, shadows: boolean): void {
    this.detailed = detailedAvatars;
    this.shadows = shadows;
    for (const p of this.players.values()) p.avatar?.setShadows(shadows);
  }

  /** Mã nhân viên bị chặn/ẩn: không vẽ, không hiện bong bóng. */
  setHidden(codes: ReadonlySet<string>): void {
    this.hiddenCodes = codes;
  }

  clear(): void {
    for (const sid of [...this.players.keys()]) this.remove(sid);
  }

  add(snapshot: PlayerSnapshot): void {
    this.remove(snapshot.sid);
    const { x, z, facing, pose, ...profile } = snapshot;
    const t = this.now();
    this.players.set(snapshot.sid, {
      profile,
      samples: [{ t, x, z, facing, pose }],
      x,
      z,
      facing,
      pose,
      avatar: null,
      companions: null,
      speech: null,
    });
    this.bubbles.ensure(bubbleId(snapshot.sid), profile.name);
  }

  updateProfile(profile: PlayerProfile): void {
    const player = this.players.get(profile.sid);
    if (!player) return;
    const looksChanged =
      JSON.stringify([player.profile.appearance, player.profile.equipped]) !==
      JSON.stringify([profile.appearance, profile.equipped]);
    player.profile = profile;
    if (looksChanged) this.dropModel(player);
    this.bubbles.remove(bubbleId(profile.sid));
    this.bubbles.ensure(bubbleId(profile.sid), profile.name);
  }

  remove(sid: number): void {
    const player = this.players.get(sid);
    if (!player) return;
    this.dropModel(player);
    this.players.delete(sid);
    this.bubbles.remove(bubbleId(sid));
  }

  applyStates(tuples: readonly StateTuple[]): void {
    const t = this.now();
    for (const [sid, x, z, facing, poseIdx] of tuples) {
      const player = this.players.get(sid);
      if (!player) continue;
      player.samples.push({ t, x, z, facing, pose: poseAt(poseIdx) });
      if (player.samples.length > 8) player.samples.splice(0, player.samples.length - 8);
    }
  }

  say(sid: number, text: string): void {
    const player = this.players.get(sid);
    if (player) player.speech = { text, seconds: SPEECH_SECONDS };
  }

  list(): RemoteListEntry[] {
    return [...this.players.values()].map((p) => ({
      sid: p.profile.sid,
      code: p.profile.code,
      name: p.profile.name,
      title: titleName(p.profile.title, p.profile.branch),
      hidden: this.hiddenCodes.has(p.profile.code),
    }));
  }

  get count(): number {
    return this.players.size;
  }

  /**
   * Cập nhật mỗi khung hình: nội suy vị trí, chọn ai vẽ chi tiết, cập nhật bong bóng.
   * `project` đổi điểm 3D thành toạ độ màn hình (null nếu ngoài khung nhìn).
   */
  update(
    dt: number,
    viewer: { x: number; z: number },
    project: (x: number, y: number, z: number) => { x: number; y: number } | null,
  ): void {
    const renderAt = this.now() - INTERP_DELAY_MS;
    const visible: Remote[] = [];
    for (const player of this.players.values()) {
      this.interpolate(player, renderAt, dt);
      if (player.speech) {
        player.speech.seconds -= dt;
        if (player.speech.seconds <= 0) player.speech = null;
      }
      if (this.hiddenCodes.has(player.profile.code)) {
        this.hide(player);
        continue;
      }
      visible.push(player);
    }

    visible.sort(
      (a, b) =>
        Math.hypot(a.x - viewer.x, a.z - viewer.z) - Math.hypot(b.x - viewer.x, b.z - viewer.z),
    );
    let proxyCount = 0;
    visible.forEach((player, index) => {
      if (index < this.detailed) {
        if (!player.avatar) {
          player.avatar = new AvatarModel(
            player.profile.appearance,
            this.material,
            gearFromEquipped(player.profile.equipped),
          );
          player.avatar.setShadows(this.shadows);
          this.scene.add(player.avatar.root);
          const companions = new Companions(player.profile.equipped, this.material);
          if (!companions.isEmpty) {
            this.scene.add(companions.group);
            player.companions = companions;
          } else companions.dispose();
        }
        player.companions?.update(dt, player);
        player.avatar.root.visible = true;
        player.avatar.root.position.set(player.x, 0, player.z);
        player.avatar.root.rotation.y = player.facing;
        player.avatar.setPose(player.pose);
        player.avatar.update(dt);
      } else {
        // Xa: bỏ mô hình chi tiết, vẽ khối đơn giản cùng màu áo.
        this.dropModel(player);
        if (proxyCount < MAX_PROXIES) {
          this.tmpPos.set(player.x, 0, player.z);
          this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
          this.proxies.setMatrixAt(proxyCount, this.tmpMatrix);
          this.tmpColor.setHex(OUTFIT_TINT[player.profile.appearance.outfit] ?? 0xcccccc);
          this.proxies.setColorAt(proxyCount, this.tmpColor);
          proxyCount += 1;
        }
      }
      // Nhãn tên chỉ cho người gần (vẽ chi tiết) hoặc đang nói: đỡ cập nhật DOM mỗi khung hình.
      const showLabel = index < this.detailed || player.speech !== null;
      const screen = showLabel ? project(player.x, BUBBLE_HEIGHT, player.z) : null;
      const label = player.speech?.text ?? titleName(player.profile.title, player.profile.branch);
      this.bubbles.update(bubbleId(player.profile.sid), screen, label);
    });
    this.proxies.count = proxyCount;
    this.proxies.instanceMatrix.needsUpdate = true;
    if (this.proxies.instanceColor) this.proxies.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.clear();
    this.proxies.removeFromParent();
    this.proxies.geometry.dispose();
    this.proxies.dispose();
    this.proxyMaterial.dispose();
  }

  private dropModel(player: Remote): void {
    player.avatar?.dispose();
    player.avatar = null;
    player.companions?.dispose();
    player.companions = null;
  }

  private hide(player: Remote): void {
    this.dropModel(player);
    this.bubbles.update(bubbleId(player.profile.sid), null, '');
  }

  private interpolate(player: Remote, renderAt: number, dt: number): void {
    const samples = player.samples;
    // Bỏ các mốc quá cũ (giữ lại một mốc trước thời điểm vẽ).
    while (samples.length > 2 && (samples[1]?.t ?? Infinity) <= renderAt) samples.shift();
    const a = samples[0];
    const b = samples[1];
    if (!a) return;
    if (!b || renderAt <= a.t) {
      player.x = a.x;
      player.z = a.z;
      player.facing = dampAngle(player.facing, a.facing, 12, dt);
      player.pose = a.pose;
      return;
    }
    const k = Math.min(1, Math.max(0, (renderAt - a.t) / Math.max(1, b.t - a.t)));
    player.x = a.x + (b.x - a.x) * k;
    player.z = a.z + (b.z - a.z) * k;
    player.facing = dampAngle(player.facing, b.facing, 12, dt);
    player.pose = k < 0.5 ? a.pose : b.pose;
  }
}

function bubbleId(sid: number): string {
  return `p-${String(sid)}`;
}
