// Quản lý phòng: đưa người chơi vào phòng còn chỗ (hết chỗ thì mở phòng mới cùng loại),
// nhớ ai đang ở phòng nào, chạy nhịp phát vị trí.
import {
  OFFICE_FLOOR,
  STATE_BROADCAST_HZ,
  type KickReason,
  type OfficeLayout,
} from '@dilam/shared';
import { Room } from './room';

export interface RoomManagerOptions {
  capacity: number;
  now: () => number;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly counters = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: RoomManagerOptions) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick();
    }, 1000 / STATE_BROADCAST_HZ);
    this.timer.unref();
  }

  stop(reason: KickReason = 'shutdown'): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const room of this.rooms.values()) room.closeAll(reason);
    this.rooms.clear();
  }

  tick(): void {
    for (const room of [...this.rooms.values()]) room.tick();
  }

  /** Phòng đang giữ người này (kể cả chỗ giữ khi mất kết nối). */
  roomOf(userId: string): Room | null {
    for (const room of this.rooms.values()) if (room.has(userId)) return room;
    return null;
  }

  /**
   * Chọn phòng cho người chơi: phòng đang giữ chỗ cho họ, nếu không thì phòng cùng loại còn chỗ
   * (đông nhất trước để mọi người gặp nhau), hết thì mở phòng mới.
   */
  assign(
    userId: string,
    kind = 'office',
    layout: OfficeLayout = OFFICE_FLOOR,
    capacity?: number,
  ): Room {
    const current = this.roomOf(userId);
    if (current?.kind === kind) return current;
    if (current) current.remove(userId);
    const candidates = [...this.rooms.values()]
      .filter((room) => room.kind === kind && room.hasRoom())
      .sort((a, b) => b.size - a.size);
    const found = candidates[0];
    if (found) return found;
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    const room = new Room({
      id: `${kind}-${String(n)}`,
      kind,
      capacity: capacity ?? this.options.capacity,
      layout,
      now: this.options.now,
      onEmpty: (empty) => {
        this.rooms.delete(empty.id);
      },
    });
    this.rooms.set(room.id, room);
    return room;
  }

  /** Số người đang kết nối trên toàn server. */
  online(): number {
    let n = 0;
    for (const room of this.rooms.values()) n += room.connected;
    return n;
  }

  /** Danh sách phòng (bản đồ toà nhà). */
  list(): { id: string; kind: string; online: number; capacity: number }[] {
    return [...this.rooms.values()].map((room) => ({
      id: room.id,
      kind: room.kind,
      online: room.connected,
      capacity: room.capacity,
    }));
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  /** Chuyển người chơi sang phòng khác (bản đồ toà nhà). */
  move(
    userId: string,
    roomId: string,
    profile: Parameters<Room['join']>[0]['profile'],
  ): { ok: true; room: Room } | { ok: false; reason: 'full' | 'not_found' } {
    const from = this.roomOf(userId);
    const to = this.rooms.get(roomId);
    if (!from || !to) return { ok: false, reason: 'not_found' };
    if (from === to) return { ok: true, room: to };
    if (!to.hasRoom()) return { ok: false, reason: 'full' };
    const conn = from.detach(userId);
    if (!conn) return { ok: false, reason: 'not_found' };
    to.join({ userId, profile }, conn);
    return { ok: true, room: to };
  }

  get(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }
}
