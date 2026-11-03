import type { MeResponse } from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { testConfig, type ServerConfig } from '../config';

const apps: FastifyInstance[] = [];
let ip = 0;

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

function makeApp(overrides: Partial<ServerConfig>): FastifyInstance {
  const app = buildApp({ config: testConfig(overrides), gateway: { manualTick: true } });
  apps.push(app);
  return app;
}

async function register(app: FastifyInstance, username: string): Promise<string> {
  ip += 1;
  const res = await app.inject({
    method: 'POST',
    url: '/api/accounts/register',
    payload: { username, password: 'matkhau123' },
    remoteAddress: `10.9.0.${String(ip)}`,
  });
  return res.json<{ token: string }>().token;
}

async function guest(app: FastifyInstance): Promise<string> {
  ip += 1;
  const res = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    payload: {},
    remoteAddress: `10.9.0.${String(ip)}`,
  });
  return res.json<{ token: string }>().token;
}

const me = async (app: FastifyInstance, token: string): Promise<MeResponse> =>
  (
    await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${token}` },
    })
  ).json<MeResponse>();

const grant = async (app: FastifyInstance, token: string): Promise<number> =>
  (
    await app.inject({
      method: 'POST',
      url: '/api/dev/grant',
      headers: { authorization: `Bearer ${token}` },
      payload: { xp: 200 },
    })
  ).statusCode;

describe('công cụ dev chỉ cho tài khoản trong DEV_USERS', () => {
  it('đúng tên (không phân biệt hoa thường) mới thấy và dùng được; người khác và khách nhận 404', async () => {
    const app = makeApp({ devUsers: ['taitran'] });
    const owner = await register(app, 'TaiTran');
    const other = await register(app, 'nguoikhac');
    const visitor = await guest(app);
    expect((await me(app, owner)).devTools).toBe(true);
    expect((await me(app, other)).devTools).toBe(false);
    expect((await me(app, visitor)).devTools).toBe(false);
    expect(await grant(app, owner)).toBe(200);
    expect((await me(app, owner)).progress.xp).toBe(200);
    expect(await grant(app, other)).toBe(404);
    expect(await grant(app, visitor)).toBe(404);
  });

  it('không đặt DEV_USERS và không bật DEV_TOOLS: không ai dùng được', async () => {
    const app = makeApp({});
    const owner = await register(app, 'taitran');
    expect((await me(app, owner)).devTools).toBe(false);
    expect(await grant(app, owner)).toBe(404);
  });

  it('cộng xu / XP cho người khác theo tên đăng nhập; người thường nhận 404', async () => {
    const app = makeApp({ devUsers: ['taitran'] });
    const admin = await register(app, 'taitran');
    const other = await register(app, 'tung2004');
    const send = (token: string) =>
      app.inject({
        method: 'POST',
        url: '/api/dev/grant-users',
        headers: { authorization: `Bearer ${token}` },
        payload: { usernames: ['Tung2004', 'khongco'], coins: 1000 },
      });
    const res = await send(admin);
    expect(res.json()).toEqual({ granted: ['tung2004'], missing: ['khongco'] });
    expect((await me(app, other)).progress.coins).toBe(1000);
    expect((await send(other)).statusCode).toBe(404);
  });

  it('xoá tài khoản bằng công cụ dev: người bị xoá không vào được nữa; không xoá được chính mình', async () => {
    const app = makeApp({ devUsers: ['taitran'] });
    const admin = await register(app, 'taitran');
    const other = await register(app, 'tung2004');
    const del = (name: string) =>
      app.inject({
        method: 'POST',
        url: '/api/dev/delete-user',
        headers: { authorization: `Bearer ${admin}` },
        payload: { name },
      });
    expect((await del('taitran')).statusCode).toBe(400);
    expect((await del('khongco')).statusCode).toBe(404);
    expect((await del('Tung2004')).statusCode).toBe(200);
    const after = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${other}` },
    });
    expect(after.statusCode).toBe(401);
  });
});
