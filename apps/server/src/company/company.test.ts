import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMPANY,
  OFFICE_FLOOR,
  parseServerMessage,
  settleEconomy,
  simulateCompany,
  xpForLevel,
  type AccountCreatedResponse,
  type CompanyDetail,
  type CompanyEconomy,
  type MeResponse,
  type MyCompanyResponse,
  type ServerMessage,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../app';
import { publicProfile } from '../rooms/profile';
import { testConfig, type ServerConfig } from '../config';

const apps: FastifyInstance[] = [];
const sockets: WebSocket[] = [];
let ip = 0;

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  for (const a of apps.splice(0)) await a.close();
});

function makeApp(overrides: Partial<ServerConfig> = {}): FastifyInstance {
  const app = buildApp({ config: testConfig(overrides), gateway: { manualTick: true } });
  apps.push(app);
  return app;
}

interface Player {
  token: string;
  userId: string;
  code: string;
  headers: { authorization: string };
}

async function player(app: FastifyInstance, name: string, remote?: string): Promise<Player> {
  ip += 1;
  const remoteAddress = remote ?? `10.5.${String(ip >> 8)}.${String(ip & 255)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    payload: {},
    remoteAddress,
  });
  const acc = res.json<AccountCreatedResponse>();
  const headers = { authorization: `Bearer ${acc.token}` };
  await app.inject({
    method: 'PUT',
    url: '/api/me/character',
    headers,
    remoteAddress,
    payload: { name, appearance: { skin: 0, hairStyle: 'bun', hairColor: 0, outfit: 'suit' } },
  });
  const me = await app.inject({ method: 'GET', url: '/api/me', headers });
  return { token: acc.token, userId: acc.userId, code: me.json<MeResponse>().playerCode, headers };
}

/** Cho người chơi đủ cấp Senior và đủ xu (ghi sổ cái như phần thưởng thật). */
function makeSenior(app: FastifyInstance, userId: string, earned = 8000): void {
  const state = app.game.engine.state(userId);
  app.game.engine.save(userId, { ...state, xp: xpForLevel(150), coins: state.coins + earned });
  app.repos.ledger.add(userId, Date.now(), earned, 'earn:test', state.coins + earned);
}

const post = (
  app: FastifyInstance,
  p: Player,
  url: string,
  payload?: object,
  remoteAddress?: string,
) =>
  app.inject({
    method: 'POST',
    url,
    headers: p.headers,
    ...(payload ? { payload } : {}),
    ...(remoteAddress ? { remoteAddress } : {}),
  });

const FOUND = { name: 'Bánh Bao Vui Vẻ', industry: 'cafe', color: 1, icon: 'cup' } as const;

describe('mở công ty (6A)', () => {
  it('thiếu cấp, đang làm ở công ty, thiếu vốn thì không mở được', async () => {
    const app = makeApp();
    const a = await player(app, 'An');
    const res = await post(app, a, '/api/company/found', FOUND);
    expect(res.json()).toMatchObject({ error: 'rejected', reason: 'level' });
    const state = app.game.engine.state(a.userId);
    app.game.engine.save(a.userId, { ...state, xp: xpForLevel(150) });
    expect((await post(app, a, '/api/company/found', FOUND)).json()).toMatchObject({
      reason: 'employed',
    });
    await post(app, a, '/api/company/leave');
    // Vốn tối thiểu 800 xu, chưa có xu.
    expect((await post(app, a, '/api/company/found', FOUND)).json()).toMatchObject({
      reason: 'capital',
    });
  });

  it('tên bị chặn (thương hiệu thật, từ cấm) hoặc trùng thì bị từ chối', async () => {
    const app = makeApp();
    const a = await player(app, 'An');
    makeSenior(app, a.userId);
    await post(app, a, '/api/company/leave');
    expect(
      (await post(app, a, '/api/company/found', { ...FOUND, name: 'Google Việt' })).json(),
    ).toMatchObject({ reason: 'brand' });
    expect(
      (await post(app, a, '/api/company/found', { ...FOUND, name: 'Công ty vcl' })).json(),
    ).toMatchObject({ reason: 'profanity' });
    expect((await post(app, a, '/api/company/found', FOUND)).statusCode).toBe(200);
    const b = await player(app, 'Bình');
    makeSenior(app, b.userId);
    await post(app, b, '/api/company/leave');
    expect(
      (await post(app, b, '/api/company/found', { ...FOUND, name: 'bánh bao VUI VẺ' })).json(),
    ).toMatchObject({ reason: 'name_taken' });
  });

  it('mở xong: trừ vốn (25% xu đã kiếm, ghi sổ cái); mỗi người một công ty; điều hành được', async () => {
    const app = makeApp();
    const a = await player(app, 'An');
    makeSenior(app, a.userId, 8000);
    await post(app, a, '/api/company/leave');
    const res = await post(app, a, '/api/company/found', FOUND);
    const detail = res.json<CompanyDetail>();
    expect(detail.isOwner).toBe(true);
    expect(detail.economy.treasury).toBe(2000);
    expect(app.game.engine.state(a.userId).coins).toBe(6000);
    expect(app.repos.ledger.sum(a.userId)).toBe(6000);
    expect(
      (await post(app, a, '/api/company/found', { ...FOUND, name: 'Thứ Hai' })).json(),
    ).toMatchObject({ reason: 'employed' });
    // Nhận dự án, tuyển NPC, thăng chức NPC.
    const offer = detail.offers[0];
    if (!offer) throw new Error('no offer');
    const withProject = (
      await post(app, a, '/api/company/project', { offerId: offer.id })
    ).json<CompanyDetail>();
    expect(withProject.economy.project?.id).toBe(offer.id);
    const hired = (await post(app, a, '/api/company/hire')).json<CompanyDetail>();
    expect(hired.economy.staff).toHaveLength(1);
    const promoted = (
      await post(app, a, '/api/company/staff/promote', { staffId: 0 })
    ).json<CompanyDetail>();
    expect(promoted.economy.staff[0]?.rank).toBe(1);
    expect((await post(app, a, '/api/company/upgrade')).json()).toMatchObject({
      reason: 'not_ready',
    });
  });

  it('khởi động lại server vẫn đúng giai đoạn và nhân viên', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dilam-co-'));
    try {
      const dbPath = join(dir, 'c.sqlite');
      const app1 = makeApp({ dbPath });
      const a = await player(app1, 'An');
      makeSenior(app1, a.userId);
      await post(app1, a, '/api/company/leave');
      await post(app1, a, '/api/company/found', FOUND);
      await post(app1, a, '/api/company/hire');
      await app1.close();
      apps.splice(apps.indexOf(app1), 1);
      const app2 = makeApp({ dbPath });
      const me = await app2.inject({ method: 'GET', url: '/api/company/me', headers: a.headers });
      const detail = me.json<MyCompanyResponse>().detail;
      expect(detail?.company.name).toBe('Bánh Bao Vui Vẻ');
      expect(detail?.economy.stage).toBe(0);
      expect(detail?.economy.staff).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('kinh tế công ty', () => {
  const base: CompanyEconomy = {
    stage: 0,
    treasury: 10,
    reputation: 0,
    projectsDone: 0,
    staff: [
      { id: 0, nameIndex: 0, rank: 2, department: 'dev', awayUntil: 0 },
      { id: 1, nameIndex: 1, rank: 2, department: 'dev', awayUntil: 0 },
    ],
    project: {
      id: 'x',
      nameIndex: 0,
      difficulty: 5,
      work: 99_999,
      reward: 1,
      reputation: 1,
      progress: 0,
    },
    lastSettle: 0,
  };

  it('offline lâu: chỉ gộp tối đa 24 giờ, quỹ không âm', () => {
    const r = settleEconomy(base, 90 * 86_400_000);
    expect(r.economy.treasury).toBeGreaterThanOrEqual(0);
    const fullDay = 24 * 2 * (COMPANY.staffWorkPerHour[2] ?? 0);
    // Quỹ chỉ có 10 xu: NPC chỉ làm phần được trả lương.
    expect(r.workAdded).toBeLessThan(fullDay);
    const rich = settleEconomy({ ...base, treasury: 1_000_000 }, 90 * 86_400_000);
    expect(rich.workAdded).toBeCloseTo(fullDay);
  });

  it('cân bằng: chơi đều mỗi ngày tới IPO khoảng 2 tháng', () => {
    const days = simulateCompany({ playerWorkPerDay: 190, days: 400 });
    expect(days).toHaveLength(6);
    const ipo = days.at(-1) ?? 0;
    expect(ipo).toBeGreaterThanOrEqual(45);
    expect(ipo).toBeLessThanOrEqual(75);
  });
});

// ---------------------------------------------------------------------------
// 6B: hai tài khoản, phòng công ty qua WebSocket
// ---------------------------------------------------------------------------

class Bot {
  readonly inbox: ServerMessage[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data: WebSocket.RawData) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- ws client nhận Buffer
      const parsed = parseServerMessage(data.toString());
      if (parsed.ok) this.inbox.push(parsed.value);
    });
  }
  static connect(host: string, token: string): Promise<Bot> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${host}/ws?token=${token}`);
      sockets.push(ws);
      ws.once('open', () => {
        resolve(new Bot(ws));
      });
      ws.once('error', reject);
    });
  }
  send(m: object): void {
    this.ws.send(JSON.stringify(m));
  }
  async waitFor<T extends ServerMessage['type']>(
    type: T,
    pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    for (let i = 0; i < 100; i += 1) {
      const found = this.inbox.find(
        (m) => m.type === type && pred(m as Extract<ServerMessage, { type: T }>),
      );
      if (found) {
        this.inbox.splice(this.inbox.indexOf(found), 1);
        return found as Extract<ServerMessage, { type: T }>;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout ${type}`);
  }
}

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  return `127.0.0.1:${String((app.server.address() as AddressInfo).port)}`;
}

describe('vào làm ở công ty người chơi khác (6B)', () => {
  async function setup() {
    const app = makeApp();
    const host = await listen(app);
    const a = await player(app, 'Chủ An');
    makeSenior(app, a.userId);
    await post(app, a, '/api/company/leave');
    const detail = (
      await post(app, a, '/api/company/found', { ...FOUND, province: 'da-nang' })
    ).json<CompanyDetail>();
    const b = await player(app, 'Bình');
    return { app, host, a, b, companyId: detail.company.id };
  }

  it('chức danh theo nơi làm: chủ là CEO, nhân viên theo khung cấp, rời công ty về thang chung', async () => {
    const { app, a, b, companyId } = await setup();
    expect(publicProfile(app.repos, a.userId).job).toBe('ceo');
    expect(publicProfile(app.repos, b.userId).job).toBeNull();
    const state = app.game.engine.state(b.userId);
    app.game.engine.save(b.userId, { ...state, xp: xpForLevel(40) });
    const { applicationId } = (await post(app, b, '/api/company/apply', { companyId })).json<{
      applicationId: number;
    }>();
    await post(app, a, '/api/company/applications', { applicationId, approve: true });
    expect(publicProfile(app.repos, b.userId).job).toBe('junior');
    await post(app, b, '/api/company/leave');
    expect(publicProfile(app.repos, b.userId).job).toBeNull();
  });

  it('B nộp đơn, A duyệt, B vào phòng công ty và thấy A', async () => {
    const { app, host, a, b, companyId } = await setup();
    const applied = await post(app, b, '/api/company/apply', { companyId });
    const { applicationId } = applied.json<{ applicationId: number }>();
    // B không tự duyệt được đơn của mình.
    expect(
      (await post(app, b, '/api/company/applications', { applicationId, approve: true }))
        .statusCode,
    ).toBe(403);
    await post(app, a, '/api/company/applications', { applicationId, approve: true });
    // Đã là người của công ty: kết nối vào thẳng phòng công ty.
    const botA = await Bot.connect(host, a.token);
    const roomA = await botA.waitFor('welcome');
    expect(roomA.room.startsWith('company:')).toBe(true);
    const botB = await Bot.connect(host, b.token);
    const roomB = await botB.waitFor('welcome');
    expect(roomB.room).toBe(roomA.room);
    expect(roomB.players.map((p) => p.name)).toEqual(['Chủ An']);
    const feed =
      (
        await app.inject({ method: 'GET', url: '/api/company/me', headers: a.headers })
      ).json<MyCompanyResponse>().detail?.feed ?? [];
    expect(feed.map((f) => f.kind)).toContain('member_joined');
  });

  it('CEO đặt khung cấp tuyển dụng: ngoài khung không nộp được đơn; vị trí theo cấp; tỉnh/thành hiện ở danh bạ', async () => {
    const { app, a, b, companyId } = await setup();
    const directory = (
      await app.inject({ method: 'GET', url: '/api/company/directory', headers: b.headers })
    ).json<{ companies: { id: string; province: string }[] }>();
    expect(directory.companies.find((c) => c.id === companyId)?.province).toBe('da-nang');

    const bands = {
      intern: null,
      fresher: { min: 2, max: 20 },
      junior: { min: 21, max: 60 },
      middle: null,
      senior: { min: 100, max: 149 },
    };
    // Khung chồng nhau bị từ chối; B không phải CEO thì không đặt được.
    const overlap = await post(app, a, '/api/company/hiring', {
      bands: { ...bands, junior: { min: 10, max: 60 } },
    });
    expect(overlap.statusCode).toBe(400);
    expect((await post(app, b, '/api/company/hiring', { bands })).statusCode).toBe(403);
    expect((await post(app, a, '/api/company/hiring', { bands })).statusCode).toBe(200);

    // B mới cấp 1: chưa vào khung nào.
    const tooLow = await post(app, b, '/api/company/apply', { companyId });
    expect(tooLow.json<{ reason: string }>().reason).toBe('level_band');
    const state = app.game.engine.state(b.userId);
    app.game.engine.save(b.userId, { ...state, xp: xpForLevel(30) });
    const applied = await post(app, b, '/api/company/apply', { companyId });
    expect(applied.statusCode).toBe(200);
    const detail = (
      await app.inject({ method: 'GET', url: '/api/company/me', headers: a.headers })
    ).json<MyCompanyResponse>().detail;
    expect(detail?.applications[0]?.position).toBe('junior');
    expect(detail?.company.hiringBands.intern).toBeNull();
    const { applicationId } = applied.json<{ applicationId: number }>();
    const after = (
      await post(app, a, '/api/company/applications', { applicationId, approve: true })
    ).json<CompanyDetail>();
    expect(after.members.find((m) => m.code === b.code)?.position).toBe('junior');
  });

  it('người ngoài không vào được phòng riêng; bị đuổi và chặn thì không làm gì được nữa', async () => {
    const { app, host, a, b, companyId } = await setup();
    const botB = await Bot.connect(host, b.token);
    await botB.waitFor('welcome');
    botB.send({ type: 'switch_room', roomId: `company:${companyId}` });
    expect((await botB.waitFor('switch_failed')).reason).toBe('forbidden');
    // Vào bằng mã mời, rồi bị đuổi + chặn.
    const { code } = (await post(app, a, '/api/company/invite')).json<{ code: string }>();
    expect((await post(app, b, '/api/company/join', { code })).statusCode).toBe(200);
    expect((await post(app, b, '/api/company/join', { code })).json()).toMatchObject({
      reason: 'bad_code',
    });
    botB.send({ type: 'switch_room', roomId: `company:${companyId}` });
    await botB.waitFor('welcome', (m) => m.room.startsWith('company:'));
    await post(app, a, '/api/company/kick', { code: b.code, ban: true });
    // Bị đưa về văn phòng chung.
    await botB.waitFor('welcome', (m) => m.room.startsWith('office'));
    botB.send({ type: 'switch_room', roomId: `company:${companyId}` });
    expect((await botB.waitFor('switch_failed')).reason).toBe('forbidden');
    expect((await post(app, b, '/api/company/apply', { companyId })).json()).toMatchObject({
      reason: 'banned',
    });
    // B không thao tác được quyền chủ.
    expect((await post(app, b, '/api/company/hire')).statusCode).toBe(403);
  });

  it('chống lạm dụng: giới hạn số đơn mỗi ngày; tài khoản phụ cùng IP không nhận thưởng thăng chức', async () => {
    const { app, a, companyId } = await setup();
    const sameIp = '10.99.0.1';
    // Chủ dùng IP này; tài khoản phụ cũng vậy.
    await app.inject({
      method: 'GET',
      url: '/api/company/me',
      headers: a.headers,
      remoteAddress: sameIp,
    });
    const alt = await player(app, 'Phụ', sameIp);
    await post(app, alt, '/api/company/apply', { companyId }, sameIp);
    const appId = app.game.company.my(a.userId).detail?.applications[0]?.id ?? -1;
    await post(
      app,
      a,
      '/api/company/applications',
      { applicationId: appId, approve: true },
      sameIp,
    );
    const xpBefore = app.game.engine.state(alt.userId).xp;
    await post(app, a, '/api/company/promote', { code: alt.code }, sameIp);
    expect(app.game.engine.state(alt.userId).xp).toBe(xpBefore);
    // Giới hạn đơn mỗi ngày.
    const c = await player(app, 'Châu');
    const others = [];
    for (let i = 0; i < 6; i += 1) {
      const o = await player(app, `Chủ ${String(i)}`);
      makeSenior(app, o.userId);
      await post(app, o, '/api/company/leave');
      others.push(
        (
          await post(app, o, '/api/company/found', { ...FOUND, name: `Công ty số ${String(i)}` })
        ).json<CompanyDetail>().company.id,
      );
    }
    const codes = [];
    for (const id of others)
      codes.push((await post(app, c, '/api/company/apply', { companyId: id })).statusCode);
    expect(codes.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(codes[5]).toBe(422);
  });

  it('mất kết nối giữa chừng: B nộp đơn rồi rớt mạng, A duyệt, B vào lại vẫn vào được phòng công ty', async () => {
    const { app, host, a, b, companyId } = await setup();
    const botB = await Bot.connect(host, b.token);
    await botB.waitFor('welcome');
    const { applicationId } = (await post(app, b, '/api/company/apply', { companyId })).json<{
      applicationId: number;
    }>();
    botB.ws.terminate();
    await post(app, a, '/api/company/applications', { applicationId, approve: true });
    const again = await Bot.connect(host, b.token);
    const w = await again.waitFor('welcome');
    expect(w.room.startsWith('company:')).toBe(true);
    expect(w.you.x).toBeCloseTo(OFFICE_FLOOR.spawn.x);
    expect(app.game.engine.state(b.userId).employer).toBe(`company:${companyId}`);
  });

  it('đang làm công ty nào thì kết nối vào thẳng phòng công ty đó, không vào được văn phòng chung', async () => {
    const { host, a, b, companyId } = await setup();
    const botA = await Bot.connect(host, a.token);
    const first = await botA.waitFor('welcome');
    expect(first.room.startsWith(`company:${companyId}`)).toBe(true);
    botA.send({ type: 'switch_room', roomId: 'office' });
    expect((await botA.waitFor('switch_failed')).reason).toBe('forbidden');
    // Người chưa vào công ty nào vẫn ở văn phòng chung.
    const botB = await Bot.connect(host, b.token);
    expect((await botB.waitFor('welcome')).room.startsWith('office')).toBe(true);
  });
});
