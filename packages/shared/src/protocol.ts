import { z } from 'zod';

/** Đường dẫn WebSocket trên server (dev: Vite chuyển tiếp tới server). */
export const WS_PATH = '/ws';

/** Kích thước tối đa một tin client gửi lên (byte). Server cắt kết nối nếu vượt. */
export const MAX_CLIENT_MESSAGE_BYTES = 2048;

/** Độ dài tối đa của chuỗi trong tin echo (Phase 0: thử kết nối). */
export const MAX_ECHO_TEXT_LENGTH = 200;

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

export const clientEchoSchema = z.strictObject({
  type: z.literal('echo'),
  text: z.string().trim().min(1).max(MAX_ECHO_TEXT_LENGTH),
});

export const clientMessageSchema = z.discriminatedUnion('type', [clientEchoSchema]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

export const serverErrorCodeSchema = z.enum(['bad_message', 'rate_limited']);
export type ServerErrorCode = z.infer<typeof serverErrorCodeSchema>;

export const serverEchoSchema = z.strictObject({
  type: z.literal('echo'),
  text: z.string(),
  /** Giờ server lúc trả lời, tính bằng mili giây từ epoch (UTC). */
  serverTime: z.number().int().nonnegative(),
});

export const serverErrorSchema = z.strictObject({
  type: z.literal('error'),
  code: serverErrorCodeSchema,
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  serverEchoSchema,
  serverErrorSchema,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

// ---------------------------------------------------------------------------
// Đọc tin từ chuỗi JSON
// ---------------------------------------------------------------------------

export type ParseResult<T> = { ok: true; value: T } | { ok: false };

function parseJsonWith<T>(schema: z.ZodType<T>, raw: string): ParseResult<T> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const result = schema.safeParse(data);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

/** Server dùng: kiểm tra một tin thô từ client. Không bao giờ ném lỗi. */
export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  return parseJsonWith(clientMessageSchema, raw);
}

/** Client dùng: kiểm tra một tin thô từ server. Không bao giờ ném lỗi. */
export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  return parseJsonWith(serverMessageSchema, raw);
}
