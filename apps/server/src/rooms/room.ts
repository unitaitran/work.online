// Một phòng (văn phòng chung, hoặc phòng riêng của công ty ở Phase 6): danh sách người, vị trí,
// phát thay đổi theo vùng quan tâm, giữ chỗ khi mất kết nối, kiểm tra người đứng yên quá lâu.
import {
  IDLE_CHECK_MS,
  IDLE_GRACE_MS,
  INTEREST_RADIUS,
  poseIndex,
  PROTOCOL_VERSION,
  RESERVE_MS,
  round2,
  type Emote,
  type KickReason,
  type OfficeLayout,
  type PlayerProfile,
  type PlayerSnapshot,
  type Pose,
  type ServerMessage,
  type StateTuple,
} from '@dilam/shared';
import { PositionValidator } from './positionValidator';

/** Kết nối tới một người chơi (bọc WebSocket để test được không cần mạng). */
export interface Connection {
  send(message: ServerMessage): void;
  /** Đóng kết nối (sau khi đã gửi tin `kicked` nếu cần). */
  close(code: number, reason: string): void;
}

export interface MemberInfo {
  userId: string;
  profile: Omit<PlayerProfile, 'sid'>;
}

interface Member {
  userId: string;
  profile: PlayerProfile;
  x: number;
  z: number;
  facing: number;
  pose: Pose;
  /** Lúc nhận vị trí hợp lệ gần nhất (để giới hạn tốc độ). */
  stateAt: number;
  /** Lúc có hoạt động gần nhất (đi lại, biểu cảm...). */
  activeAt: number;
  conn: Connection | null;
  /** Mất kết nối: giữ chỗ tới lúc này. */
  reservedUntil: number;
  idleDeadline: number | null;
  /** Vị trí đã gửi gần nhất của từng người khác tới người này (chỉ gửi khi đổi). */
  sent: Map<number, string>;
  /** Có thẻ CEO (tính lúc vào phòng). */
  ceo: boolean;
}

export interface RoomOptions {
  id: string;
  kind: string;
  capacity: number;
  layout: OfficeLayout;
  now: () => number;
  /** Báo ra ngoài khi một người rời hẳn phòng (để quản lý phòng dọn dẹp). */
  onEmpty?: (room: Room) => void;
  /** Người này có thẻ vào phòng CEO của phòng này không (chủ công ty). */
  isCeo?: (userId: string) => boolean;
}

export class Room {
  readonly id: string;
  readonly kind: string;
  readonly capacity: number;
  private readonly layout: OfficeLayout;
  private readonly validator: PositionValidator;
  private readonly members = new Map<string, Member>();
  private nextSid = 1;
  private readonly now: () => number;

  constructor(private readonly options: RoomOptions) {
    this.id = options.id;
    this.kind = options.kind;
    this.capacity = options.capacity;
    this.layout = options.layout;
    this.now = options.now;
    this.validator = new PositionValidator(options.layout);
  }

  /** Số chỗ đã dùng (gồm cả chỗ đang giữ cho người mất kết nối). */
  get size(): number {
    return this.members.size;
  }

  get connected(): number {
    let n = 0;
    for (const m of this.members.values()) if (m.conn) n += 1;
    return n;
  }

  has(userId: string): boolean {
    return this.members.has(userId);
  }

  hasRoom(): boolean {
    return this.members.size < this.capacity;
  }

  /** Vào phòng (hoặc vào lại chỗ đang giữ). */
  join(info: MemberInfo, conn: Connection): void {
    const now = this.now();
    let member = this.members.get(info.userId);
    if (member) {
      // Vào lại: nếu còn kết nối cũ (tab khác), đá kết nối cũ.
      if (member.conn) {
        member.conn.send({ type: 'kicked', reason: 'replaced' });
        member.conn.close(4000, 'replaced');
      }
      member.conn = conn;
      member.profile = { ...info.profile, sid: member.profile.sid };
      member.reservedUntil = 0;
      member.idleDeadline = null;
      member.activeAt = now;
      member.stateAt = now;
      member.sent.clear();
      member.ceo = this.options.isCeo?.(info.userId) ?? false;
    } else {
      member = {
        userId: info.userId,
        profile: { ...info.profile, sid: this.nextSid++ },
        x: this.layout.spawn.x,
        z: this.layout.spawn.z,
        facing: this.layout.spawnFacing,
        pose: 'stand',
        stateAt: now,
        activeAt: now,
        conn,
        reservedUntil: 0,
        idleDeadline: null,
        sent: new Map(),
        ceo: this.options.isCeo?.(info.userId) ?? false,
      };
      this.members.set(info.userId, member);
    }
    const others = [...this.members.values()].filter((m) => m !== member && m.conn);
    conn.send({
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      room: this.id,
      you: snapshot(member),
      players: others.map(snapshot),
      serverTime: now,
    });
    this.broadcast({ type: 'player_join', player: snapshot(member) }, member);
  }

