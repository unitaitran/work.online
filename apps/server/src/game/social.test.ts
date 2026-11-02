import {
  dayMood,
  OFFICE_FLOOR,
  periodStart,
  type AccountCreatedResponse,
  type LeaderboardResponse,
  type ServerMessage,
  type WallPost,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { testConfig } from '../config';
import { Room, type Connection } from '../rooms/room';
import { RoomEventDirector } from './roomEvents';

let app: FastifyInstance | undefined;
let ip = 0;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function start(adminKey?: string): FastifyInstance {
  app = buildApp({
    config: testConfig(adminKey ? { adminKey } : {}),
    gateway: { manualTick: true },
  });
  return app;
}

async function user(a: FastifyInstance, name: string) {
  ip += 1;
  const res = await a.inject({
    method: 'POST',
    url: '/api/accounts',
    payload: {},
    remoteAddress: `10.7.${String(ip >> 8)}.${String(ip & 255)}`,
  });
  const acc = res.json<AccountCreatedResponse>();
  const headers = { authorization: `Bearer ${acc.token}` };
  await a.inject({
    method: 'PUT',
    url: '/api/me/character',
    headers,
    payload: { name, appearance: { skin: 0, hairStyle: 'bun', hairColor: 0, outfit: 'suit' } },
  });
  return { ...acc, headers };
}

describe('tường than thở chung', () => {
  it('lọc nội dung; một bài mỗi ngày; ẩn danh', async () => {
    const a = start();
    const u = await user(a, 'An');
    const bad = await a.inject({
      method: 'POST',
      url: '/api/wall',
      headers: u.headers,
      payload: { text: 'gọi 0912345678' },
    });
    expect(bad.json()).toEqual({ error: 'rejected', reason: 'phone' });
    const brand = await a.inject({
      method: 'POST',
      url: '/api/wall',
      headers: u.headers,
      payload: { text: 'Shopee trễ hàng' },
    });
    expect(brand.json()).toEqual({ error: 'rejected', reason: 'brand' });
    const ok = await a.inject({
      method: 'POST',
      url: '/api/wall',
      headers: u.headers,
      payload: { text: 'Họp xong lại họp' },
    });
    expect(ok.statusCode).toBe(201);
    const posts = ok.json<{ posts: WallPost[] }>().posts;
    expect(posts[0]).toMatchObject({ text: 'Họp xong lại họp', mine: true });
    expect(JSON.stringify(posts)).not.toContain(u.userId);
    const again = await a.inject({
      method: 'POST',
      url: '/api/wall',
      headers: u.headers,
      payload: { text: 'Bài thứ hai' },
    });
    expect(again.json()).toEqual({ error: 'conflict', reason: 'one_per_day' });
  });

  it('đủ 3 báo cáo thì tự ẩn; quản trị xem và hiện lại được', async () => {
    const a = start('k'.repeat(30));
    const author = await user(a, 'Tác giả');
    const res = await a.inject({
      method: 'POST',
      url: '/api/wall',
      headers: author.headers,
      payload: { text: 'Một dòng hơi quá' },
    });
    const id = res.json<{ posts: WallPost[] }>().posts[0]?.id ?? 0;
    // Tự báo cáo bài mình: không được.
    expect(
      (
        await a.inject({
          method: 'POST',
          url: `/api/wall/${String(id)}/report`,
          headers: author.headers,
        })
      ).statusCode,
    ).toBe(403);
    const reporters = await Promise.all(['R1', 'R2', 'R3'].map((n) => user(a, n)));
    for (const [i, r] of reporters.entries()) {
      const rep = await a.inject({
        method: 'POST',
        url: `/api/wall/${String(id)}/report`,
        headers: r.headers,
      });
      expect(rep.statusCode).toBe(200);
      const visible = rep.json<{ posts: WallPost[] }>().posts.some((p) => p.id === id);
      expect(visible).toBe(i < 2);
    }
    // Báo cáo trùng không được tính.
    const dup = await a.inject({
      method: 'POST',
      url: `/api/wall/${String(id)}/report`,
      headers: reporters[0]?.headers ?? {},
    });
    expect(dup.statusCode).toBe(404);
    // Quản trị.
    expect((await a.inject({ method: 'GET', url: '/api/admin/wall' })).statusCode).toBe(401);
    const list = await a.inject({
      method: 'GET',
      url: '/api/admin/wall',
      headers: { 'x-admin-key': 'k'.repeat(30) },
    });
    expect(
      list.json<{ posts: { id: number; hidden: boolean; reports: number }[] }>().posts[0],
    ).toMatchObject({ id, hidden: true, reports: 3 });
    await a.inject({
      method: 'POST',
      url: `/api/admin/wall/${String(id)}/restore`,
      headers: { 'x-admin-key': 'k'.repeat(30) },
    });
    const after = await a.inject({ method: 'GET', url: '/api/wall', headers: author.headers });
    expect(after.json<{ posts: WallPost[] }>().posts.some((p) => p.id === id)).toBe(true);
    const html = await a.inject({ method: 'GET', url: '/admin' });
    expect(html.body).not.toContain('innerHTML');
  });

  it('không có ADMIN_KEY thì trang quản trị không tồn tại', async () => {
    const a = start();
    expect((await a.inject({ method: 'GET', url: '/admin' })).statusCode).toBe(404);
  });
});

describe('xếp hạng', () => {
  it('theo XP kiếm được trong kỳ; ẩn mình thì không hiện', async () => {
    const a = start();
    const u1 = await user(a, 'Một');
    const u2 = await user(a, 'Hai');
    const log = (userId: string, xp: number): void => {
      a.repos.activity.add({ userId, at: Date.now(), kind: 'checkin', xp, coins: 0 });
    };
    log(u1.userId, 50);
    log(u2.userId, 80);
    const board = await a.inject({
      method: 'GET',
      url: '/api/leaderboard?period=week',
      headers: u1.headers,
    });
    const data = board.json<LeaderboardResponse>();
    expect(data.rows.map((r) => [r.name, r.xp, r.rank])).toEqual([
      ['Hai', 80, 1],
      ['Một', 50, 2],
    ]);
    expect(data.mine).toMatchObject({ rank: 2, me: true });
    expect(JSON.stringify(data)).not.toContain(u2.userId);
    await a.inject({
      method: 'PUT',
      url: '/api/me/privacy',
      headers: u2.headers,
      payload: { hideFromLeaderboard: true },
    });
    const hidden = await a.inject({
      method: 'GET',
      url: '/api/leaderboard?period=month&department=all',
      headers: u1.headers,
    });
    expect(hidden.json<LeaderboardResponse>().rows.map((r) => r.name)).toEqual(['Một']);
    expect(
      (await a.inject({ method: 'GET', url: '/api/leaderboard?period=year', headers: u1.headers }))
        .statusCode,
    ).toBe(400);
  });

  it('đầu kỳ: thứ Hai và ngày 1', () => {
    expect(periodStart('2026-11-05', 'week')).toBe('2026-11-02');
    expect(periodStart('2026-11-02', 'week')).toBe('2026-11-02');
    expect(periodStart('2026-11-08', 'week')).toBe('2026-11-02');
    expect(periodStart('2026-11-20', 'month')).toBe('2026-11-01');
  });
});

describe('lịch theo ngày', () => {
  it('Tết, ngày lương, thứ Hai, thứ Sáu', () => {
    expect(dayMood('2026-02-17')).toBe('tet');
    expect(dayMood('2026-02-15')).toBe('tet');
    expect(dayMood('2026-11-05')).toBe('payday');
    expect(dayMood('2026-11-02')).toBe('monday');
    expect(dayMood('2026-11-06')).toBe('friday');
    expect(dayMood('2026-11-04')).toBe('normal');
    expect(dayMood('2026-11-07')).toBe('weekend');
  });
});

describe('sự kiện phòng (mô phỏng 40 người)', () => {
  function setup(n: number) {
    let now = 1_000_000;
    const room = new Room({
      id: 'office-1',
      kind: 'office',
      capacity: 50,
      layout: OFFICE_FLOOR,
      now: () => now,
    });
    const inbox = new Map<string, ServerMessage[]>();
    for (let i = 0; i < n; i += 1) {
      const id = `u${String(i)}`;
      inbox.set(id, []);
      const conn: Connection = {
        send: (m) => {
          inbox.get(id)?.push(m);
        },
        close: () => undefined,
      };
      room.join(
        {
          userId: id,
          profile: {
            code: id,
            name: id,
            appearance: { skin: 0, hairStyle: 'bun', hairColor: 0, outfit: 'suit' },
            title: 1,
            branch: null,
          },
        },
        conn,
      );
    }
    const rewards: string[] = [];
    const director = new RoomEventDirector({
      now: () => now,
      random: () => 0,
      reward: (u) => rewards.push(u),
    });
    return { room, inbox, rewards, director, advance: (ms: number) => (now += ms) };
  }

  it('tự lên lịch 5-10 phút, không phạt ai', () => {
    const { room, director, advance, inbox } = setup(3);
    director.tick([room]);
    advance(5 * 60_000 - 1);
    director.tick([room]);
    expect(director.current('office-1')).toBeNull();
    advance(2);
    director.tick([room]);
    expect(director.current('office-1')?.kind).toBe('boss_walk');
    advance(3801);
    director.tick([room]);
    const end = inbox.get('u0')?.find((m) => m.type === 'room_event_end');
    expect(end).toMatchObject({ success: false, rewarded: false });
  });

  it('sếp đi ngang: ai bấm kịp thì được thưởng', () => {
    const { room, director, rewards, advance } = setup(40);
    const ev = director.start(room, 'boss_walk');
    director.respond(room, 'u1', ev?.id ?? 0);
    director.respond(room, 'u2', ev?.id ?? 0);
    advance(3500);
    director.respond(room, 'u3', ev?.id ?? 0); // trong khoảng bù trễ mạng: vẫn tính
    advance(500);
    director.respond(room, 'u4', ev?.id ?? 0); // quá trễ
    director.tick([room]);
    expect(rewards.sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('mất wifi: cả phòng gõ đủ thì cả phòng được thưởng; 40 người không gây nghẽn', () => {
    const { room, director, rewards, inbox } = setup(40);
    const ev = director.start(room, 'wifi_down');
    expect(ev?.goal).toBe(40);
    const t0 = performance.now();
    for (let i = 0; i < 40; i += 1) director.respond(room, `u${String(i % 5)}`, ev?.id ?? 0);
    const ms = performance.now() - t0;
    expect(rewards).toHaveLength(40);
    expect(ms).toBeLessThan(200);
    const progress = inbox.get('u10')?.filter((m) => m.type === 'room_event_progress') ?? [];
    expect(progress.length).toBe(40);
  });

  it('hết cà phê: phải tới máy pha; họp đột xuất: ai trong phòng họp thì được thưởng', () => {
    const { room, director, rewards, advance } = setup(2);
    const ev = director.start(room, 'coffee_out');
    expect(director.coffeeOut('office-1')).toBe(true);
    director.respond(room, 'u0', ev?.id ?? 0); // đứng ở cửa, xa máy
    expect(rewards).toEqual([]);
    advance(60_801);
    director.tick([room]);
    expect(director.coffeeOut('office-1')).toBe(false);
    director.start(room, 'surprise_meeting');
    // Đi bộ từng bước hợp lệ vào phòng họp qua cửa kính, rồi ngồi.
    let p = { x: OFFICE_FLOOR.spawn.x, z: OFFICE_FLOOR.spawn.z };
    for (const target of [
      { x: OFFICE_FLOOR.spawn.x, z: 1.61 },
      { x: 3.1, z: 1.61 },
      { x: 3.1, z: 2.55 },
      { x: 2.4, z: 2.55 },
    ]) {
      while (Math.hypot(target.x - p.x, target.z - p.z) > 0.01) {
        const d = Math.hypot(target.x - p.x, target.z - p.z);
        const step = Math.min(d, 0.4);
        p = { x: p.x + ((target.x - p.x) / d) * step, z: p.z + ((target.z - p.z) / d) * step };
        advance(200);
        room.updateState('u1', p.x, p.z, 0, 'walk');
      }
    }
    advance(200);
    room.updateState('u1', 2.4, 3.1, 0, 'sit');
    expect(room.positionOf('u1')).toEqual({ x: 2.4, z: 3.1 });
    advance(60_800);
    director.tick([room]);
    expect(rewards).toEqual(['u1']);
  });
});
