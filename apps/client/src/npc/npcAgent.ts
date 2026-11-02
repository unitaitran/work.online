// Một NPC đồng nghiệp: máy trạng thái "đi tới chỗ" → "làm việc ở đó" → chọn hoạt động mới.
import type { Material } from 'three';
import type { Appearance } from '../avatar/appearance';
import { AvatarModel } from '../avatar/avatarModel';
import type { Rng } from '../avatar/names';
import { dampAngle } from '../engine/mathUtils';
import { STRINGS } from '../strings';
import type { Aabb, Vec2 } from '../world/collision';
import type { SeatRegistry } from '../world/interaction';
import { headingOf, stepToward } from '../world/movement';
import type { Interactable } from '../world/office/layout';
import { findPath } from '../world/pathfinding';
import { activityDuration, nextActivity, type NpcActivity } from './schedule';

export const NPC_SPEED = 1.7;
const NPC_RADIUS = 0.28;

export interface NpcSpec {
  id: string;
  name: string;
  appearance: Appearance;
  /** Ghế làm việc riêng (id vật tương tác loại desk). */
  deskId: string;
}

export interface NpcWorld {
  obstacles: readonly Aabb[];
  bounds: Aabb;
  interactables: ReadonlyMap<string, Interactable>;
  seats: SeatRegistry;
  meetingSeatIds: readonly string[];
  coffeeSpots: readonly { spot: Vec2; facing: number }[];
  strollSpots: readonly Vec2[];
}

interface Destination {
  spot: Vec2;
  facing: number;
  seat: Interactable | null;
}

export class NpcAgent {
  readonly avatar: AvatarModel;
  private position: Vec2;
  private facing: number;
  private path: Vec2[] = [];
  private activity: NpcActivity = 'work';
  private phase: 'walking' | 'doing' = 'doing';
  private timeLeft: number;
  private destination: Destination | null = null;
  private seatId: string | null = null;

  constructor(
    readonly spec: NpcSpec,
    material: Material,
    private readonly world: NpcWorld,
    private readonly rng: Rng,
    private readonly index: number,
  ) {
    this.avatar = new AvatarModel(spec.appearance, material);
    const desk = world.interactables.get(spec.deskId);
    if (!desk?.seat) throw new Error(`NPC desk not found: ${spec.deskId}`);
    // Bắt đầu đang ngồi làm việc ở bàn mình.
    world.seats.claim(desk.id, spec.id);
    this.seatId = desk.id;
    this.position = { ...desk.seat };
    this.facing = desk.facing;
    this.avatar.setPose('type');
    this.timeLeft = activityDuration('work', rng) * (0.3 + rng() * 0.7);
  }

  get name(): string {
    return this.spec.name;
  }

  getPosition(): Vec2 {
    return { ...this.position };
  }

  /** Câu trong bong bóng trên đầu. */
  status(): string {
    const s = STRINGS.npc;
    return this.phase === 'walking' ? s.going[this.activity] : s.doing[this.activity];
  }

  update(dt: number): void {
    if (this.phase === 'doing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.startNext();
    } else {
      this.walk(dt);
    }
    this.avatar.root.position.set(this.position.x, 0, this.position.z);
    this.avatar.root.rotation.y = this.facing;
    this.avatar.update(dt);
  }

  dispose(): void {
    if (this.seatId) this.world.seats.release(this.seatId, this.spec.id);
    this.avatar.dispose();
  }

  private startNext(): void {
    this.standUp();
    let activity = nextActivity(this.activity, this.rng);
    let destination = this.pickDestination(activity);
    if (!destination) {
      activity = 'stroll';
      destination = this.pickDestination('stroll');
    }
    this.activity = activity;
    this.destination = destination;
    const path = destination
      ? findPath(
          this.position,
          destination.spot,
          this.world.obstacles,
          NPC_RADIUS,
          this.world.bounds,
        )
      : null;
    if (!destination || !path) {
      // Không có đường: đứng tại chỗ một lúc rồi thử lại.
      this.phase = 'doing';
      this.timeLeft = 3;
      return;
    }
    this.path = path;
    this.phase = 'walking';
    this.avatar.setPose('walk');
  }

  private pickDestination(activity: NpcActivity): Destination | null {
    const { interactables, seats } = this.world;
    switch (activity) {
      case 'work': {
        const desk = interactables.get(this.spec.deskId);
        if (!desk || seats.occupant(desk.id) !== null) return null;
        return { spot: desk.approach, facing: desk.facing, seat: desk };
      }
      case 'meeting': {
        const free = this.world.meetingSeatIds.filter((id) => seats.occupant(id) === null);
        const id = free[Math.floor(this.rng() * free.length)];
        const seat = id === undefined ? undefined : interactables.get(id);
        if (!seat) return null;
        return { spot: seat.approach, facing: seat.facing, seat };
      }
      case 'coffee': {
        const coffee = this.world.coffeeSpots[this.index % this.world.coffeeSpots.length];
        return coffee ? { spot: coffee.spot, facing: coffee.facing, seat: null } : null;
      }
      case 'stroll': {
        const spots = this.world.strollSpots;
        const spot = spots[Math.floor(this.rng() * spots.length)];
        return spot ? { spot, facing: this.facing, seat: null } : null;
      }
    }
  }

  private walk(dt: number): void {
    const next = this.path[0];
    if (!next) {
      this.arrive();
      return;
    }
    const step = stepToward(this.position, next, NPC_SPEED * dt);
    const dx = step.pos.x - this.position.x;
    const dz = step.pos.z - this.position.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      this.facing = dampAngle(this.facing, headingOf({ x: dx, z: dz }), 10, dt);
    }
    this.position = step.pos;
    if (step.arrived) this.path.shift();
  }

  private arrive(): void {
    const destination = this.destination;
    this.phase = 'doing';
    this.timeLeft = activityDuration(this.activity, this.rng);
    if (!destination) return;
    this.facing = destination.facing;
    const seat = destination.seat;
    if (seat?.seat) {
      if (!this.world.seats.claim(seat.id, this.spec.id)) {
        // Có người ngồi mất rồi: đứng chờ một lúc rồi đi việc khác.
        this.activity = 'stroll';
        this.avatar.setPose('stand');
        return;
      }
      this.seatId = seat.id;
      this.position = { ...seat.seat };
      this.avatar.setPose(seat.pose === 'type' ? 'type' : 'sit');
    } else {
      this.avatar.setPose('stand');
    }
  }

  private standUp(): void {
    if (!this.seatId) return;
    const seat = this.world.interactables.get(this.seatId);
    this.world.seats.release(this.seatId, this.spec.id);
    this.seatId = null;
    if (seat) this.position = { ...seat.approach };
  }
}
