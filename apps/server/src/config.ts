import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const boolish = z
  .enum(['0', '1', 'true', 'false'])
  .transform((value) => value === '1' || value === 'true');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  /** Đường dẫn file SQLite (":memory:" khi thử). */
  DB_PATH: z.string().trim().min(1).default('data/dilam.sqlite'),
  /** Token hết hạn sau chừng này ngày không dùng (gia hạn trượt mỗi lần dùng). */
  TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  /** Số người tối đa mỗi phòng văn phòng chung. */
  ROOM_CAPACITY: z.coerce.number().int().min(2).max(500).default(40),
  /** Số người online tối đa toàn server. */
  SERVER_CAPACITY: z.coerce.number().int().min(1).max(100_000).default(400),
  /** Khoá trang quản trị (bỏ trống = tắt trang quản trị). Tối thiểu 24 ký tự. */
  ADMIN_KEY: z.string().min(24).optional(),
  /** Đứng sau reverse proxy (Caddy/Nginx): tin X-Forwarded-For để lấy IP thật. */
  TRUST_PROXY: boolish.default(false),
  /** Nguồn được phép gọi API (CORS), phân tách bằng dấu phẩy. Bỏ trống = chỉ cùng nguồn. */
  CORS_ORIGINS: z.string().optional(),
  /** Bật API dev (tua ngày, cộng XP). CHỈ dùng khi phát triển. */
  DEV_TOOLS: boolish.default(false),
});

export interface ServerConfig {
  port: number;
  host: string;
  logLevel: LogLevel;
  dbPath: string;
  tokenTtlDays: number;
  roomCapacity: number;
  serverCapacity: number;
  adminKey: string | null;
  trustProxy: boolean;
  corsOrigins: string[];
  devTools: boolean;
}

/** Đọc cấu hình từ biến môi trường. Ném lỗi rõ ràng nếu giá trị sai. */
export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  // Biến rỗng ("PORT=") coi như không đặt, để dùng giá trị mặc định.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(`Invalid server environment:\n${z.prettifyError(result.error)}`);
  }
  const d = result.data;
  return {
    port: d.PORT,
    host: d.HOST,
    logLevel: d.LOG_LEVEL,
    dbPath: d.DB_PATH,
    tokenTtlDays: d.TOKEN_TTL_DAYS,
    roomCapacity: d.ROOM_CAPACITY,
    serverCapacity: d.SERVER_CAPACITY,
    adminKey: d.ADMIN_KEY ?? null,
    trustProxy: d.TRUST_PROXY,
    corsOrigins: (d.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    devTools: d.DEV_TOOLS,
  };
}

/** Cấu hình mặc định cho test (DB trong bộ nhớ, không log). */
export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return { ...loadConfig({ LOG_LEVEL: 'silent', DB_PATH: ':memory:' }), ...overrides };
}

/** Nạp file .env nếu có. Không có file thì bỏ qua; biến đã đặt sẵn không bị ghi đè. */
export function loadDotEnvIfPresent(path: string): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
