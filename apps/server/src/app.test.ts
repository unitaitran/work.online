import type { AddressInfo } from 'node:net';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  OFFICE_FLOOR,
  RESERVE_MS,
  IDLE_CHECK_MS,
  IDLE_GRACE_MS,
  parseServerMessage,
  type AccountCreatedResponse,
  type ServerMessage,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from './app';
import { testConfig, type ServerConfig } from './config';

let clock = 1_762_070_400_000;
let app: FastifyInstance | undefined;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await app?.close();
  app = undefined;
  clock = 1_762_070_400_000;
});

async function start(overrides: Partial<ServerConfig> = {}): Promise<string> {
  app = buildApp({
    config: testConfig(overrides),
    now: () => clock,
    gateway: { manualTick: true },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  return `127.0.0.1:${String(port)}`;
}

let ipCounter = 0;
async function account(name: string): Promise<string> {
  if (!app) throw new Error('no app');
  ipCounter += 1;
  const res = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    payload: {},
    remoteAddress: `10.9.${String(ipCounter >> 8)}.${String(ipCounter & 255)}`,
  });
  const { token } = res.json<AccountCreatedResponse>();
  await app.inject({
    method: 'PUT',
    url: '/api/me/character',
    headers: { authorization: `Bearer ${token}` },
    payload: { name, appearance: { skin: 0, hairStyle: 'bun', hairColor: 1, outfit: 'suit' } },
  });
  return token;
}

/** Client giả: kết nối, gom tin, chờ tin theo điều kiện. */
class Bot {
  readonly inbox: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] =
    [];
  closeCode: number | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data: WebSocket.RawData) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- ws client nhận Buffer
      const parsed = parseServerMessage(data.toString());
      if (!parsed.ok) return;
      this.inbox.push(parsed.value);
      for (const w of [...this.waiters]) {
        if (w.pred(parsed.value)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(parsed.value);
        }
      }
    });
    ws.on('close', (code: number) => {
      this.closeCode = code;
    });
  }

  static connect(host: string, token: string): Promise<Bot> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${host}/ws?token=${token}`);
      sockets.push(ws);
      const bot = new Bot(ws);
      ws.once('open', () => {
        resolve(bot);
      });
      ws.once('error', reject);
    });
  }

  send(message: unknown): void {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  waitFor<T extends ServerMessage['type']>(
    type: T,
    pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const match = (m: ServerMessage): boolean =>
      m.type === type && pred(m as Extract<ServerMessage, { type: T }>);
    const found = this.inbox.find(match);
    if (found) {
      this.inbox.splice(this.inbox.indexOf(found), 1);
      return Promise.resolve(found as Extract<ServerMessage, { type: T }>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timeout waiting for ${type}`));
      }, 2000);
      this.waiters.push({
        pred: match,
        resolve: (m) => {
          clearTimeout(timer);
          this.inbox.splice(this.inbox.indexOf(m), 1);
          resolve(m as Extract<ServerMessage, { type: T }>);
        },
      });
    });
  }

  closed(): Promise<number> {
    if (this.closeCode !== null) return Promise.resolve(this.closeCode);
    return new Promise((resolve) => this.ws.once('close', resolve));
  }
}

