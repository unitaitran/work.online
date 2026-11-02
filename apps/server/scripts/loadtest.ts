// Tải thử: N bot kết nối vào CÙNG một phòng, đi lại, thỉnh thoảng biểu cảm, đo băng thông,
// độ trễ (ping/pong), CPU và bộ nhớ của tiến trình server.
//
//   npx tsx scripts/loadtest.ts [số bot=100] [số giây=30]
//   GEAR=1: mỗi bot mặc áo, nón, phụ kiện và dắt thú cưng (đo ảnh hưởng ở client).
//   PORT=3000: chạy server ở cổng cố định để mở thêm trình duyệt vào xem.
//
// Script tạo tài khoản thẳng vào một file SQLite tạm (không qua giới hạn tạo tài khoản theo IP),
// rồi chạy server thật ở tiến trình con trỏ vào file đó.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseServerMessage, SHOP_ITEMS, STATE_SEND_HZ, type ServerMessage } from '@dilam/shared';
import WebSocket from 'ws';
import { openDatabase } from '../src/db/database';
import { createSqliteRepositories } from '../src/db/repositories';
import { createAccountService } from '../src/game/accounts';

const BOTS = Number(process.argv[2] ?? 100);
const SECONDS = Number(process.argv[3] ?? 30);
const PORT = Number(process.env.PORT ?? 3900 + Math.floor(Math.random() * 90));
const GEAR = process.env.GEAR === '1';
const serverDir = fileURLToPath(new URL('..', import.meta.url));

const dir = mkdtempSync(join(tmpdir(), 'dilam-load-'));
const dbPath = join(dir, 'load.sqlite');

// 1. Tạo tài khoản + nhân vật cho bot.
const db = openDatabase(dbPath);
const repos = createSqliteRepositories(db);
const accounts = createAccountService(repos, { tokenTtlDays: 1 });
const tokens: string[] = [];
for (let i = 0; i < BOTS; i += 1) {
  const { userId, token } = accounts.create('Asia/Ho_Chi_Minh');
  repos.characters.save(
    userId,
    {
      name: `Bot ${String(i + 1)}`,
      appearance: { skin: i % 4, hairStyle: 'short', hairColor: i % 5, outfit: 'shirt' },
    },
    Date.now(),
  );
  if (GEAR) {
    const pick = (cat: string) => {
      const items = SHOP_ITEMS.filter((item) => item.category === cat);
      return items[i % items.length]?.id ?? '';
    };
    const ids = ['top', 'hat', 'accessory', 'pet'].map(pick);
    for (const id of ids) repos.inventory.add(userId, id, Date.now());
    repos.inventory.setEquipped(userId, ids);
  }
  tokens.push(token);
}
db.close();

