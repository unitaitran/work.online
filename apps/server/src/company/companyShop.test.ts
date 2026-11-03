// Cửa hàng công ty: mua đồ bằng quỹ, đổi tên, đồng phục (mỗi người tự chọn mặc).
import {
  xpForLevel,
  type AccountCreatedResponse,
  type CompanyDetail,
  type CompanyPublic,
  type MeResponse,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { testConfig } from '../config';
import { publicProfile } from '../rooms/profile';

const apps: FastifyInstance[] = [];
let ip = 0;

afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
});

function makeApp(): FastifyInstance {
  const app = buildApp({ config: testConfig({}), gateway: { manualTick: true } });
  apps.push(app);
  return app;
}

interface Player {
  userId: string;
  code: string;
  headers: { authorization: string };
}

async function player(app: FastifyInstance, name: string): Promise<Player> {
  ip += 1;
  const remoteAddress = `10.9.${String(ip >> 8)}.${String(ip & 255)}`;
  const acc = (
    await app.inject({ method: 'POST', url: '/api/accounts', payload: {}, remoteAddress })
  ).json<AccountCreatedResponse>();
  const headers = { authorization: `Bearer ${acc.token}` };
  await app.inject({
    method: 'PUT',
    url: '/api/me/character',
    headers,
    remoteAddress,
    payload: { name, appearance: { skin: 0, hairStyle: 'bun', hairColor: 0, outfit: 'suit' } },
  });
  const me = await app.inject({ method: 'GET', url: '/api/me', headers });
  return { userId: acc.userId, code: me.json<MeResponse>().playerCode, headers };
}

const post = (app: FastifyInstance, p: Player, url: string, payload?: object) =>
  app.inject({ method: 'POST', url, headers: p.headers, ...(payload ? { payload } : {}) });

/** Chủ công ty có quỹ 10.000 xu (25% của 40.000 xu đã kiếm). */
async function owner(app: FastifyInstance): Promise<Player> {
  const a = await player(app, 'An');
  const state = app.game.engine.state(a.userId);
  app.game.engine.save(a.userId, { ...state, xp: xpForLevel(150), coins: 40000 });
  app.repos.ledger.add(a.userId, Date.now(), 40000, 'earn:test', 40000);
  await post(app, a, '/api/company/leave');
  const res = await post(app, a, '/api/company/found', {
    name: 'Bánh Bao Vui Vẻ',
    industry: 'cafe',
    color: 1,
    icon: 'cup',
  });
  expect(res.json<CompanyDetail>().economy.treasury).toBe(10000);
  return a;
}

describe('cửa hàng công ty', () => {
  it('mua đồ trừ quỹ, không mua trùng, thiếu quỹ thì từ chối; nhân viên không mua được', async () => {
    const app = makeApp();
    const a = await owner(app);
    const res = await post(app, a, '/api/company/shop/buy', { perk: 'massage' });
    const d = res.json<CompanyDetail>();
    expect(d.economy.treasury).toBe(10000 - 1500);
    expect(d.company.perks).toEqual(['massage']);
    expect((await post(app, a, '/api/company/shop/buy', { perk: 'massage' })).json()).toMatchObject(
      { reason: 'owned' },
    );
    // Phòng công ty công khai danh sách đồ (để dựng cảnh).
    const info = await app.inject({
      method: 'GET',
      url: `/api/company/info/${d.company.id}`,
      headers: a.headers,
    });
    expect(info.json<CompanyPublic>().perks).toEqual(['massage']);
    // Quỹ còn 8.500: mua thêm 3 món (1.200 + 900 + 2.000) còn 4.400.
    await post(app, a, '/api/company/shop/buy', { perk: 'console' });
    await post(app, a, '/api/company/shop/buy', { perk: 'deskDecor' });
    const all = (
      await post(app, a, '/api/company/shop/buy', { perk: 'uniform', color: 3 })
    ).json<CompanyDetail>();
    expect(all.economy.treasury).toBe(4400);
    expect(all.economy.uniformColor).toBe(3);

    const b = await player(app, 'Bình');
    const { code } = (await post(app, a, '/api/company/invite')).json<{ code: string }>();
    await post(app, b, '/api/company/join', { code });
    expect((await post(app, b, '/api/company/shop/buy', { perk: 'console' })).statusCode).toBe(403);
  });

  it('đổi tên: qua bộ lọc, trừ quỹ, ghi bảng tin', async () => {
    const app = makeApp();
    const a = await owner(app);
    expect(
      (await post(app, a, '/api/company/shop/rename', { name: 'Google Việt' })).json(),
    ).toMatchObject({ reason: 'brand' });
    const d = (
      await post(app, a, '/api/company/shop/rename', { name: 'Bánh Mì Hạnh Phúc' })
    ).json<CompanyDetail>();
    expect(d.company.name).toBe('Bánh Mì Hạnh Phúc');
    expect(d.economy.treasury).toBe(10000 - 600);
    expect(d.feed.some((f) => f.kind === 'renamed')).toBe(true);
  });

  it('đồng phục: mỗi người tự chọn mặc; hồ sơ trong phòng đổi màu áo', async () => {
    const app = makeApp();
    const a = await owner(app);
    expect((await post(app, a, '/api/company/uniform', { wear: true })).statusCode).toBe(404);
    await post(app, a, '/api/company/shop/buy', { perk: 'uniform', color: 2 });
    const b = await player(app, 'Bình');
    const { code } = (await post(app, a, '/api/company/invite')).json<{ code: string }>();
    await post(app, b, '/api/company/join', { code });

    const worn = (await post(app, b, '/api/company/uniform', { wear: true })).json<CompanyDetail>();
    expect(worn.wearingUniform).toBe(true);
    expect(publicProfile(app.repos, b.userId).uniform).toBe(worn.company.uniform);
    // Chủ chưa chọn mặc: áo riêng.
    expect(publicProfile(app.repos, a.userId).uniform).toBeUndefined();

    const off = (await post(app, b, '/api/company/uniform', { wear: false })).json<CompanyDetail>();
    expect(off.wearingUniform).toBe(false);
    expect(publicProfile(app.repos, b.userId).uniform).toBeUndefined();
  });
});