const tick = (): void => {
  app?.gateway.rooms.tick();
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('GET /api/health', () => {
  it('trả về { ok: true }', async () => {
    await start();
    const res = await app?.inject({ method: 'GET', url: '/api/health' });
    expect(res?.json()).toEqual({ ok: true });
  });
});

describe('WebSocket: vào phòng', () => {
  it('token sai hoặc thiếu: 401 khi nâng cấp', async () => {
    const host = await start();
    await expect(Bot.connect(host, 'x'.repeat(43))).rejects.toThrow(/401/);
  });

  it('hai người thấy nhau, di chuyển, rời phòng', async () => {
    const host = await start();
    const a = await Bot.connect(host, await account('An'));
    const welcomeA = await a.waitFor('welcome');
    expect(welcomeA.players).toEqual([]);
    expect(welcomeA.you.name).toBe('An');

    const b = await Bot.connect(host, await account('Bình'));
    const welcomeB = await b.waitFor('welcome');
    expect(welcomeB.room).toBe(welcomeA.room);
    expect(welcomeB.players.map((p) => p.name)).toEqual(['An']);
    const joined = await a.waitFor('player_join');
    expect(joined.player.name).toBe('Bình');

    // A đi một bước hợp lệ.
    clock += 200;
    const { x, z } = OFFICE_FLOOR.spawn;
    a.send({ type: 'state', x: x + 0.3, z, facing: 1.5, pose: 'walk' });
    await sleep(30);
    tick();
    const states = await b.waitFor('states');
    expect(states.s).toEqual([[welcomeA.you.sid, x + 0.3, z, 1.5, 1]]);

    // Không đổi gì thì không phát lại.
    tick();
    await sleep(30);
    expect(b.inbox.filter((m) => m.type === 'states')).toHaveLength(0);

    // Biểu cảm và câu nhanh tới người ở gần.
    a.send({ type: 'emote', emote: 'wave' });
    expect((await b.waitFor('emote')).emote).toBe('wave');
    a.send({ type: 'quick_chat', index: 0 });
    expect((await b.waitFor('quick_chat')).index).toBe(0);

    a.send({ type: 'leave' });
    expect((await b.waitFor('player_leave')).sid).toBe(welcomeA.you.sid);
  });

  it('phòng đầy thì mở phòng mới cùng loại', async () => {
    const host = await start({ roomCapacity: 2 });
    const bots = [];
    for (const name of ['A', 'B', 'C']) {
      const bot = await Bot.connect(host, await account(name));
      bots.push(await bot.waitFor('welcome'));
    }
    expect(bots[0]?.room).toBe(bots[1]?.room);
    expect(bots[2]?.room).not.toBe(bots[0]?.room);
    expect((await app?.inject({ url: '/api/capacity' }))?.json()).toMatchObject({ online: 3 });
  });

  it('hết chỗ toàn server: báo full và đóng 1013', async () => {
    const host = await start({ serverCapacity: 1 });
    await (await Bot.connect(host, await account('A'))).waitFor('welcome');
    const b = await Bot.connect(host, await account('B'));
    expect((await b.waitFor('kicked')).reason).toBe('full');
    expect(await b.closed()).toBe(1013);
  });
});

describe('WebSocket: kiểm tra vị trí', () => {
  it('đi quá nhanh hoặc xuyên bàn: bị kéo về', async () => {
    const host = await start();
    const a = await Bot.connect(host, await account('An'));
    await a.waitFor('welcome');
    const { x, z } = OFFICE_FLOOR.spawn;
    clock += 100;
    a.send({ type: 'state', x: x + 5, z, facing: 0, pose: 'walk' });
    const back = await a.waitFor('correct');
    expect(back).toEqual({ type: 'correct', x, z });

    // Đứng sát một bàn rồi "đi xuyên" qua bàn.
    const desk = OFFICE_FLOOR.desks[4];
    if (!desk) throw new Error('no desk');
    const deskFront = desk.z + OFFICE_FLOOR.desk.depth / 2 + 0.3;
    // Dịch chuyển tới trước bàn theo từng bước hợp lệ.
    let px = x;
    let pz = z;
    while (Math.hypot(desk.x - px, deskFront - pz) > 0.05) {
      const dx = desk.x - px;
      const dz = deskFront - pz;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, 0.4);
      px += (dx / d) * step;
      pz += (dz / d) * step;
      clock += 200;
      a.send({ type: 'state', x: px, z: pz, facing: 0, pose: 'walk' });
      // Chờ server xử lý xong bước này trước khi tua đồng hồ tiếp.
      await sleep(5);
    }
    await sleep(50);
    const corrections = a.inbox.filter((m) => m.type === 'correct');
    expect(corrections).toHaveLength(0);
    clock += 200;
    a.send({ type: 'state', x: px, z: pz - 0.45, facing: 0, pose: 'walk' });
    const blocked = await a.waitFor('correct');
    expect(blocked.z).toBeGreaterThan(desk.z + OFFICE_FLOOR.desk.depth / 2);
  });
});