  /** Tách người chơi khỏi phòng mà KHÔNG đóng kết nối (để chuyển sang phòng khác). */
  detach(userId: string): Connection | null {
    const member = this.members.get(userId);
    if (!member) return null;
    this.members.delete(userId);
    this.broadcast({ type: 'player_leave', sid: member.profile.sid }, member);
    for (const other of this.members.values()) other.sent.delete(member.profile.sid);
    if (this.members.size === 0) this.options.onEmpty?.(this);
    return member.conn;
  }

  /** Mất kết nối: ẩn khỏi người khác nhưng giữ chỗ RESERVE_MS. */
  disconnect(userId: string, conn: Connection): void {
    const member = this.members.get(userId);
    if (member?.conn !== conn) return;
    member.conn = null;
    member.reservedUntil = this.now() + RESERVE_MS;
    this.broadcast({ type: 'player_leave', sid: member.profile.sid }, member);
  }

  /** Rời hẳn (chủ động, bị đá vì đứng yên...): giải phóng chỗ ngay. */
  remove(userId: string, kick?: KickReason): void {
    const member = this.members.get(userId);
    if (!member) return;
    this.members.delete(userId);
    if (member.conn) {
      if (kick) member.conn.send({ type: 'kicked', reason: kick });
      member.conn.close(kick ? 4001 : 1000, kick ?? 'leave');
      this.broadcast({ type: 'player_leave', sid: member.profile.sid }, member);
    }
    for (const other of this.members.values()) other.sent.delete(member.profile.sid);
    if (this.members.size === 0) this.options.onEmpty?.(this);
  }

  /** Vị trí mới từ client. Sai thì gửi `correct` để kéo về. */
  updateState(userId: string, x: number, z: number, facing: number, pose: Pose): void {
    const member = this.members.get(userId);
    if (!member?.conn) return;
    const now = this.now();
    const check = this.validator.check(member, member.stateAt, { x, z }, pose, now, member.ceo);
    const moved = Math.hypot(x - member.x, z - member.z) > 0.01 || pose !== member.pose;
    if (check.ok) {
      member.x = x;
      member.z = z;
    } else {
      member.x = check.x;
      member.z = check.z;
      member.conn.send({ type: 'correct', x: round2(check.x), z: round2(check.z) });
    }
    member.facing = facing;
    member.pose = pose;
    member.stateAt = now;
    if (moved) this.markActive(member, now);
  }

  emote(userId: string, emote: Emote): void {
    const member = this.members.get(userId);
    if (!member?.conn) return;
    this.markActive(member, this.now());
    this.broadcastNear({ type: 'emote', sid: member.profile.sid, emote }, member);
  }

  quickChat(userId: string, index: number): void {
    const member = this.members.get(userId);
    if (!member?.conn) return;
    this.markActive(member, this.now());
    this.broadcastNear({ type: 'quick_chat', sid: member.profile.sid, index }, member);
  }

  /** Trả lời "Bạn còn ở đó không?". */
  active(userId: string): void {
    const member = this.members.get(userId);
    if (member) this.markActive(member, this.now());
  }

  updateProfile(userId: string, profile: Omit<PlayerProfile, 'sid'>): void {
    const member = this.members.get(userId);
    if (!member) return;
    member.profile = { ...profile, sid: member.profile.sid };
    this.broadcast({ type: 'player_update', player: member.profile }, null);
  }

  /** Gửi tin cho một người trong phòng. */
  sendTo(userId: string, message: ServerMessage): void {
    this.members.get(userId)?.conn?.send(message);
  }

