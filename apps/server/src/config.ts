import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export interface ServerConfig {
  port: number;
  host: string;
  logLevel: LogLevel;
}

/** Đọc cấu hình từ biến môi trường. Ném lỗi rõ ràng nếu giá trị sai. */
export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  // Biến rỗng ("PORT=") coi như không đặt, để dùng giá trị mặc định.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(`Invalid server environment:\n${z.prettifyError(result.error)}`);
  }
  const { PORT, HOST, LOG_LEVEL } = result.data;
  return { port: PORT, host: HOST, logLevel: LOG_LEVEL };
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
