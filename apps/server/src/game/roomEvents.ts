// Sự kiện ngẫu nhiên theo phòng, mỗi 5-10 phút. KHÔNG phạt ai: tham gia kịp thì có thưởng nhỏ,
// lỡ thì thôi.
//  - Sếp đi ngang: cảnh báo 3 giây, ai bấm "giả vờ bận" kịp thì được thưởng.
//  - Mất wifi: cả phòng cùng gõ router; đủ số lần thì cả phòng được thưởng.
//  - Hết cà phê: máy pha tạm nghỉ; ai tới đổ hạt trước thì được thưởng, máy chạy lại.
//  - Họp đột xuất: ai vào ngồi trong phòng họp trước khi hết giờ thì được thưởng.
import {
  OFFICE_FLOOR,
  ROOM_EVENT_DURATION,
  ROOM_EVENT_INTERVAL,
  ROOM_EVENT_KINDS,
  officeInteractables,
  wifiGoal,
  type RoomEventKind,
  type RoomEventView,
} from '@dilam/shared';
import type { Room } from '../rooms/room';

/** Nhận thêm chừng này sau giờ kết thúc hiển thị, bù trễ mạng (ms). */
export const RESPONSE_GRACE_MS = 800;
/** Mỗi người gõ router tối đa chừng này lần (để cả phòng cùng làm). */
const WIFI_TAPS_PER_PLAYER = 12;

interface ActiveEvent {
  view: RoomEventView;
  responders: Set<string>;
  taps: Map<string, number>;
  done: boolean;
}

export interface RoomEventsOptions {
  now: () => number;
  random?: () => number;
  /** Thưởng cho một người (server áp luật XP và ghi sổ). */
  reward(userId: string, kind: RoomEventKind): void;
}

const COFFEE = officeInteractables(OFFICE_FLOOR).find((item) => item.kind === 'coffee');
const MEETING = OFFICE_FLOOR.meeting.bounds;

export class RoomEventDirector {
  private readonly next = new Map<string, number>();
  private readonly active = new Map<string, ActiveEvent>();
  private nextId = 1;
  private readonly random: () => number;

  constructor(private readonly o: RoomEventsOptions) {
    this.random = o.random ?? Math.random;
  }

  /** Gọi đều đặn với danh sách phòng đang mở. */
  tick(rooms: readonly Room[]): void {
    const now = this.o.now();
    const live = new Set(rooms.map((room) => room.id));
    for (const id of [...this.next.keys()]) if (!live.has(id)) this.next.delete(id);
    for (const room of rooms) {
      const event = this.active.get(room.id);
      if (event) {
        if (now >= event.view.endsAt + RESPONSE_GRACE_MS) this.finish(room, event, false);
        continue;
      }
      if (room.kind !== 'office' || room.connected === 0) continue;
      const at = this.next.get(room.id);
      if (at === undefined) {
        this.schedule(room.id, now);
      } else if (now >= at) {
        const kinds = ROOM_EVENT_KINDS;
        this.start(room, kinds[Math.floor(this.random() * kinds.length)] ?? 'boss_walk');
      }
    }
  }

  /** Bắt đầu một sự kiện (dùng cả cho test và API dev). */
  start(room: Room, kind: RoomEventKind): RoomEventView | null {
    if (this.active.has(room.id)) return null;
    const now = this.o.now();
    const view: RoomEventView = {
      id: this.nextId++,
      kind,
      endsAt: now + ROOM_EVENT_DURATION[kind],
      ...(kind === 'wifi_down' ? { goal: wifiGoal(room.connected), progress: 0 } : {}),
    };
    this.active.set(room.id, { view, responders: new Set(), taps: new Map(), done: false });
    room.broadcastAll({ type: 'room_event', event: view });
    return view;
  }

  /** Sự kiện đang diễn ra ở phòng (để người mới vào thấy). */
  current(roomId: string): RoomEventView | null {
    return this.active.get(roomId)?.view ?? null;
  }

  /** Máy pha cà phê đang tạm nghỉ (sự kiện hết cà phê). */
  coffeeOut(roomId: string): boolean {
    return this.active.get(roomId)?.view.kind === 'coffee_out';
  }

  /** Người chơi tham gia sự kiện. */
  respond(room: Room, userId: string, eventId: number): void {
    const event = this.active.get(room.id);
    if (!event || event.done || event.view.id !== eventId) return;
    const now = this.o.now();
    if (now > event.view.endsAt + RESPONSE_GRACE_MS) return;
    switch (event.view.kind) {
      case 'boss_walk':
        event.responders.add(userId);
        break;
      case 'wifi_down': {
        const taps = event.taps.get(userId) ?? 0;
        if (taps >= WIFI_TAPS_PER_PLAYER) return;
        event.taps.set(userId, taps + 1);
        event.responders.add(userId);
        event.view.progress = (event.view.progress ?? 0) + 1;
        room.broadcastAll({
          type: 'room_event_progress',
          id: event.view.id,
          progress: event.view.progress,
        });
        if (event.view.progress >= (event.view.goal ?? 0)) this.finish(room, event, true);
        break;
      }
      case 'coffee_out': {
        const p = room.positionOf(userId);
        if (!p || !COFFEE) return;
        if (Math.hypot(p.x - COFFEE.approach.x, p.z - COFFEE.approach.z) > 2.5) return;
        event.responders.add(userId);
        this.finish(room, event, true);
        break;
      }
      case 'surprise_meeting':
        // Không cần bấm: lúc kết thúc, ai đang ở trong phòng họp thì được thưởng.
        break;
    }
  }

  private finish(room: Room, event: ActiveEvent, success: boolean): void {
    if (event.done) return;
    event.done = true;
    this.active.delete(room.id);
    this.schedule(room.id, this.o.now());
    let rewarded: Set<string>;
    switch (event.view.kind) {
      case 'boss_walk':
        rewarded = event.responders;
        success = rewarded.size > 0;
        break;
      case 'wifi_down':
        // Hoàn thành chung thì cả phòng được thưởng.
        rewarded = success ? new Set(room.userIds()) : new Set();
        break;
      case 'coffee_out':
        rewarded = event.responders;
        break;
      case 'surprise_meeting':
        rewarded = new Set(
          room.userIds().filter((id) => {
            const p = room.positionOf(id);
            return (
              p !== null &&
              p.x > MEETING.minX &&
              p.x < MEETING.maxX &&
              p.z > MEETING.minZ &&
              p.z < MEETING.maxZ
            );
          }),
        );
        success = rewarded.size > 0;
        break;
    }
    for (const userId of rewarded) this.o.reward(userId, event.view.kind);
    for (const userId of room.userIds()) {
      room.sendTo(userId, {
        type: 'room_event_end',
        id: event.view.id,
        kind: event.view.kind,
        success,
        rewarded: rewarded.has(userId),
      });
    }
  }

  private schedule(roomId: string, now: number): void {
    const { min, max } = ROOM_EVENT_INTERVAL;
    this.next.set(roomId, now + min + this.random() * (max - min));
  }
}
