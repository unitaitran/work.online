// Kiểu dữ liệu REST giữa client và server (xem docs/PROTOCOL.md).
import { z } from 'zod';
import { characterSchema, type Profile } from './character';
import type { ProgressState } from './progress';

/** Mã khôi phục: "DLO-" + 4 nhóm 4 ký tự Crockford base32 (80 bit ngẫu nhiên). */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_GROUPS = 4;
export const RECOVERY_GROUP_LENGTH = 4;

/** Chuẩn hoá mã khôi phục người chơi gõ (chữ thường, thiếu gạch, nhầm O/0, I/1/L). */
export function normalizeRecoveryCode(raw: string): string | null {
  const body = raw
    .toUpperCase()
    .replace(/^DLO/, '')
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  const length = RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH;
  if (body.length !== length) return null;
  for (const ch of body) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  const groups: string[] = [];
  for (let i = 0; i < length; i += RECOVERY_GROUP_LENGTH) {
    groups.push(body.slice(i, i + RECOVERY_GROUP_LENGTH));
  }
  return `DLO-${groups.join('-')}`;
}

/** Múi giờ IANA hợp lệ (ví dụ "Asia/Ho_Chi_Minh"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().min(1).max(64).refine(isValidTimeZone);

// ---------- Yêu cầu ----------

export const createAccountRequestSchema = z.strictObject({
  timeZone: timeZoneSchema.optional(),
  /** Chơi khách: không cần tài khoản, rời đi (đăng xuất, đóng tab lâu) là mất. */
  guest: z.boolean().optional(),
});

/** Tên đăng nhập: 3-20 ký tự a-z, 0-9, dấu chấm, gạch dưới (không phân biệt hoa thường). */
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export const usernameSchema = z
  .string()
  .max(40)
  .transform(normalizeUsername)
  .refine((name) => USERNAME_PATTERN.test(name));
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/**
 * Đăng ký. Gửi kèm token của tài khoản khách (header Authorization) thì giữ nguyên tiến độ,
 * chỉ gắn tên đăng nhập + mật khẩu; không có token thì tạo tài khoản mới.
 */
export const registerRequestSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  timeZone: timeZoneSchema.optional(),
});

export const loginRequestSchema = z.strictObject({
  username: usernameSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const recoverRequestSchema = z.strictObject({
  recoveryCode: z.string().min(16).max(40),
});

export const saveCharacterRequestSchema = characterSchema;

export const setTimeZoneRequestSchema = z.strictObject({ timeZone: timeZoneSchema });

export const importRequestSchema = z.strictObject({ saveCode: z.string().min(10).max(64_000) });

// ---------- Trả lời ----------

export interface AccountCreatedResponse {
  userId: string;
  token: string;
  /** Chỉ hiện MỘT lần lúc tạo; server chỉ lưu bản băm. */
  recoveryCode: string;
}

export interface LoginResponse {
  userId: string;
  token: string;
}

export interface RecoverResponse {
  userId: string;
  /** Token mới; token cũ hết hiệu lực. */
  token: string;
}

export interface MeResponse {
  userId: string;
  /** Mã nhân viên hiển thị (rút từ userId). */
  playerCode: string;
  timeZone: string;
  character: Profile | null;
  progress: ProgressState;
  /** Đã từng nhập mã lưu cục bộ chưa (chỉ được một lần). */
  imported: boolean;
  /** Tên đăng nhập (null: tài khoản khách hoặc tài khoản ẩn danh cũ). */
  username: string | null;
  /** Tài khoản khách: đăng xuất là xoá hết. */
  guest: boolean;
}

export interface CapacityResponse {
  online: number;
  limit: number;
  /** Server gần đầy: client nên báo người chơi có thể phải chờ. */
  busy: boolean;
}

export interface MetaResponse {
  departments: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  titles: { title: number; minLevel: number; manager: string; specialist: string }[];
  maxLevel: number;
  companyUnlockLevel: number;
  protocolVersion: number;
}

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'conflict'
  | 'forbidden'
  | 'rejected';

export interface ApiError {
  error: ApiErrorCode;
  /** Lý do chi tiết (mã máy đọc, ví dụ "profanity", "too_high"). */
  reason?: string;
}

/** Phiên bản giao thức: tăng khi đổi gói tin không tương thích (client cũ phải tải lại). */
export const PROTOCOL_VERSION = 1;
