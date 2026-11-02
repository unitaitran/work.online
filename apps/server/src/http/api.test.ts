import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProgress,
  encodeSaveCode,
  xpForLevel,
  type AccountCreatedResponse,
  type MeResponse,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { testConfig, type ServerConfig } from '../config';

const DAY = 86_400_000;
let clock = Date.UTC(2026, 10, 2, 3);
const apps: FastifyInstance[] = [];

function makeApp(overrides: Partial<ServerConfig> = {}): FastifyInstance {
  const app = buildApp({ config: testConfig(overrides), now: () => clock });
  apps.push(app);
  return app;
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  clock = Date.UTC(2026, 10, 2, 3);
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function createAccount(
  app: FastifyInstance,
  ip = '10.0.0.1',
): Promise<AccountCreatedResponse> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    payload: { timeZone: 'Asia/Ho_Chi_Minh' },
    remoteAddress: ip,
  });
  expect(res.statusCode).toBe(201);
  return res.json<AccountCreatedResponse>();
}

describe('tài khoản', () => {
  it('tạo tài khoản: token + mã khôi phục dễ đọc; /api/me đọc được', async () => {
    const app = makeApp();
    const acc = await createAccount(app);
    expect(acc.token.length).toBeGreaterThanOrEqual(40);
    expect(acc.recoveryCode).toMatch(/^DLO(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: auth(acc.token) });
    expect(me.statusCode).toBe(200);
    const body = me.json<MeResponse>();
    expect(body.userId).toBe(acc.userId);
    expect(body.playerCode).toMatch(/^NV-[0-9A-F]{6}$/);
    expect(body.character).toBeNull();
    expect(body.progress.xp).toBe(0);
  });

  it('token sai, thiếu, hoặc hết hạn: 401', async () => {
    const app = makeApp({ tokenTtlDays: 1 });
    const acc = await createAccount(app);
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    const bad = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: auth('x'.repeat(43)),
    });
    expect(bad.statusCode).toBe(401);
    clock += 2 * DAY;
    const expired = await app.inject({ method: 'GET', url: '/api/me', headers: auth(acc.token) });
    expect(expired.statusCode).toBe(401);
  });

  it('đăng nhập lại bằng mã khôi phục (gõ thường, thiếu gạch): token mới, token cũ mất hiệu lực', async () => {
    const app = makeApp();
    const acc = await createAccount(app);
    const typed = acc.recoveryCode.toLowerCase().replace(/-/g, ' ');
    const res = await app.inject({
      method: 'POST',
      url: '/api/accounts/recover',
      payload: { recoveryCode: typed },
    });
    expect(res.statusCode).toBe(200);
    const { token, userId } = res.json<{ token: string; userId: string }>();
    expect(userId).toBe(acc.userId);
    expect(token).not.toBe(acc.token);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: auth(acc.token) })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: auth(token) })).statusCode,
    ).toBe(200);
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/accounts/recover',
      payload: { recoveryCode: 'DLO-0000-0000-0000-0000' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('vượt giới hạn tạo tài khoản theo IP: 429', async () => {
    const app = makeApp();
    for (let i = 0; i < 5; i += 1) await createAccount(app, '10.0.0.9');
    const res = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: {},
      remoteAddress: '10.0.0.9',
    });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    // IP khác vẫn tạo được.
    await createAccount(app, '10.0.0.10');
  });

  it('vượt giới hạn ghi theo tài khoản: 429', async () => {
    const app = makeApp();
    const acc = await createAccount(app);
    const payload = {
      name: 'An',
      appearance: { skin: 0, hairStyle: 'bun', hairColor: 1, outfit: 'suit' },
    };
    const codes: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/me/character',
        headers: auth(acc.token),
        payload,
        remoteAddress: `10.1.0.${String(i)}`,
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('nhân vật', () => {
  it('lưu và đọc lại; tên được chuẩn hoá; tên tục hoặc dữ liệu sai bị từ chối', async () => {
    const app = makeApp();
    const acc = await createAccount(app);
    const put = (payload: unknown) =>
      app.inject({
        method: 'PUT',
        url: '/api/me/character',
        headers: auth(acc.token),
        payload: payload as object,
      });
    const ok = await put({
      name: '  Nguyễn   Văn  A ',
      appearance: { skin: 2, hairStyle: 'long', hairColor: 4, outfit: 'hoodie' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<MeResponse>().character).toEqual({
      name: 'Nguyễn Văn A',
      appearance: { skin: 2, hairStyle: 'long', hairColor: 4, outfit: 'hoodie' },
    });
    const rude = await put({
      name: 'vcl',
      appearance: { skin: 0, hairStyle: 'bun', hairColor: 0, outfit: 'suit' },
    });
    expect(rude.statusCode).toBe(422);
    expect(rude.json()).toEqual({ error: 'rejected', reason: 'profanity' });
    expect(
      (
        await put({
          name: 'A',
          appearance: { skin: 9, hairStyle: 'bun', hairColor: 0, outfit: 'suit' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await put({
          name: 'A',
          appearance: { skin: 0, hairStyle: 'bun', hairColor: 0, outfit: 'suit' },
          xp: 999,
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('nhập tiến độ từ mã lưu cục bộ', () => {
  const codeFor = (xp: number, ageDays: number) =>
    encodeSaveCode({ ...createProgress(clock - ageDays * DAY), xp, coins: Math.floor(xp / 2) });

  it('mã hợp lệ: nhập một lần, giữ XP; lần hai bị từ chối', async () => {
    const app = makeApp();
    const acc = await createAccount(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/import',
      headers: auth(acc.token),
      payload: { saveCode: codeFor(500, 3) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<MeResponse>().progress.xp).toBe(500);
    expect(res.json<MeResponse>().imported).toBe(true);
    const again = await app.inject({
      method: 'POST',
      url: '/api/me/import',
      headers: auth(acc.token),
      payload: { saveCode: codeFor(100, 3) },
    });
    expect(again.statusCode).toBe(409);
  });

  it('cấp cao bất thường, sai checksum: từ chối, không đụng dữ liệu', async () => {
    const app = makeApp();
    const acc = await createAccount(app);
    const tooHigh = await app.inject({
      method: 'POST',
      url: '/api/me/import',
      headers: auth(acc.token),
      payload: { saveCode: codeFor(xpForLevel(140), 1) },
    });
    expect(tooHigh.statusCode).toBe(422);
    expect(tooHigh.json()).toEqual({ error: 'rejected', reason: 'too_high' });
    const good = codeFor(300, 2);
    const broken = `${good.slice(0, -1)}${good.endsWith('0') ? '1' : '0'}`;
    const bad = await app.inject({
      method: 'POST',
      url: '/api/me/import',
      headers: auth(acc.token),
      payload: { saveCode: broken },
    });
    expect(bad.json()).toEqual({ error: 'rejected', reason: 'checksum' });
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: auth(acc.token) });
    expect(me.json<MeResponse>().progress.xp).toBe(0);
    expect(me.json<MeResponse>().imported).toBe(false);
  });
});

describe('thông tin công khai', () => {
  it('/api/meta và /api/capacity', async () => {
    const app = makeApp();
    const meta = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(meta.json()).toMatchObject({ maxLevel: 500, companyUnlockLevel: 150 });
    expect(meta.json<{ titles: unknown[] }>().titles).toHaveLength(13);
    const cap = await app.inject({ method: 'GET', url: '/api/capacity' });
    expect(cap.json()).toEqual({ online: 0, limit: 400, busy: false });
  });
});

describe('lưu trữ', () => {
  it('khởi động lại server vẫn giữ tài khoản, nhân vật, tiến độ', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dilam-'));
    try {
      const dbPath = join(dir, 'test.sqlite');
      const a = makeApp({ dbPath });
      const acc = await createAccount(a);
      await a.inject({
        method: 'PUT',
        url: '/api/me/character',
        headers: auth(acc.token),
        payload: {
          name: 'Bình',
          appearance: { skin: 1, hairStyle: 'short', hairColor: 0, outfit: 'shirt' },
        },
      });
      await a.close();
      const b = makeApp({ dbPath });
      const me = await b.inject({ method: 'GET', url: '/api/me', headers: auth(acc.token) });
      expect(me.statusCode).toBe(200);
      expect(me.json<MeResponse>().character?.name).toBe('Bình');
      await b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('mã khôi phục mới, xoá tài khoản', () => {
  it('tạo mã mới: mã cũ hết hiệu lực, mã mới dùng được', async () => {
    const app = makeApp();
    const acc = await createAccount(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/recovery',
      headers: auth(acc.token),
    });
    const { recoveryCode } = res.json<{ recoveryCode: string }>();
    expect(recoveryCode).not.toBe(acc.recoveryCode);
    const old = await app.inject({
      method: 'POST',
      url: '/api/accounts/recover',
      payload: { recoveryCode: acc.recoveryCode },
    });
    expect(old.statusCode).toBe(401);
    const fresh = await app.inject({
      method: 'POST',
      url: '/api/accounts/recover',
      payload: { recoveryCode },
    });
    expect(fresh.statusCode).toBe(200);
  });

  it('xoá tài khoản: 204, token và mã khôi phục không dùng được nữa', async () => {
    const app = makeApp();
    const acc = await createAccount(app);
    const del = await app.inject({ method: 'DELETE', url: '/api/me', headers: auth(acc.token) });
    expect(del.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: auth(acc.token) })).statusCode,
    ).toBe(401);
    const rec = await app.inject({
      method: 'POST',
      url: '/api/accounts/recover',
      payload: { recoveryCode: acc.recoveryCode },
    });
    expect(rec.statusCode).toBe(401);
  });
});

describe('đăng ký, đăng nhập, chơi khách', () => {
  const post = (app: FastifyInstance, url: string, payload: unknown, token?: string) =>
    app.inject({
      method: 'POST',
      url,
      payload: payload as Record<string, unknown>,
      ...(token ? { headers: auth(token) } : {}),
    });

  it('khách nâng cấp thành tài khoản: giữ tiến độ, đăng nhập lại được ở máy khác', async () => {
    const app = makeApp();
    const guest = await post(app, '/api/accounts', { guest: true });
    expect(guest.statusCode).toBe(201);
    const { token, userId } = guest.json<AccountCreatedResponse>();
    let me = (
      await app.inject({ method: 'GET', url: '/api/me', headers: auth(token) })
    ).json<MeResponse>();
    expect(me.guest).toBe(true);
    expect(me.username).toBeNull();

    const reg = await post(
      app,
      '/api/accounts/register',
      { username: '  Lan.Anh_99 ', password: 'matkhau123' },
      token,
    );
    expect(reg.statusCode).toBe(200);
    me = reg.json<MeResponse>();
    expect(me.userId).toBe(userId);
    expect(me.username).toBe('lan.anh_99');
    expect(me.guest).toBe(false);

    const wrong = await post(app, '/api/accounts/login', {
      username: 'lan.anh_99',
      password: 'sai-mat-khau',
    });
    expect(wrong.statusCode).toBe(401);
    const login = await post(app, '/api/accounts/login', {
      username: 'LAN.ANH_99',
      password: 'matkhau123',
    });
    expect(login.statusCode).toBe(200);
    const fresh = login.json<{ userId: string; token: string }>();
    expect(fresh.userId).toBe(userId);
    // Token cũ hết hiệu lực khi đăng nhập ở nơi khác.
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: auth(token) })).statusCode,
    ).toBe(401);
    // Đăng xuất tài khoản thật: chỉ huỷ token, đăng nhập lại vẫn còn.
    const out = await post(app, '/api/accounts/logout', {}, fresh.token);
    expect(out.json<{ deleted: boolean }>().deleted).toBe(false);
    expect(
      (await post(app, '/api/accounts/login', { username: 'lan.anh_99', password: 'matkhau123' }))
        .statusCode,
    ).toBe(200);
  });

  it('đăng ký mới: tên trùng, tên xấu, mật khẩu ngắn bị từ chối; đăng ký lần hai bị chặn', async () => {
    const app = makeApp();
    const first = await post(app, '/api/accounts/register', {
      username: 'minhtu',
      password: '12345678',
    });
    expect(first.statusCode).toBe(201);
    const { token } = first.json<{ token: string }>();
    expect(
      (await post(app, '/api/accounts/register', { username: 'MinhTu', password: '12345678' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await post(app, '/api/accounts/register', { username: 'ab', password: '12345678' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post(app, '/api/accounts/register', { username: 'hoa_mai', password: '123' }))
        .statusCode,
    ).toBe(400);
    const again = await post(
      app,
      '/api/accounts/register',
      { username: 'ten_khac', password: '12345678' },
      token,
    );
    expect(again.statusCode).toBe(409);
    expect(again.json<{ reason: string }>().reason).toBe('already_registered');
  });

  it('khách đăng xuất là mất tài khoản; khách bỏ đi lâu thì server tự dọn', async () => {
    const app = makeApp();
    const a = (await post(app, '/api/accounts', { guest: true })).json<AccountCreatedResponse>();
    const out = await post(app, '/api/accounts/logout', {}, a.token);
    expect(out.json<{ deleted: boolean }>().deleted).toBe(true);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: auth(a.token) })).statusCode,
    ).toBe(401);

    const b = (await post(app, '/api/accounts', { guest: true })).json<AccountCreatedResponse>();
    const kept = await createAccount(app);
    clock += 7 * 3_600_000;
    const removed = (
      app as unknown as { repos: { users: { staleGuests(before: number): string[] } } }
    ).repos.users.staleGuests(clock - 6 * 3_600_000);
    expect(removed).toEqual([b.userId]);
    expect(removed).not.toContain(kept.userId);
  });

  it('dò mật khẩu: bị giới hạn theo tên đăng nhập', async () => {
    const app = makeApp();
    await post(app, '/api/accounts/register', { username: 'thuha', password: '12345678' });
    const codes: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/accounts/login',
        payload: { username: 'thuha', password: `sai${String(i)}aaaa` },
        remoteAddress: `10.1.0.${String(i)}`,
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 6).every((c) => c === 401)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});
