import type { AddressInfo } from 'node:net';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  WS_PATH,
  parseServerMessage,
  type ServerMessage,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from './app';
import { testConfig } from './config';
import type { GatewayOptions } from './ws/gateway';

const FIXED_NOW = 1_762_070_400_000;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function startServer(gateway: GatewayOptions = {}): Promise<string> {
  app = buildApp({ config: testConfig(), gateway: { now: () => FIXED_NOW, ...gateway } });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  return `ws://127.0.0.1:${String(port)}`;
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => {
      resolve(ws);
    });
    ws.once('error', reject);
  });
}

function nextMessage(ws: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data: WebSocket.RawData) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- ws client nhận Buffer
      const parsed = parseServerMessage(data.toString());
      if (parsed.ok) resolve(parsed.value);
      else reject(new Error('server sent an invalid message'));
    });
  });
}

function waitForClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.once('close', (code: number) => {
      resolve(code);
    });
  });
}

describe('GET /api/health', () => {
  it('trả về { ok: true }', async () => {
    app = buildApp({ config: testConfig() });
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe(`WebSocket ${WS_PATH}`, () => {
  it('trả lại tin echo kèm giờ server', async () => {
    const ws = await connect(`${await startServer()}${WS_PATH}`);
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'echo', text: 'Chào buổi sáng!' }));
    expect(await reply).toEqual({ type: 'echo', text: 'Chào buổi sáng!', serverTime: FIXED_NOW });
    ws.close();
  });

  it('báo bad_message khi tin sai schema, kết nối vẫn dùng được', async () => {
    const ws = await connect(`${await startServer()}${WS_PATH}`);

    const first = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'grant_xp', amount: 99_999 }));
    expect(await first).toEqual({ type: 'error', code: 'bad_message' });

    const second = nextMessage(ws);
    ws.send('không phải JSON');
    expect(await second).toEqual({ type: 'error', code: 'bad_message' });

    const third = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'echo', text: 'vẫn ổn' }));
    expect(await third).toMatchObject({ type: 'echo', text: 'vẫn ổn' });
    ws.close();
  });

  it('báo bad_message khi gửi dữ liệu nhị phân', async () => {
    const ws = await connect(`${await startServer()}${WS_PATH}`);
    const reply = nextMessage(ws);
    ws.send(Buffer.from([1, 2, 3]), { binary: true });
    expect(await reply).toEqual({ type: 'error', code: 'bad_message' });
    ws.close();
  });

  it('đóng kết nối (1009) khi tin vượt giới hạn kích thước', async () => {
    const ws = await connect(`${await startServer()}${WS_PATH}`);
    const closed = waitForClose(ws);
    ws.send('x'.repeat(MAX_CLIENT_MESSAGE_BYTES + 1));
    expect(await closed).toBe(1009);
  });

  it('báo rate_limited một lần khi gửi dồn quá nhanh', async () => {
    const url = await startServer({ rateLimit: { capacity: 2, refillPerSecond: 0 } });
    const ws = await connect(`${url}${WS_PATH}`);

    const received: ServerMessage[] = [];
    ws.on('message', (data: WebSocket.RawData) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- ws client nhận Buffer
      const parsed = parseServerMessage(data.toString());
      if (parsed.ok) received.push(parsed.value);
    });

    for (let i = 0; i < 5; i += 1) {
      ws.send(JSON.stringify({ type: 'echo', text: `tin ${String(i)}` }));
    }
    // 2 tin đầu được trả lời, tin thứ 3 nhận lỗi rate_limited, 2 tin sau bị bỏ qua im lặng.
    await expect.poll(() => received.length).toBe(3);

    expect(received.map((m) => m.type)).toEqual(['echo', 'echo', 'error']);
    expect(received[2]).toEqual({ type: 'error', code: 'rate_limited' });
    ws.close();
  });

  it('từ chối nâng cấp WebSocket ở đường dẫn khác', async () => {
    const url = await startServer();
    await expect(connect(`${url}/khong-phai-ws`)).rejects.toThrow();
  });
});