  /** Gửi cho cả phòng (trừ `except`). */
  broadcast(message: ServerMessage, except: Member | null): void {
    for (const m of this.members.values()) if (m !== except && m.conn) m.conn.send(message);
  }

  /** Gửi cho mọi người trong phòng (dùng từ bên ngoài, ví dụ sự kiện phòng). */
  broadcastAll(message: ServerMessage): void {
    this.broadcast(message, null);
  }

  /** Tính lại quyền vào phòng CEO (ví dụ vừa nhận / vừa xong việc "Họp với sếp"). */
  refreshCeo(userId: string): void {
    const member = this.members.get(userId);
    if (member) member.ceo = this.options.isCeo?.(userId) ?? false;
  }

  /** Hồ sơ công khai của một người đang trong phòng (sid, tên...). */
  profileOf(userId: string): PlayerProfile | null {
    return this.members.get(userId)?.profile ?? null;
  }

  /** Tư thế hiện tại (ngồi máy, ngồi ghế...) theo server. */
  poseOf(userId: string): Pose | null {
    return this.members.get(userId)?.pose ?? null;
  }

  /** Vị trí hiện tại theo server (null nếu không ở phòng). */
  positionOf(userId: string): { x: number; z: number } | null {
    const member = this.members.get(userId);
    return member ? { x: member.x, z: member.z } : null;
  }

  userIds(): string[] {
    return [...this.members.keys()];
  }

  private broadcastNear(message: ServerMessage, from: Member): void {
    for (const m of this.members.values()) {
      if (!m.conn) continue;
      if (Math.hypot(m.x - from.x, m.z - from.z) <= INTEREST_RADIUS) m.conn.send(message);
    }
  }

  private markActive(member: Member, now: number): void {
    member.activeAt = now;
    member.idleDeadline = null;
  }

  /**
   * Gọi đều đặn (STATE_BROADCAST_HZ): phát vị trí đã đổi tới người ở gần, hỏi người đứng yên,
   * đá người không trả lời, hết hạn chỗ giữ.
   */
  tick(): void {
    const now = this.now();
    const members = [...this.members.values()];
    for (const m of members) {
      if (!m.conn) {
        if (m.reservedUntil <= now) this.remove(m.userId);
        continue;
      }
      if (m.idleDeadline !== null && now >= m.idleDeadline) {
        this.remove(m.userId, 'idle');
        continue;
      }
      // Đang ngồi (máy, ghế họp) thì được treo máy, không hỏi "còn ở đó không".
      const seated = m.pose === 'sit' || m.pose === 'type';
      if (m.idleDeadline === null && !seated && now - m.activeAt >= IDLE_CHECK_MS) {
        m.idleDeadline = now + IDLE_GRACE_MS;
        m.conn.send({ type: 'idle_check', deadline: m.idleDeadline });
      }
    }

    const live = [...this.members.values()].filter((m) => m.conn);
    for (const viewer of live) {
      const states: StateTuple[] = [];
      for (const other of live) {
        if (other === viewer) continue;
        const near = Math.hypot(other.x - viewer.x, other.z - viewer.z) <= INTEREST_RADIUS;
        if (!near) continue;
        const tuple: StateTuple = [
          other.profile.sid,
          round2(other.x),
          round2(other.z),
          round2(other.facing),
          poseIndex(other.pose),
        ];
        const key = tuple.join(',');
        if (viewer.sent.get(other.profile.sid) === key) continue;
        viewer.sent.set(other.profile.sid, key);
        states.push(tuple);
      }
      if (states.length > 0) viewer.conn?.send({ type: 'states', s: states });
    }
  }

  /** Đóng phòng (tắt server): báo và ngắt mọi người. */
  closeAll(reason: KickReason): void {
    for (const m of this.members.values()) {
      if (!m.conn) continue;
      m.conn.send({ type: 'kicked', reason });
      m.conn.close(1001, reason);
    }
    this.members.clear();
  }
}

function snapshot(m: Member): PlayerSnapshot {
  return {
    ...m.profile,
    x: round2(m.x),
    z: round2(m.z),
    facing: round2(m.facing),
    pose: m.pose,
  };
}
