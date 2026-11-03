import { CEO_MEETING_SEAT_PREFIX, type CompanyPerk } from '@dilam/shared';
// Tầng văn phòng Phase 2A: đi lại, chạm để dùng đồ vật, ngồi làm việc, đồng nghiệp NPC.
import {
  Box3,
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
import type { SoundName } from '../audio/audioEngine';
import type { Appearance } from '../avatar/appearance';
import { AvatarModel } from '../avatar/avatarModel';
import {
  applyDrag,
  applyZoom,
  CAMERA_LIMITS,
  confineToRoom,
  orbitOffset,
  SEATED_CAMERA_LIMITS,
  type OrbitState,
} from '../engine/cameraMath';
import { disposeObject3D } from '../engine/disposal';
import { damp, dampAngle, lerp } from '../engine/mathUtils';
import { createVertexColorMaterial } from '../engine/meshBuilder';
import type { QualityPreset } from '../engine/quality';
import type { SceneController } from '../engine/types';
import { VirtualJoystick } from '../input/joystick';
import { KeyboardInput } from '../input/keyboard';
import { PointerControls } from '../input/pointerControls';
import { GIFT_RADIUS } from '../activities/coffee/coffee';
import { NpcAgent, type NpcSpec } from '../npc/npcAgent';
import { seededRng } from '../npc/schedule';
import { STRINGS } from '../strings';
import { BubbleLayer } from '../ui/bubbles';
import { RemotePlayers } from './remotePlayers';
import { RoomPlants } from './roomPlants';
import { buildLanterns } from './lanterns';
import { CompanySign, type SignInfo } from './companySign';
import { CompanyPerks } from './companyPerks';

/** Mã vật dụng do công ty mua (thêm / bỏ khi đổi đồ). */
const PERK_ITEM_PREFIX = 'perk-';
import { WallClock } from './wallClock';
import { ZoneLabels } from './zoneLabels';
import type { BufferGeometry, Group } from 'three';
import type { DayMood } from '@dilam/shared';
import { Companions } from '../avatar/companions';
import { gearFromEquipped } from '../avatar/gear';
import type { PoseName } from '../avatar/pose';
import type { InteractionHint } from '../ui/officeHud';
import { moveWithCollisions, type Aabb, type Vec2 } from '../world/collision';
import { DustMotes } from '../world/dust';
import { ARRIVE_RADIUS, nearestInteractable, SeatRegistry } from '../world/interaction';
import { createLighting, type Lighting } from '../world/lighting';
import { combineInputs, headingOf, inputToWorld, stepToward } from '../world/movement';
import { buildOffice, type BuiltOffice } from '../world/office/buildOffice';
import {
  insideCeoRoom,
  officeInteractables,
  officeObstacles,
  type Interactable,
  type OfficeLayout,
  seatLift,
  seatLiftNear,
} from '../world/office/layout';
import { PERIOD_LIGHTING, type DayPeriod } from '../world/office/period';
import { findPath } from '../world/pathfinding';
import { createSoftDotTexture } from '../world/textures';
import { createBlobShadow } from './blobShadow';

export const WALK_SPEED = 2.6;
export const PLAYER_RADIUS = 0.28;
const TURN_SPEED = 14;
const CAMERA_FOLLOW = 9;
const CAMERA_BLEND = 5;
/** Tốc độ camera xoay ra sau lưng ở chế độ "Theo nhân vật". */
const FOLLOW_TURN = 2.2;
const LOOK_HEIGHT = 0.75;
const DEFAULT_ORBIT: OrbitState = { yaw: 0.35, pitch: 0.75, distance: 7 };
/** Góc camera lúc mới vào phòng; yaw tính lệch so với hướng nhân vật lúc xuất hiện. */
const ENTRY_ORBIT: OrbitState = { yaw: 0.42, pitch: 0.42, distance: 5.6 };
/** Giới hạn camera khi nhìn từ trên. */
const TOP_CAMERA_LIMITS = {
  ...CAMERA_LIMITS,
  minPitch: 0.6,
  maxPitch: 1.5,
  minDistance: 8,
  maxDistance: 26,
};
const MARKER_SECONDS = 1.2;
const BUBBLE_HEIGHT = 1.42;
const SELF_BUBBLE = 'self';
const BUBBLE_MAX_DISTANCE = 16;
const BUBBLE_TOP_MARGIN = 120;
const PLAYER_ID = 'player';

export type OfficeEvent =
  | { type: 'interact'; item: Interactable }
  | { type: 'gift'; npcId: string; name: string }
  | { type: 'seatTaken'; name: string }
  | { type: 'ceoSeatDenied' }
  /** Bấm vào máy tính ở chỗ đang ngồi. */
  | { type: 'screen'; item: Interactable };

export interface OfficeSceneOptions {
  canvas: HTMLElement;
  /** Lớp HUD để gắn joystick ảo và bong bóng NPC. */
  hudLayer: HTMLElement;
  appearance: Appearance;
  layout: OfficeLayout;
  period: DayPeriod;
  npcs: readonly NpcSpec[];
  /** Tên người chơi (bong bóng lời nói trên đầu chính mình). */
  playerName?: string;
  onHint(hint: InteractionHint | null): void;
  onEvent(event: OfficeEvent): void;
  onSound(name: SoundName): void;
  /** Đang cầm ly cà phê có thể tặng không. */
  canGiftCoffee(): boolean;
  /** Ngồi xuống (vật đang ngồi) hoặc đứng dậy (null). */
  onSeatChange(item: Interactable | null): void;
}

export class OfficeScene implements SceneController {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 80);
  private readonly material: MeshLambertMaterial = createVertexColorMaterial();
  private readonly office: BuiltOffice;
  private avatar: AvatarModel;
  private companions: Companions | null = null;
  private shadows = false;
  private readonly lighting: Lighting;
  private readonly dust: DustMotes;
  private readonly blob: Mesh;
  private readonly marker: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly keyboard = new KeyboardInput();
  private readonly joystick: VirtualJoystick;
  private readonly pointer: PointerControls;
  private readonly bubbles: BubbleLayer;
  private readonly raycaster = new Raycaster();
  private readonly floorPlane = new Plane(new Vector3(0, 1, 0), 0);
  /** Vật cản của người chơi (đổi khi có / mất thẻ CEO; sửa tại chỗ để mọi nơi giữ tham chiếu). */
  private readonly obstacles: Aabb[];
  private ceoAccess = false;
  private ceoRevokePending = false;
  /** Là chủ công ty của phòng này (mới được ngồi ghế CEO). */
  private ceoOwner = false;

  setCeoOwner(owner: boolean): void {
    this.ceoOwner = owner;
  }

  /** Đứng dậy khỏi ghế đang ngồi (ví dụ họp đủ giờ). */
  leaveSeat(): void {
    if (this.seated) this.standUp();
  }
  private readonly layout: OfficeLayout;
  private readonly bounds: Aabb;
  private readonly items: Interactable[];
  private readonly pickBoxes: { item: Interactable; box: Box3 }[];
  private readonly seats = new SeatRegistry();
  private npcs: NpcAgent[];
  private npcWorld!: ConstructorParameters<typeof NpcAgent>[2];
  private npcKey = '';
  /** Người chơi khác trong phòng (Phase 4B). */
  readonly remotes: RemotePlayers;
  /** Hoa người chơi đã tưới (Phase 5A). */
  readonly plants: RoomPlants;
  private readonly canvas: HTMLElement;
  private readonly options: OfficeSceneOptions;

  private position: Vec2;
  private previous: Vec2;
  private facing: number;
  private path: Vec2[] = [];
  private pending: Interactable | null = null;
  /** Đi tới chỗ một vật để làm việc khác (không dùng vật), tới nơi thì gọi `done`. */
  private pendingGo: { item: Interactable; done: () => void } | null = null;
  private seated: Interactable | null = null;
  private stuckSeconds = 0;
  private markerSeconds = 0;
  private typingTimer = 0;
  /** Đang mở bảng hoạt động: không di chuyển, không chạm vật. */
  private inputLocked = false;
  /** Đang chơi "gõ phím tập trung": tiếng gõ do người chơi bấm, không tự sinh. */
  private manualTyping = false;
  private orbit: OrbitState = { ...DEFAULT_ORBIT };
  private orbitGoal: OrbitState = { ...this.orbit };
  private freeOrbit: OrbitState = { ...this.orbit };
  private readonly lookTarget = new Vector3();
  private readonly tmp = new Vector3();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyE' || event.repeat || this.inputLocked) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
    this.triggerHint();
  };

  constructor(options: OfficeSceneOptions) {
    this.options = options;
    this.canvas = options.canvas;
    const { layout } = options;
    this.layout = layout;
    this.bounds = layout.bounds;
    this.obstacles = officeObstacles(layout);
    this.items = officeInteractables(layout);
    this.position = { ...layout.spawn };
    this.previous = { ...layout.spawn };
    this.facing = layout.spawnFacing;
    // Mới vào: camera đứng phía trong phòng nhìn lại cửa vào (thấy nhân vật, cửa, máy chấm công),
    // thấp dưới trần để không bị ép sát vào tường sau lưng.
    this.orbit = { ...ENTRY_ORBIT, yaw: layout.spawnFacing + ENTRY_ORBIT.yaw };
    this.orbitGoal = { ...this.orbit };
    this.freeOrbit = { ...this.orbit };

    this.scene.fog = new Fog(0x0e0e12, 24, 55);
    this.lighting = createLighting(this.scene, 9, { x: 4, y: 9, z: -5 });
    this.office = buildOffice(layout, this.material, options.period);
    this.scene.add(this.office.group);
    this.setPeriod(options.period);

    this.pickBoxes = this.items.map((item) => ({
      item,
      box: new Box3(new Vector3(...item.pick.min), new Vector3(...item.pick.max)),
    }));

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
    this.lastLook = { appearance: options.appearance, equipped: [] };
    this.scene.add(this.avatar.root);

    // Đồng nghiệp NPC.
    const itemMap = new Map(this.items.map((item) => [item.id, item]));
    const coffee = itemMap.get('coffee');
    const world = {
      // NPC không có thẻ CEO: luôn thấy cửa phòng CEO đóng.
      obstacles: officeObstacles(layout),
      bounds: this.bounds,
      interactables: itemMap,
      seats: this.seats,
      // NPC không ngồi sofa họp trong phòng sếp.
      meetingSeatIds: this.items
        .filter((item) => item.kind === 'meeting' && !item.id.startsWith(CEO_MEETING_SEAT_PREFIX))
        .map((item) => item.id),
      coffeeSpots: coffee
        ? [0, 1, 2].map((i) => ({
            spot: { x: coffee.approach.x - 0.1, z: coffee.approach.z + 0.7 + i * 0.7 },
            facing: coffee.facing,
          }))
        : [],
      strollSpots: layout.strollSpots,
    };
    this.bubbles = new BubbleLayer(options.hudLayer);
    this.npcWorld = world;
    this.npcKey = options.npcs.map((spec) => spec.id).join('|');
    this.npcs = options.npcs.map((spec, i) => {
      const npc = new NpcAgent(spec, this.material, world, seededRng(1000 + i), i);
      this.scene.add(npc.avatar.root);
      this.bubbles.ensure(spec.id, spec.name);
      return npc;
    });

    this.remotes = new RemotePlayers(this.scene, this.material, this.bubbles);
    // Người chơi khác đang ngồi: nâng lên theo độ cao chỗ ngồi gần nhất (sofa cao hơn ghế).
    this.remotes.setSeatLift((x, z) => seatLiftNear(this.items, x, z));
    this.bubbles.ensure(SELF_BUBBLE, options.playerName ?? '');
    this.plants = new RoomPlants(this.material, layout.plants);
    // Đồng hồ lớn trên tường bắc, bên phải dãy cửa sổ (logo công ty ở tường sảnh).
    const lastWindow = layout.windows.spans.at(-1)?.maxX ?? 4.5;
    const rightShelf = layout.shelves.reduce((m, b) => Math.max(m, b.maxX), lastWindow);
    this.clock.group.position.set(rightShelf + 0.9, 2.05, layout.bounds.minZ + 0.04);
    this.clock.group.rotation.y = 0;
    this.scene.add(this.clock.group);
    this.zoneLabels = new ZoneLabels(layout);
    this.setCompanySign(null);
    this.scene.add(this.zoneLabels.group);
    this.scene.add(this.plants.group);

    this.lookTarget.set(this.position.x, LOOK_HEIGHT, this.position.z);
    this.joystick = new VirtualJoystick(options.hudLayer, STRINGS.office.joystick);
    this.pointer = new PointerControls(options.canvas, {
      onTap: (x, y) => {
        this.handleTap(x, y);
      },
      // Kéo/zoom dùng được cả khi đang ngồi (để ngắm toàn tầng), với giới hạn riêng.
      onDrag: (dx, dy) => {
        this.orbitGoal = applyDrag(this.orbitGoal, dx, dy, this.cameraLimits());
        this.orbit = { ...this.orbit, yaw: this.orbitGoal.yaw, pitch: this.orbitGoal.pitch };
      },
      onZoom: (factor) => {
        this.orbitGoal = applyZoom(this.orbitGoal, factor, this.cameraLimits());
        this.orbit = { ...this.orbit, distance: this.orbitGoal.distance };
      },
    });
    window.addEventListener('keydown', this.onKeyDown);
  }

  // ---------- Dùng từ bên ngoài (HUD, debug) ----------

  setPeriod(period: DayPeriod): void {
    const lighting = PERIOD_LIGHTING[period];
    this.office.setPeriod(period);
    this.lighting.applyPeriod(lighting);
    this.scene.background = new Color(lighting.background);
    this.scene.fog?.color.setHex(lighting.background);
  }

  private moodGroup: Group | null = null;
  private sign: CompanySign | null = null;
  private readonly clock = new WallClock();
  private readonly zoneLabels: ZoneLabels;
  /** 'top': nhìn toàn tầng từ trên cao, tâm là giữa văn phòng. */
  private viewMode: 'follow' | 'top' = 'follow';
  private autoRotate = false;

  // ---------- Góc nhìn (nút "Góc nhìn" trên HUD) ----------

  setXray(on: boolean): void {
    this.office.setXray(on);
  }

  setAutoRotate(on: boolean): void {
    this.autoRotate = on;
  }

  /** Camera theo nhân vật: đi tới đâu, rẽ trái/phải thì camera tự xoay ra sau lưng. */
  setFollowCamera(on: boolean): void {
    this.followCamera = on;
  }

  private followCamera = false;

  setZoneLabels(on: boolean): void {
    this.labelsOn = on;
  }

  private labelsOn = true;

  /** Nhìn từ trên: cả tầng 20 × 13 m trong khung hình, lối vào ở dưới. */
  setTopView(on: boolean): void {
    this.viewMode = on ? 'top' : 'follow';
    this.orbitGoal = on ? { yaw: 0, pitch: 1.42, distance: 19 } : { ...DEFAULT_ORBIT };
  }

  isTopView(): boolean {
    return this.viewMode === 'top';
  }

  /** Đặt lại góc nhìn: theo nhân vật, tắt tự xoay. */
  resetView(): void {
    this.viewMode = 'follow';
    this.autoRotate = false;
    this.orbitGoal = this.seated
      ? { yaw: this.seated.facing + Math.PI - 0.55, pitch: 0.82, distance: 2.3 }
      : { ...DEFAULT_ORBIT };
  }

  /** Biển hiệu công ty (phòng riêng); null = văn phòng chung. */
  /** Có thẻ vào phòng CEO (chủ công ty, trong phòng công ty của mình) hay không. */
  setCeoAccess(on: boolean): void {
    // Mất thẻ khi đang ở trong phòng (vừa họp xong): cửa còn mở tới khi bước ra mới đóng.
    this.ceoRevokePending = !on && this.ceoAccess && insideCeoRoom(this.layout, this.position);
    if (this.ceoRevokePending || on === this.ceoAccess) return;
    this.ceoAccess = on;
    this.rebuildObstacles();
    this.office.setCeoDoorOpen(on);
  }

  /** Gọi mỗi khung hình: đã ra khỏi phòng sếp thì đóng cửa. */
  private checkCeoRevoke(): void {
    if (!this.ceoRevokePending || insideCeoRoom(this.layout, this.position)) return;
    this.ceoRevokePending = false;
    this.ceoAccess = false;
    this.rebuildObstacles();
    this.office.setCeoDoorOpen(false);
  }

  private rebuildObstacles(): void {
    this.obstacles.splice(
      0,
      this.obstacles.length,
      ...officeObstacles(this.layout, { ceo: this.ceoAccess }),
      ...(this.perks?.obstacles ?? []),
    );
  }

  private perks: CompanyPerks | null = null;
  private perkKey = '';

  /** Đồ công ty đã mua (phòng công ty): ghế massage, máy chơi game, decor bàn. */
  setCompanyPerks(perks: readonly CompanyPerk[]): void {
    const key = [...perks].sort().join(',');
    if (key === this.perkKey) return;
    this.perkKey = key;
    if (this.seated?.id.startsWith(PERK_ITEM_PREFIX)) this.standUp();
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      if (this.items[i]?.id.startsWith(PERK_ITEM_PREFIX)) this.items.splice(i, 1);
    }
    this.perks?.dispose();
    this.perks = null;
    if (perks.length > 0) {
      this.perks = new CompanyPerks(this.layout, this.material, perks);
      this.scene.add(this.perks.group);
      this.items.push(...this.perks.items);
    }
    this.rebuildObstacles();
  }

  private uniform: number | null = null;
  private lastLook: { appearance: Appearance; equipped: readonly string[] } | null = null;

  /** Đồng phục công ty (màu hex) hoặc null: dựng lại nhân vật nếu đổi. */
  setUniform(color: number | null): void {
    if (color === this.uniform) return;
    this.uniform = color;
    if (this.lastLook) this.setGear(this.lastLook.appearance, this.lastLook.equipped);
  }

  hasCeoAccess(): boolean {
    return this.ceoAccess;
  }

  /** Logo trên tường sảnh: phòng công ty hiện tên công ty, văn phòng chung hiện Công Sở. */
  setCompanySign(info: SignInfo | null): void {
    this.sign?.dispose();
    this.sign = new CompanySign(
      this.options.layout,
      info ?? {
        name: STRINGS.sign.defaultName,
        subtitle: STRINGS.sign.defaultTagline,
        color: 0x9a9aa3,
        glyph: '',
      },
    );
    this.scene.add(this.sign.group);
  }

  /**
   * Không khí trong ngày (lịch): Tết treo đèn lồng đỏ, ngày lương ánh vàng ấm,
   * thứ Hai hơi trầm, thứ Sáu sáng sủa.
   */
  setMood(mood: DayMood): void {
    const tint: Record<DayMood, number> = {
      tet: 1.08,
      payday: 1.1,
      monday: 0.88,
      friday: 1.06,
      weekend: 1,
      normal: 1,
    };
    this.lighting.hemi.intensity *= tint[mood];
    if (mood === 'payday') this.lighting.hemi.color.offsetHSL(0.02, 0.1, 0);
    if (this.moodGroup) {
      this.moodGroup.removeFromParent();
      // Chỉ giải phóng hình học; vật liệu dùng chung với cả văn phòng.
      this.moodGroup.traverse((object) => {
        if (object instanceof Mesh) (object.geometry as BufferGeometry).dispose();
      });
      this.moodGroup = null;
    }
    if (mood === 'tet') {
      const group = buildLanterns(this.options.layout, this.material);
      this.scene.add(group);
      this.moodGroup = group;
    }
  }

  /** Nút "Chạm để dùng" / "Đứng dậy" hoặc phím E. */
  triggerHint(): void {
    if (this.inputLocked) return;
    if (this.seated) {
      this.standUp();
      return;
    }
    const target = this.giftTarget();
    if (target) {
      this.facing = headingOf({ x: target.x - this.position.x, z: target.z - this.position.z });
      this.options.onEvent({ type: 'gift', npcId: target.id, name: target.name });
      return;
    }
    const nearby = nearestInteractable(this.position, this.items);
    if (nearby) this.requestInteraction(nearby);
  }

  /** Khoá/mở điều khiển (khi mở bảng hoạt động). */
  setInputLocked(locked: boolean): void {
    this.inputLocked = locked;
    if (locked) this.cancelPath();
  }

  setManualTyping(manual: boolean): void {
    this.manualTyping = manual;
  }

  /** NPC đáp lại (bong bóng đổi câu trong vài giây). */
  npcSay(npcId: string, text: string, seconds = 4): void {
    this.npcs.find((npc) => npc.spec.id === npcId)?.say(text, seconds);
  }

  /** Đi tới vật và dùng khi tới nơi (như khi chạm vào vật đó). */
  requestInteractionById(id: string): boolean {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return false;
    if (this.seated) this.standUp();
    this.requestInteraction(item);
    return true;
  }

  /**
   * Đi tới chỗ đứng của một vật nhưng KHÔNG dùng vật; tới nơi thì quay mặt vào vật và gọi
   * `done` (ví dụ: chạy ra máy pha đổ hạt cà phê khi cả phòng hết cà phê).
   */
  goToItem(id: string, done: () => void): boolean {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item || this.inputLocked) return false;
    if (this.seated) this.standUp();
    const d = Math.hypot(item.approach.x - this.position.x, item.approach.z - this.position.z);
    if (d <= ARRIVE_RADIUS) {
      this.cancelPath();
      this.facing = item.facing;
      done();
      return true;
    }
    const path = findPath(this.position, item.approach, this.obstacles, PLAYER_RADIUS, this.bounds);
    if (!path) return false;
    this.cancelPath();
    this.path = path;
    this.pendingGo = { item, done };
    this.showMarker(item.approach);
    return true;
  }

  /** Ghế trống gần nhất thuộc loại `kind` (ví dụ ghế phòng họp), hoặc null. */
  nearestFreeSeat(kind: Interactable['kind']): string | null {
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const item of this.items) {
      if (item.kind !== kind || !item.seat) continue;
      if (this.seats.occupant(item.id) !== null && this.seated?.id !== item.id) continue;
      const d = Math.hypot(item.approach.x - this.position.x, item.approach.z - this.position.z);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best?.id ?? null;
  }

  getInteractables(): readonly Interactable[] {
    return this.items;
  }

  getPlayerPosition(): Vec2 {
    return { ...this.position };
  }

  /** Thay danh sách NPC (văn phòng chung: 3 đồng nghiệp; công ty: theo số nhân viên NPC). */
  setNpcs(specs: readonly NpcSpec[]): void {
    const key = specs.map((spec) => `${spec.id}:${spec.name}`).join('|');
    if (key === this.npcKey) return;
    this.npcKey = key;
    for (const npc of this.npcs) {
      this.scene.remove(npc.avatar.root);
      this.bubbles.remove(npc.spec.id);
      npc.dispose();
    }
    this.npcs = specs.map((spec, i) => {
      const npc = new NpcAgent(spec, this.material, this.npcWorld, seededRng(1000 + i), i);
      npc.avatar.setShadows(this.shadows);
      this.scene.add(npc.avatar.root);
      this.bubbles.ensure(spec.id, spec.name);
      return npc;
    });
  }

  /** Đổi đồ đang mặc / thú cưng (từ cửa hàng): dựng lại nhân vật. */
  setGear(appearance: Appearance, equipped: readonly string[]): void {
    const pose = this.avatar.pose;
    this.avatar.dispose();
    this.lastLook = { appearance, equipped };
    const gear = gearFromEquipped(equipped);
    if (this.uniform !== null) gear.topTint = this.uniform;
    this.avatar = new AvatarModel(appearance, this.material, gear);
    this.avatar.setPose(pose);
    this.avatar.setShadows(this.shadows);
    this.scene.add(this.avatar.root);
    this.companions?.dispose();
    const companions = new Companions(equipped, this.material);
    if (companions.isEmpty) {
      companions.dispose();
      this.companions = null;
    } else {
      this.companions = companions;
      this.scene.add(companions.group);
    }
  }

  private selfSpeech: { text: string; seconds: number } | null = null;

  /** Mình nói câu nhanh / biểu cảm: bong bóng trên đầu và (nếu có) làm động tác. */
  playerSay(text: string, emote?: string): void {
    this.selfSpeech = { text, seconds: 4 };
    if (emote) this.avatar.playEmote(emote);
  }

  /** Vị trí, hướng, tư thế hiện tại để gửi lên server. */
  getPlayerState(): { x: number; z: number; facing: number; pose: PoseName } {
    return { x: this.position.x, z: this.position.z, facing: this.facing, pose: this.avatar.pose };
  }

  /** Server báo vị trí không hợp lệ: kéo nhân vật về chỗ server chấp nhận. */
  correctPosition(x: number, z: number): void {
    if (this.seated) this.standUp();
    this.cancelPath();
    this.position = { x, z };
    this.previous = { x, z };
  }

  getOrbit(): OrbitState {
    return { ...this.orbit };
  }

  getSeatedId(): string | null {
    return this.seated?.id ?? null;
  }

  getNpcStatuses(): { id: string; name: string; status: string; position: Vec2 }[] {
    return this.npcs.map((npc) => ({
      id: npc.spec.id,
      name: npc.name,
      status: npc.status(),
      position: npc.getPosition(),
    }));
  }

  /** Toạ độ màn hình (pixel CSS) của một điểm 3D; null nếu ở sau camera. */
  projectPoint(x: number, y: number, z: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const v = this.tmp.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  }

  projectFloorPoint(x: number, z: number): { x: number; y: number } | null {
    return this.projectPoint(x, 0, z);
  }

  // ---------- SceneController ----------

  fixedUpdate(dt: number): void {
    this.previous = { ...this.position };
    const input = combineInputs(this.keyboard.vector(), this.joystick.vector());
    const hasInput = !this.inputLocked && Math.hypot(input.x, input.y) > 0.05;

    if (this.seated) {
      if (hasInput) this.standUp();
      else this.updateTyping(dt);
    }

    if (!this.seated) this.movePlayer(dt, hasInput ? input : null);
    this.checkCeoRevoke();

    this.avatar.update(dt);
    for (const npc of this.npcs) npc.update(dt);
  }

  frameUpdate(frameSeconds: number, alpha: number): void {
    const x = lerp(this.previous.x, this.position.x, alpha);
    const z = lerp(this.previous.z, this.position.z, alpha);
    this.avatar.root.position.set(x, this.seated ? seatLift(this.seated) : 0, z);
    this.avatar.root.rotation.y = this.facing;
    this.blob.position.set(x, 0.006, z);
    this.blob.visible = this.blobAllowed && !this.seated;
    this.lighting.follow(x, z);

    // Camera: ngồi thì nhìn gần qua vai về phía bàn, đứng thì theo sau như cũ.
    if (this.autoRotate)
      this.orbitGoal = { ...this.orbitGoal, yaw: this.orbitGoal.yaw + frameSeconds * 0.3 };
    // Theo nhân vật: đang đi thì camera xoay dần ra sau lưng (hướng mặt + π).
    const moving =
      Math.hypot(this.position.x - this.previous.x, this.position.z - this.previous.z) > 0.0005;
    if (this.followCamera && moving && !this.seated && this.viewMode !== 'top') {
      this.orbitGoal = {
        ...this.orbitGoal,
        yaw: dampAngle(this.orbitGoal.yaw, this.facing + Math.PI, FOLLOW_TURN, frameSeconds),
      };
    }
    this.orbit = {
      yaw: dampAngle(this.orbit.yaw, this.orbitGoal.yaw, CAMERA_BLEND, frameSeconds),
      pitch: damp(this.orbit.pitch, this.orbitGoal.pitch, CAMERA_BLEND, frameSeconds),
      distance: damp(this.orbit.distance, this.orbitGoal.distance, CAMERA_BLEND, frameSeconds),
    };
    const seat = this.seated;
    const top = this.viewMode === 'top';
    const center = this.layout.bounds;
    const focusX = top
      ? (center.minX + center.maxX) / 2
      : seat
        ? x - Math.sin(seat.facing + Math.PI) * 0.35
        : x;
    const focusZ = top
      ? (center.minZ + center.maxZ) / 2 + 0.6
      : seat
        ? z - Math.cos(seat.facing + Math.PI) * 0.35
        : z;
    const focusY = top ? 0 : seat ? 0.5 : LOOK_HEIGHT;
    this.lookTarget.set(
      damp(this.lookTarget.x, focusX, CAMERA_FOLLOW, frameSeconds),
      damp(this.lookTarget.y, focusY, CAMERA_FOLLOW, frameSeconds),
      damp(this.lookTarget.z, focusZ, CAMERA_FOLLOW, frameSeconds),
    );
    const offset = orbitOffset(this.orbit);
    // Phòng kín: camera không ra ngoài tường hay lên quá trần (trừ chế độ nhìn từ trên).
    const shrink = top
      ? 1
      : confineToRoom(this.lookTarget, offset, {
          ...this.layout.bounds,
          ceiling: this.layout.wallHeight,
        });
    this.camera.position.set(
      this.lookTarget.x + offset.x * shrink,
      this.lookTarget.y + offset.y * shrink,
      this.lookTarget.z + offset.z * shrink,
    );
    this.camera.lookAt(this.lookTarget);

    if (this.markerSeconds > 0) {
      this.markerSeconds = Math.max(0, this.markerSeconds - frameSeconds);
      const k = this.markerSeconds / MARKER_SECONDS;
      this.marker.material.opacity = Math.min(1, k * 2);
      this.marker.scale.setScalar(1 + (1 - k) * 0.4);
      this.marker.visible = this.markerSeconds > 0;
    }

    // Tên khu: đang ở khu nào thì hiện tên khu đó (treo thấp dưới trần); nhìn từ trên thì hiện hết.
    this.zoneLabels.update(x, z, this.labelsOn, top);
    // Vách đặc giữa các phòng tự mờ khi nhân vật ở trong phòng phía nam hoặc camera ở sau vách.
    const rooms = this.layout.lounge.bounds.minZ;
    this.office.setPartitionsFaded(
      !top &&
        (z > rooms - 0.2 || (this.camera.position.z > rooms - 0.5 && this.camera.position.y < 6)),
    );
    this.office.update(frameSeconds);
    this.perks?.update(frameSeconds);
    this.dust.update(frameSeconds);
    this.clock.update(Date.now());
    this.updateBubbles(frameSeconds);
    this.remotes.update(frameSeconds, { x, z, seated: this.seated !== null }, (px, py, pz) =>
      this.bubbleScreen(px, py, pz),
    );
    this.companions?.update(frameSeconds, { x, z, facing: this.facing, pose: this.avatar.pose });
    this.updateHint();
  }

  private blobAllowed = false;

  applyQuality(preset: QualityPreset): void {
    this.lighting.applyQuality(preset);
    // Đèn rọi, đèn cây thật chỉ bật ở mức vừa/cao; mức thấp còn vệt sáng giả.
    this.office.setRealLights(preset.shadows);
    this.avatar.setShadows(preset.shadows);
    this.shadows = preset.shadows;
    for (const npc of this.npcs) npc.avatar.setShadows(preset.shadows);
    this.remotes.setQuality(preset.detailedAvatars, preset.shadows);
    this.blobAllowed = !preset.shadows;
    this.dust.setCount(preset.particles);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.fov = width < height ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.keyboard.dispose();
    this.joystick.dispose();
    this.pointer.dispose();
    this.remotes.dispose();
    this.perks?.dispose();
    this.plants.dispose();
    this.sign?.dispose();
    this.clock.dispose();
    this.zoneLabels.dispose();
    this.companions?.dispose();
    this.bubbles.dispose();
    for (const npc of this.npcs) npc.dispose();
    this.avatar.dispose();
    disposeObject3D(this.scene);
    this.material.dispose();
  }

  // ---------- Bên trong ----------

  private movePlayer(dt: number, input: { x: number; y: number } | null): void {
    let delta: Vec2 = { x: 0, z: 0 };
    if (input) {
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

    if (this.path.length > 0 && distance < WALK_SPEED * dt * 0.2) {
      this.stuckSeconds += dt;
      if (this.stuckSeconds > 0.4) this.cancelPath();
    } else {
      this.stuckSeconds = 0;
    }

    // Tới chỗ dùng vật thì dùng luôn.
    const pending = this.pending;
    if (pending && this.path.length === 0) {
      this.pending = null;
      const d = Math.hypot(pending.approach.x - moved.x, pending.approach.z - moved.z);
      if (d <= ARRIVE_RADIUS + 0.05) this.use(pending);
    }
    const go = this.pendingGo;
    if (go && this.path.length === 0) {
      this.pendingGo = null;
      const d = Math.hypot(go.item.approach.x - moved.x, go.item.approach.z - moved.z);
      if (d <= ARRIVE_RADIUS + 0.05) {
        this.facing = go.item.facing;
        go.done();
      }
    }
    if (this.path.length === 0 && this.markerSeconds > 0.3) this.markerSeconds = 0.3;

    const walking = distance > 0.0005;
    if (walking) {
      this.facing = dampAngle(this.facing, headingOf({ x: movedX, z: movedZ }), TURN_SPEED, dt);
    }
    if (!this.seated) this.avatar.setPose(walking ? 'walk' : 'stand');
  }

  /** Tiếng bàn phím khi ngồi gõ: lách cách từng chuỗi, thỉnh thoảng nghỉ tay. */
  private updateTyping(dt: number): void {
    if (this.seated?.pose !== 'type' || this.manualTyping) return;
    this.typingTimer -= dt;
    if (this.typingTimer > 0) return;
    this.options.onSound('keyboard');
    this.typingTimer =
      Math.random() < 0.08 ? 0.6 + Math.random() * 0.8 : 0.07 + Math.random() * 0.15;
  }

  private requestInteraction(item: Interactable): void {
    const d = Math.hypot(item.approach.x - this.position.x, item.approach.z - this.position.z);
    if (d <= ARRIVE_RADIUS) {
      this.cancelPath();
      this.use(item);
      return;
    }
    const path = findPath(this.position, item.approach, this.obstacles, PLAYER_RADIUS, this.bounds);
    if (!path) return;
    this.path = path;
    this.pendingGo = null;
    this.pending = item;
    this.stuckSeconds = 0;
    this.showMarker(item.approach);
  }

  private use(item: Interactable): void {
    // Ghế CEO chỉ cho chủ công ty (người vào họp có thẻ vào phòng nhưng không được ngồi).
    if (item.kind === 'ceodesk' && !this.ceoOwner) {
      this.facing = item.facing;
      this.options.onEvent({ type: 'ceoSeatDenied' });
      return;
    }
    if (item.seat) {
      if (!this.seats.claim(item.id, PLAYER_ID)) {
        const who = this.seats.occupant(item.id);
        const npc = this.npcs.find((candidate) => candidate.spec.id === who);
        this.options.onEvent({ type: 'seatTaken', name: npc?.name ?? '' });
        return;
      }
      this.seated = item;
      this.position = { ...item.seat };
      this.previous = { ...item.seat };
      this.facing = item.facing;
      this.avatar.setPose(item.pose === 'type' ? 'type' : 'sit');
      this.typingTimer = 0.4;
      this.freeOrbit = { ...this.orbitGoal };
      // Góc nhìn gần qua vai phải, đủ cao để thấy màn hình phía trên đầu nhân vật.
      this.orbitGoal = { yaw: item.facing + Math.PI - 0.55, pitch: 0.82, distance: 2.3 };
      this.options.onSeatChange(item);
    } else {
      this.facing = item.facing;
      this.avatar.setPose('stand');
    }
    this.options.onEvent({ type: 'interact', item });
  }

  private standUp(): void {
    const seat = this.seated;
    if (!seat) return;
    this.seats.release(seat.id, PLAYER_ID);
    this.seated = null;
    this.position = { ...seat.approach };
    this.previous = { ...seat.approach };
    this.avatar.setPose('stand');
    this.orbitGoal = { ...this.freeOrbit, yaw: this.orbit.yaw };
    this.options.onSeatChange(null);
  }

  private cameraLimits(): typeof CAMERA_LIMITS {
    if (this.viewMode === 'top') return TOP_CAMERA_LIMITS;
    return this.seated ? SEATED_CAMERA_LIMITS : CAMERA_LIMITS;
  }

  private cancelPath(): void {
    this.path = [];
    this.pending = null;
    this.pendingGo = null;
    this.stuckSeconds = 0;
  }

  private showMarker(point: Vec2): void {
    this.marker.position.set(point.x, 0.012, point.z);
    this.marker.visible = true;
    this.markerSeconds = MARKER_SECONDS;
  }

  private handleTap(clientX: number, clientY: number): void {
    if (this.inputLocked) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;

    // Chạm thẳng vào đồ vật: đi tới và dùng.
    let picked: Interactable | null = null;
    let best = Infinity;
    for (const { item, box } of this.pickBoxes) {
      const hit = ray.intersectBox(box, this.tmp);
      if (!hit) continue;
      const d = hit.distanceTo(ray.origin);
      if (d < best) {
        best = d;
        picked = item;
      }
    }
    if (picked) {
      if (picked === this.seated) {
        // Bấm vào màn hình máy tính khi đang ngồi: bàn sếp mở quản lý công ty, bàn làm việc
        // mở bảng Văn phòng.
        this.options.onEvent({ type: 'screen', item: picked });
        return;
      }
      if (this.seated) this.standUp();
      this.requestInteraction(picked);
      return;
    }

    const hit = ray.intersectPlane(this.floorPlane, new Vector3());
    if (!hit) return;
    const { minX, maxX, minZ, maxZ } = this.bounds;
    if (hit.x < minX || hit.x > maxX || hit.z < minZ || hit.z > maxZ) return;
    if (this.seated) this.standUp();

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
    this.pending = null;
    this.stuckSeconds = 0;
    this.showMarker(destination);
  }

  /**
   * Người nhận cà phê gần nhất trong tầm tặng (khi đang cầm ly): NPC hoặc người chơi khác.
   * `id`: id NPC, hoặc "player:<mã>" cho người chơi.
   */
  private giftTarget(): { id: string; name: string; x: number; z: number } | null {
    if (this.seated || !this.options.canGiftCoffee()) return null;
    let best: { id: string; name: string; x: number; z: number } | null = null;
    let bestDistance = GIFT_RADIUS;
    for (const npc of this.npcs) {
      const p = npc.getPosition();
      const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
      if (d <= bestDistance) {
        best = { id: npc.spec.id, name: npc.name, x: p.x, z: p.z };
        bestDistance = d;
      }
    }
    const remote = this.remotes.nearest(this.position.x, this.position.z, bestDistance);
    if (remote) best = { id: `player:${remote.code}`, name: remote.name, x: remote.x, z: remote.z };
    return best;
  }

  private updateHint(): void {
    if (this.inputLocked) {
      this.options.onHint(null);
      return;
    }
    if (this.seated) {
      this.options.onHint({ kind: 'stand', label: STRINGS.interact.standUp });
      return;
    }
    const target = this.giftTarget();
    if (target) {
      this.options.onHint({ kind: 'gift', label: target.name });
      return;
    }
    const nearby = this.path.length === 0 ? nearestInteractable(this.position, this.items) : null;
    this.options.onHint(
      nearby ? { kind: 'use', label: STRINGS.interact.labels[nearby.kind] } : null,
    );
  }

  /** Điểm 3D -> toạ độ màn hình cho bong bóng; null nếu quá xa hoặc ngoài khung nhìn. */
  private bubbleScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const far =
      Math.hypot(x - this.camera.position.x, z - this.camera.position.z) > BUBBLE_MAX_DISTANCE;
    const screen = far ? null : this.projectPoint(x, y, z);
    const rect = this.frameRect ?? this.canvas.getBoundingClientRect();
    const visible =
      screen !== null &&
      screen.x > rect.left - 40 &&
      screen.x < rect.right + 40 &&
      // Không cho bong bóng chui vào vùng thanh trên cùng của HUD.
      screen.y > rect.top + BUBBLE_TOP_MARGIN &&
      screen.y < rect.bottom + 40;
    return visible ? screen : null;
  }

  /** Khung canvas đọc một lần mỗi khung hình (đọc lại cho từng bong bóng gây tính layout thừa). */
  private frameRect: DOMRect | null = null;

  private updateBubbles(frameSeconds = 0): void {
    this.frameRect = this.canvas.getBoundingClientRect();
    if (this.selfSpeech) {
      this.selfSpeech.seconds -= frameSeconds;
      if (this.selfSpeech.seconds <= 0) this.selfSpeech = null;
    }
    const me = this.avatar.root.position;
    this.bubbles.update(
      SELF_BUBBLE,
      this.selfSpeech ? this.bubbleScreen(me.x, BUBBLE_HEIGHT, me.z) : null,
      this.selfSpeech?.text ?? '',
    );
    for (const npc of this.npcs) {
      const p = npc.getPosition();
      this.bubbles.update(npc.spec.id, this.bubbleScreen(p.x, BUBBLE_HEIGHT, p.z), npc.status());
    }
  }
}
