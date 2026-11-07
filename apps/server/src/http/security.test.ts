// Test tấn công cơ bản: token giả, gói tin lạ, gửi dồn, đường dẫn lạ, nguồn lạ, log không lộ token.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { AccountCreatedResponse } from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../app';
import { testConfig, type ServerConfig } from '../config';
import { safeJoin } from './static';

const apps: FastifyInstance[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  for (const a of apps.splice(0)) await a.close();
});

function make(
  overrides: Partial<ServerConfig> = {},
  logStream?: NodeJS.WritableStream,
): FastifyInstance {
  const app = buildApp({
    config: testConfig(overrides),
    gateway: { manualTick: true },
    ...(logStream ? { logStream } : {}),
  });
  apps.push(app);
  return app;
}

async function account(app: FastifyInstance): Promise<AccountCreatedResponse> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/accounts',
    payload: {},
    remoteAddress: `10.3.0.${String(apps.length)}`,
  });
  return res.json<AccountCreatedResponse>();
}

async function listen(app: FastifyInstance): Promise<number> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  return (app.server.address() as AddressInfo).port;
}

function wsStatus(
  port: number,
  token: string,
  headers: Record<string, string> = {},
): Promise<number | 'open'> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/ws?token=${token}`, { headers });
    sockets.push(ws);
    ws.once('open', () => {
      resolve('open');
    });
    ws.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode ?? 0);
    });
    ws.once('error', () => undefined);
  });
}

describe('header an toàn, CORS', () => {
  it('mọi phản hồi có CSP chặt và các header an toàn; API không cache', async () => {
    const app = make();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('CORS chỉ cho nguồn được phép', async () => {
    const app = make({ corsOrigins: ['https://dilam.example'] });
    const ok = await app.inject({
      method: 'GET',
      url: '/api/meta',
      headers: { origin: 'https://dilam.example' },
    });
    expect(ok.headers['access-control-allow-origin']).toBe('https://dilam.example');
    const bad = await app.inject({
      method: 'GET',
      url: '/api/meta',
      headers: { origin: 'https://evil.example' },
    });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await app.inject({
      method: 'OPTIONS',
      url: '/api/me',
      headers: { origin: 'https://dilam.example' },
    });
    expect(pre.statusCode).toBe(204);
  });
});

describe('token và dữ liệu nhạy cảm', () => {
  it('token giả, rác, quá dài, sai định dạng: 401', async () => {
    const app = make();
    for (const header of [
      'Bearer abc',
      'Bearer ' + 'x'.repeat(43),
      'Basic Zm9vOmJhcg==',
      'Bearer ' + 'a'.repeat(500),
      "Bearer ' OR 1=1 --",
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { authorization: header },
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('DB chỉ lưu băm của token và mã khôi phục', async () => {
    const app = make();
    const acc = await account(app);
    const user = app.repos.users.byId(acc.userId);
    expect(user?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(user?.tokenHash).not.toContain(acc.token);
    expect(user?.recoveryHash).not.toContain(acc.recoveryCode);
  });

  it('dò mã khôi phục bị giới hạn tần suất', async () => {
    const app = make();
    const codes: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/accounts/recover',
        payload: { recoveryCode: `DLO-0000-0000-0000-${String(i).padStart(4, '0')}` },
        remoteAddress: '10.4.4.4',
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 8).every((c) => c === 401)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('log không chứa token (kể cả token trong query của WebSocket)', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const app = make({ logLevel: 'debug' }, stream);
    const port = await listen(app);
    const acc = await account(app);
    await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${acc.token}` },
    });
    expect(await wsStatus(port, acc.token)).toBe('open');
    await new Promise((r) => setTimeout(r, 50));
    const all = lines.join('\n');
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toContain(acc.token);
    expect(all).not.toContain(acc.recoveryCode);
  });
});

describe('gói tin lạ, gửi dồn', () => {
  it('body quá lớn: 413; JSON hỏng: 400', async () => {
    const app = make();
    const big = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: 'x'.repeat(70 * 1024),
      headers: { 'content-type': 'application/json' },
    });
    expect(big.statusCode).toBe(413);
    const broken = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: '{"timeZone":',
      headers: { 'content-type': 'application/json' },
    });
    expect(broken.statusCode).toBe(400);
  });

  it('WebSocket: nguồn lạ 403, quá nhiều kết nối từ một IP 429, gửi dồn bị chặn', async () => {
    const app = make({ wsPerIp: 2 });
    const port = await listen(app);
    const acc = await account(app);
    const acc2 = await account(app);
    expect(await wsStatus(port, acc.token, { origin: 'https://evil.example' })).toBe(403);
    expect(await wsStatus(port, acc.token, { origin: `http://127.0.0.1:${String(port)}` })).toBe(
      'open',
    );
    expect(await wsStatus(port, acc2.token)).toBe('open');
    expect(await wsStatus(port, acc.token)).toBe(429);
    // Gửi dồn 200 tin: server chỉ xử lý theo xô token, báo rate_limited.
    // (Kết nối thứ hai cùng tài khoản đã thay kết nối thứ nhất.)
    const ws = sockets[2];
    if (!ws) throw new Error('no socket');
    const got: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- ws client nhận Buffer
    ws.on('message', (d: WebSocket.RawData) => got.push(d.toString()));
    for (let i = 0; i < 200; i += 1) ws.send(JSON.stringify({ type: 'ping', t: i }));
    await new Promise((r) => setTimeout(r, 200));
    expect(got.filter((m) => m.includes('"pong"')).length).toBeLessThan(60);
    expect(got.some((m) => m.includes('rate_limited'))).toBe(true);
  });
});

describe('phục vụ tệp tĩnh', () => {
  it('không đi ra ngoài thư mục; tài nguyên băm cache lâu, HTML không cache', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dilam-static-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
      writeFileSync(join(dir, 'assets', 'a-123.js'), 'console.log(1)');
      const app = make({ clientDist: dir });
      const html = await app.inject({ method: 'GET', url: '/' });
      expect(html.statusCode).toBe(200);
      expect(html.headers['cache-control']).toBe('no-cache');
      const js = await app.inject({ method: 'GET', url: '/assets/a-123.js' });
      expect(js.headers['cache-control']).toContain('immutable');
      expect(js.headers['content-type']).toContain('javascript');
      for (const evil of [
        '/../package.json',
        '/%2e%2e/%2e%2e/etc/passwd',
        '/assets/..%2f..%2fetc%2fpasswd',
        '/%00',
      ]) {
        expect((await app.inject({ method: 'GET', url: evil })).statusCode).toBe(404);
      }
      // Đường dẫn chứa .. bị chuẩn hoá về bên trong thư mục gốc, không thoát ra ngoài.
      expect(safeJoin(dir, '/../x')?.startsWith(dir)).toBe(true);
      expect(safeJoin(dir, '/a\u0000b')).toBeNull();
      expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({
        ok: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
