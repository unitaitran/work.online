import { MILK_TEA, type ServerMessage } from '@dilam/shared';
import { describe, expect, it } from 'vitest';
import type { Room } from '../rooms/room';
import { MilkTeaService } from './milkTea';

/** Phòng giả: ba người (host, an, binh), ghi lại tin gửi cho từng người. */
function fakeRoom(ids = ['host', 'an', 'binh']) {
  const inbox = new Map<string, ServerMessage[]>(ids.map((id) => [id, []]));
  const room = {
    id: 'office-1',
    connected: ids.length,
    has: (id: string) => inbox.has(id),
    userIds: () => [...inbox.keys()],
    profileOf: (id: string) =>
      inbox.has(id) ? { sid: ids.indexOf(id) + 1, name: id.toUpperCase() } : null,
    sendTo: (id: string, m: ServerMessage) => inbox.get(id)?.push(m),
    broadcastAll: (m: ServerMessage) => {
      for (const list of inbox.values()) list.push(m);
    },
  };
  return { room: room as unknown as Room, inbox };
}

function setup(coins: Record<string, number>) {
  let now = 1_000_000;
  const xp: Record<string, number> = {};
  const service = new MilkTeaService({
    now: () => now,
    reward: (id) => {
      xp[id] = (xp[id] ?? 0) + 10;
      return 10;
    },
    charge: (id, amount) => {
      if ((coins[id] ?? 0) < amount) return false;
      coins[id] = (coins[id] ?? 0) - amount;
      return true;
    },
    push: () => undefined,
  });
  return {
    service,
    xp,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const types = (list: ServerMessage[] | undefined) => (list ?? []).map((m) => m.type);

describe('rủ cả phòng uống trà sữa', () => {
  it('mỗi người tự trả cốc của mình và được XP; từ chối thì không tốn, không được XP', () => {
    const coins = { host: 50, an: 20, binh: 20 };
    const { service, xp, advance } = setup(coins);
    const { room, inbox } = fakeRoom();
    expect(service.invite(room, 'host')).toBeNull();
    expect(coins.host).toBe(50 - MILK_TEA.price);
    expect(xp.host).toBe(10);
    expect(types(inbox.get('an'))).toContain('tea_round');
    expect(inbox.get('host')?.find((m) => m.type === 'tea_started')).toMatchObject({ xp: 10 });
    const id = service.current(room.id)?.id ?? -1;
    service.reply(room, 'an', id, true);
    service.reply(room, 'binh', id, false);
    service.reply(room, 'an', id, true); // trả lời lần hai: bỏ qua
    expect(coins.an).toBe(20 - MILK_TEA.price);
    expect(coins.binh).toBe(20);
    expect(coins.host).toBe(50 - MILK_TEA.price);
    expect(xp.an).toBe(10);
    expect(xp.binh).toBeUndefined();
    expect(inbox.get('an')?.find((m) => m.type === 'tea_replied')).toMatchObject({
      ok: true,
      xp: 10,
    });
    expect(types(inbox.get('binh'))).toContain('tea_served');
    advance(MILK_TEA.durationMs);
    service.tick();
    expect(inbox.get('host')?.find((m) => m.type === 'tea_end')).toMatchObject({ cups: 2 });
    // Hết giờ thì không nhận lời được nữa.
    service.reply(room, 'binh', id, true);
    expect(inbox.get('binh')?.at(-1)).toMatchObject({
      type: 'tea_replied',
      ok: false,
      reason: 'ended',
    });
  });

  it('không đủ xu, đang có lượt khác, chưa hết thời gian chờ, ở một mình: không rủ được', () => {
    const coins = { host: 3, an: 100 };
    const { service, advance } = setup(coins);
    const { room } = fakeRoom();
    expect(service.invite(room, 'host')).toBe('coins');
    expect(service.invite(room, 'an')).toBeNull();
    expect(service.invite(room, 'binh')).toBe('busy');
    advance(MILK_TEA.durationMs);
    service.tick();
    expect(service.invite(room, 'an')).toBe('cooldown');
    expect(service.invite(fakeRoom(['solo']).room, 'solo')).toBe('alone');
  });

  it('người nhận lời không đủ xu: được báo, không trừ âm, kiếm thêm xu thì nhận lời lại được', () => {
    const coins = { host: 20, an: 2 };
    const { service } = setup(coins);
    const { room, inbox } = fakeRoom();
    service.invite(room, 'host');
    const id = service.current(room.id)?.id ?? -1;
    service.reply(room, 'an', id, true);
    expect(coins.an).toBe(2);
    expect(inbox.get('an')?.at(-1)).toMatchObject({ ok: false, reason: 'coins' });
    coins.an = 10;
    service.reply(room, 'an', id, true);
    expect(coins.an).toBe(5);
  });
});
