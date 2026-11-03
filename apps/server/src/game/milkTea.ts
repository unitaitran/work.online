// Rủ cả phòng uống trà sữa. Người rủ khao: trả MILK_TEA.price xu cho cốc của mình lúc rủ và cho
// mỗi người nhận lời. Mỗi phòng một lượt cùng lúc, mỗi người rủ lại sau MILK_TEA.cooldownMs.
// Xu do server trừ (giao dịch + sổ cái), client chỉ gửi "rủ" / "nhận lời" / "thôi".
import {
  MILK_TEA,
  type MilkTeaInviteError,
  type MilkTeaReplyError,
  type MilkTeaRoundView,
} from '@dilam/shared';
import type { Room } from '../rooms/room';

interface Round {
  view: MilkTeaRoundView;
  hostId: string;
  room: Room;
  /** Người đã trả lời (nhận hoặc từ chối), không trả lời lại được. */
  replied: Set<string>;
  cups: number;
}

export interface MilkTeaOptions {
  now: () => number;
  /** Trừ xu của người rủ (giao dịch, ghi sổ). false nếu không đủ xu. */
  charge(userId: string, amount: number, reason: string): boolean;
  /** Báo tiến độ (số xu) mới cho người chơi. */
  push(userId: string): void;
}

export class MilkTeaService {
  private readonly rounds = new Map<string, Round>();
  private readonly lastInvite = new Map<string, number>();
  private nextId = 1;

  constructor(private readonly o: MilkTeaOptions) {}

  /** Rủ cả phòng. Trả lỗi hoặc null (đã mở, đã trừ xu cốc của người rủ). */
  invite(room: Room, userId: string): MilkTeaInviteError | null {
    const now = this.o.now();
    const current = this.rounds.get(room.id);
    if (current && now < current.view.endsAt) return 'busy';
    if (current) this.finish(current);
    const last = this.lastInvite.get(userId);
    if (last !== undefined && now - last < MILK_TEA.cooldownMs) return 'cooldown';
    if (room.connected < 2) return 'alone';
    const host = room.profileOf(userId);
    if (!host) return 'alone';
    if (!this.o.charge(userId, MILK_TEA.price, 'tea:own')) return 'coins';
    this.o.push(userId);
    this.lastInvite.set(userId, now);
    const view: MilkTeaRoundView = {
      id: this.nextId++,
      hostSid: host.sid,
      hostName: host.name,
      endsAt: now + MILK_TEA.durationMs,
      price: MILK_TEA.price,
    };
    const round: Round = { view, hostId: userId, room, replied: new Set(), cups: 1 };
    this.rounds.set(room.id, round);
    room.sendTo(userId, { type: 'tea_started', round: view });
    for (const id of room.userIds()) {
      if (id !== userId) room.sendTo(id, { type: 'tea_round', round: view });
    }
    return null;
  }

  /** Nhận lời / từ chối. Nhận lời thì người rủ trả thêm một cốc. */
  reply(room: Room, userId: string, id: number, accept: boolean): void {
    const round = this.rounds.get(room.id);
    const send = (ok: boolean, reason?: MilkTeaReplyError): void => {
      room.sendTo(userId, { type: 'tea_replied', id, accept, ok, ...(reason ? { reason } : {}) });
    };
    if (round?.view.id !== id || this.o.now() >= round.view.endsAt) {
      send(false, 'ended');
      return;
    }
    if (userId === round.hostId) {
      send(false, 'host');
      return;
    }
    if (round.replied.has(userId)) return;
    round.replied.add(userId);
    if (!accept) {
      send(true);
      return;
    }
    if (!this.o.charge(round.hostId, MILK_TEA.price, 'tea:treat')) {
      send(false, 'host_broke');
      return;
    }
    this.o.push(round.hostId);
    round.cups += 1;
    send(true);
    const guest = room.profileOf(userId);
    if (guest) {
      room.broadcastAll({ type: 'tea_served', id, sid: guest.sid, cups: round.cups });
    }
  }

  /** Gọi đều đặn: đóng các lượt đã hết giờ hoặc người rủ đã rời phòng. */
  tick(): void {
    const now = this.o.now();
    for (const round of [...this.rounds.values()]) {
      if (now >= round.view.endsAt || !round.room.has(round.hostId)) this.finish(round);
    }
  }

  /** Lượt đang mở trong phòng (để người mới vào phòng thấy). */
  current(roomId: string): MilkTeaRoundView | null {
    const round = this.rounds.get(roomId);
    return round && this.o.now() < round.view.endsAt ? round.view : null;
  }

  private finish(round: Round): void {
    if (this.rounds.get(round.room.id) !== round) return;
    this.rounds.delete(round.room.id);
    round.room.broadcastAll({
      type: 'tea_end',
      id: round.view.id,
      cups: round.cups,
      hostSid: round.view.hostSid,
    });
  }
}
