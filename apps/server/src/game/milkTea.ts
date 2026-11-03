// Rủ cả phòng uống trà sữa. Mỗi người tự trả MILK_TEA.price xu cho cốc của mình (người rủ trả lúc
// rủ, người khác trả lúc nhận lời) và được XP bù lại (luật chung, giới hạn số cốc mỗi ngày).
// Mỗi phòng một lượt cùng lúc, mỗi người rủ lại sau MILK_TEA.cooldownMs.
// Xu và XP do server tính, client chỉ gửi "rủ" / "nhận lời" / "thôi".
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
  /** Trừ xu (giao dịch, ghi sổ). false nếu không đủ xu. */
  charge(userId: string, amount: number, reason: string): boolean;
  /** Cộng XP uống trà sữa (luật chung); trả số XP thực nhận. */
  reward(userId: string): number;
  /** Báo tiến độ (số xu) mới cho người chơi. */
  push(userId: string): void;
}

export class MilkTeaService {
  private readonly rounds = new Map<string, Round>();
  private readonly lastInvite = new Map<string, number>();
  private nextId = 1;

  constructor(private readonly o: MilkTeaOptions) {}

  /** Rủ cả phòng. Trả lỗi hoặc null (đã mở, người rủ đã trả cốc của mình và được XP). */
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
    if (!this.o.charge(userId, MILK_TEA.price, 'tea:cup')) return 'coins';
    const xp = this.o.reward(userId);
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
    room.sendTo(userId, { type: 'tea_started', round: view, xp });
    for (const id of room.userIds()) {
      if (id !== userId) room.sendTo(id, { type: 'tea_round', round: view });
    }
    return null;
  }

  /** Nhận lời (tự trả một cốc, được XP) / từ chối. */
  reply(room: Room, userId: string, id: number, accept: boolean): void {
    const round = this.rounds.get(room.id);
    const send = (ok: boolean, reason?: MilkTeaReplyError, xp?: number): void => {
      room.sendTo(userId, {
        type: 'tea_replied',
        id,
        accept,
        ok,
        ...(reason ? { reason } : {}),
        ...(xp !== undefined ? { xp } : {}),
      });
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
    if (!accept) {
      round.replied.add(userId);
      send(true);
      return;
    }
    // Không đủ xu thì báo, vẫn nhận lời lại được (ví dụ sau khi kiếm thêm xu).
    if (!this.o.charge(userId, MILK_TEA.price, 'tea:cup')) {
      send(false, 'coins');
      return;
    }
    round.replied.add(userId);
    const xp = this.o.reward(userId);
    this.o.push(userId);
    round.cups += 1;
    send(true, undefined, xp);
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