describe('WebSocket: gói tin xấu, mất kết nối, đứng yên', () => {
  it('gói tin sai định dạng bị bỏ, không làm sập; gửi sai nhiều thì bị đóng', async () => {
    const host = await start();
    const a = await Bot.connect(host, await account('An'));
    await a.waitFor('welcome');
    a.send('rác');
    a.send({ type: 'xp', amount: 99999 });
    a.send({ type: 'quick_chat', text: 'chat tự do' });
    expect((await a.waitFor('error')).code).toBe('bad_message');
    a.send({ type: 'ping', t: 1 });
    expect((await a.waitFor('pong')).t).toBe(1);
    for (let i = 0; i < 25; i += 1) a.send('{}');
    expect((await a.waitFor('kicked')).reason).toBe('abuse');
  });

  it('gói tin quá lớn: đóng 1009, server vẫn chạy', async () => {
    const host = await start();
    const a = await Bot.connect(host, await account('An'));
    await a.waitFor('welcome');
    a.send('x'.repeat(MAX_CLIENT_MESSAGE_BYTES + 1));
    expect(await a.closed()).toBe(1009);
    const b = await Bot.connect(host, await account('Bình'));
    await b.waitFor('welcome');
  });

  it('mất kết nối: người khác thấy rời; kết nối lại trong thời gian giữ chỗ thì về đúng phòng, đúng chỗ', async () => {
    const host = await start({ roomCapacity: 2 });
    const tokenA = await account('An');
    const a = await Bot.connect(host, tokenA);
    const wa = await a.waitFor('welcome');
    const b = await Bot.connect(host, await account('Bình'));
    await b.waitFor('welcome');
    clock += 200;
    a.send({
      type: 'state',
      x: OFFICE_FLOOR.spawn.x + 0.4,
      z: OFFICE_FLOOR.spawn.z,
      facing: 0,
      pose: 'stand',
    });
    await sleep(30);
    a.ws.terminate();
    expect((await b.waitFor('player_leave')).sid).toBe(wa.you.sid);
    // Chỗ vẫn giữ: người thứ ba sang phòng khác.
    const c = await Bot.connect(host, await account('Châu'));
    expect((await c.waitFor('welcome')).room).not.toBe(wa.room);

    clock += RESERVE_MS / 2;
    tick();
    const a2 = await Bot.connect(host, tokenA);
    const back = await a2.waitFor('welcome');
    expect(back.room).toBe(wa.room);
    expect(back.you.sid).toBe(wa.you.sid);
    expect(back.you.x).toBeCloseTo(OFFICE_FLOOR.spawn.x + 0.4);
    expect((await b.waitFor('player_join')).player.name).toBe('An');
  });

  it('hết thời gian giữ chỗ thì giải phóng', async () => {
    const host = await start({ roomCapacity: 1 });
    const a = await Bot.connect(host, await account('An'));
    const wa = await a.waitFor('welcome');
    a.ws.terminate();
    await sleep(30);
    clock += RESERVE_MS + 1;
    tick();
    expect(app?.gateway.rooms.roomOf('x')).toBeNull();
    expect(app?.gateway.rooms.list()).toEqual([]);
    expect(wa.room).toBe('office-1');
    const b = await Bot.connect(host, await account('Bình'));
    await b.waitFor('welcome');
    expect(app?.gateway.rooms.list()).toHaveLength(1);
  });

  it('mở tab thứ hai cùng tài khoản: tab cũ bị thay', async () => {
    const host = await start();
    const token = await account('An');
    const a = await Bot.connect(host, token);
    await a.waitFor('welcome');
    const a2 = await Bot.connect(host, token);
    await a2.waitFor('welcome');
    expect((await a.waitFor('kicked')).reason).toBe('replaced');
  });

  it('đứng yên quá lâu: hỏi "còn ở đó không", không trả lời thì giải phóng chỗ', async () => {
    const host = await start();
    const a = await Bot.connect(host, await account('An'));
    await a.waitFor('welcome');
    const b = await Bot.connect(host, await account('Bình'));
    await b.waitFor('welcome');
    clock += IDLE_CHECK_MS;
    b.send({ type: 'active' });
    await sleep(30);
    tick();
    await a.waitFor('idle_check');
    clock += IDLE_GRACE_MS;
    tick();
    expect((await a.waitFor('kicked')).reason).toBe('idle');
    // B đã trả lời nên vẫn ở lại.
    expect(b.inbox.some((m) => m.type === 'kicked')).toBe(false);
  });
});