// 2. Chạy server thật.
const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DB_PATH: dbPath,
    LOG_LEVEL: 'warn',
    ROOM_CAPACITY: String(Math.max(BOTS, 40)),
    SERVER_CAPACITY: String(BOTS + 10),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const serverPid = server.pid ?? 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${String(PORT)}/api/health`);
      if (res.ok) return;
    } catch {
      // chưa lên
    }
    await sleep(100);
  }
  throw new Error('server did not start');
}

/** CPU (giây) và RSS (MB) của tiến trình server, đọc từ /proc (Linux). */
function serverUsage(): { cpuSec: number; rssMb: number } {
  try {
    const stat = readFileSync(`/proc/${String(serverPid)}/stat`, 'utf8').split(' ');
    const ticks = Number(stat[13]) + Number(stat[14]);
    const rssPages = Number(stat[23]);
    return { cpuSec: ticks / 100, rssMb: (rssPages * 4096) / 1024 / 1024 };
  } catch {
    return { cpuSec: Number.NaN, rssMb: Number.NaN };
  }
}

interface BotStats {
  bytesIn: number;
  bytesOut: number;
  messagesIn: number;
  rtts: number[];
  corrections: number;
  rooms: Set<string>;
}

async function runBot(token: string, index: number, stats: BotStats): Promise<() => void> {
  const ws = new WebSocket(`ws://127.0.0.1:${String(PORT)}/ws?token=${token}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => {
      resolve();
    });
    ws.once('error', reject);
  });
  // Đi lại trong khu trống giữa văn phòng.
  let x = -1 + (index % 9);
  let z = 1 + (index % 5);
  let target = { x, z };
  let lastSentAt = Date.now();
  const send = (message: unknown): void => {
    const text = JSON.stringify(message);
    stats.bytesOut += text.length;
    ws.send(text);
  };
  ws.on('message', (data: WebSocket.RawData) => {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- ws client nhận Buffer
    const text = data.toString();
    stats.bytesIn += text.length;
    stats.messagesIn += 1;
    const parsed = parseServerMessage(text);
    if (!parsed.ok) return;
    const m: ServerMessage = parsed.value;
    if (m.type === 'welcome') {
      stats.rooms.add(m.room);
      x = m.you.x;
      z = m.you.z;
    } else if (m.type === 'pong') stats.rtts.push(Date.now() - m.t);
    else if (m.type === 'correct') {
      stats.corrections += 1;
      x = m.x;
      z = m.z;
    }
  });
  const move = setInterval(() => {
    const now = Date.now();
    const dt = (now - lastSentAt) / 1000;
    lastSentAt = now;
    const dx = target.x - x;
    const dz = target.z - z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) target = { x: -1 + Math.random() * 9, z: 0.5 + Math.random() * 5 };
    else {
      const step = Math.min(d, 2.2 * dt);
      x += (dx / d) * step;
      z += (dz / d) * step;
    }
    send({ type: 'state', x, z, facing: Math.atan2(dx, dz), pose: d < 0.1 ? 'stand' : 'walk' });
  }, 1000 / STATE_SEND_HZ);
  const extra = setInterval(() => {
    send({ type: 'ping', t: Date.now() });
    if (Math.random() < 0.2) send({ type: 'emote', emote: 'wave' });
  }, 1000);
  return () => {
    clearInterval(move);
    clearInterval(extra);
    ws.close();
  };
}

try {
  await waitForServer();
  const stats: BotStats = {
    bytesIn: 0,
    bytesOut: 0,
    messagesIn: 0,
    rtts: [],
    corrections: 0,
    rooms: new Set(),
  };
  const idle = serverUsage();
  const stops: (() => void)[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    stops.push(await runBot(tokens[i] ?? '', i, stats));
  }
  await sleep(2000);
  // Đo từ lúc mọi bot đã vào và chạy ổn định.
  const start = serverUsage();
  const startAt = Date.now();
  stats.bytesIn = 0;
  stats.bytesOut = 0;
  stats.messagesIn = 0;
  stats.rtts = [];
  await sleep(SECONDS * 1000);
  const end = serverUsage();
  const elapsed = (Date.now() - startAt) / 1000;
  for (const stop of stops) stop();

  const sorted = [...stats.rtts].sort((a, b) => a - b);
  const pct = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const report = {
    bots: BOTS,
    rooms: [...stats.rooms],
    seconds: Math.round(elapsed),
    downKBpsPerPlayer: +(stats.bytesIn / elapsed / BOTS / 1024).toFixed(2),
    upKBpsPerPlayer: +(stats.bytesOut / elapsed / BOTS / 1024).toFixed(2),
    messagesPerSecPerPlayer: +(stats.messagesIn / elapsed / BOTS).toFixed(1),
    rttMs: { p50: pct(0.5), p95: pct(0.95), max: sorted.at(-1) ?? 0 },
    serverCpuPercent: +(((end.cpuSec - start.cpuSec) / elapsed) * 100).toFixed(1),
    serverRssMb: { idle: +idle.rssMb.toFixed(1), loaded: +end.rssMb.toFixed(1) },
    corrections: stats.corrections,
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  server.kill('SIGTERM');
  await sleep(300);
  rmSync(dir, { recursive: true, force: true });
}
