// Phiên đăng nhập: token lưu trên máy (localStorage). Server chỉ giữ bản băm.
import type { MeResponse } from '@dilam/shared';
import type { KeyValueStore } from '../storage';
import type { ApiClient, ApiResult } from './api';

export const TOKEN_KEY = 'dilam.session.v1';

export function loadToken(store: KeyValueStore | null): string | null {
  try {
    const token = store?.getItem(TOKEN_KEY) ?? null;
    return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function saveToken(store: KeyValueStore | null, token: string | null): void {
  try {
    if (token) store?.setItem(TOKEN_KEY, token);
    else store?.removeItem(TOKEN_KEY);
  } catch {
    // bị chặn lưu: token chỉ dùng trong phiên này
  }
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  } catch {
    return 'Asia/Ho_Chi_Minh';
  }
}

export type SignInResult =
  | { ok: true; me: MeResponse; recoveryCode: string | null }
  | { ok: false; error: 'network' | 'unauthorized' | 'rate_limited' | 'other' };

/**
 * Đăng nhập bằng token đã lưu; chưa có (hoặc token hết hạn) thì tạo tài khoản ẩn danh mới.
 * Tài khoản mới trả kèm mã khôi phục (chỉ hiện một lần).
 */
export async function signIn(api: ApiClient, store: KeyValueStore | null): Promise<SignInResult> {
  const saved = loadToken(store);
  if (saved) {
    api.setToken(saved);
    const me = await api.me();
    if (me.ok) {
      // Múi giờ máy đổi (đi công tác...): báo server để ngày chấm công đúng.
      const tz = localTimeZone();
      if (me.value.timeZone !== tz) {
        const updated = await api.setTimeZone(tz);
        if (updated.ok) return { ok: true, me: updated.value, recoveryCode: null };
      }
      return { ok: true, me: me.value, recoveryCode: null };
    }
    if (me.error !== 'unauthorized') return { ok: false, error: mapError(me) };
    // Token hết hạn hoặc tài khoản đã xoá: tạo tài khoản mới (người chơi có thể khôi phục sau).
    saveToken(store, null);
  }
  const created = await api.createAccount(localTimeZone());
  if (!created.ok) return { ok: false, error: mapError(created) };
  api.setToken(created.value.token);
  saveToken(store, created.value.token);
  const me = await api.me();
  if (!me.ok) return { ok: false, error: mapError(me) };
  return { ok: true, me: me.value, recoveryCode: created.value.recoveryCode };
}

/** Đăng nhập lại bằng mã khôi phục (máy mới). */
export async function recoverAccount(
  api: ApiClient,
  store: KeyValueStore | null,
  code: string,
): Promise<SignInResult> {
  const result = await api.recover(code);
  if (!result.ok) return { ok: false, error: mapError(result) };
  api.setToken(result.value.token);
  saveToken(store, result.value.token);
  const me = await api.me();
  if (!me.ok) return { ok: false, error: mapError(me) };
  return { ok: true, me: me.value, recoveryCode: null };
}

function mapError(
  result: Extract<ApiResult<unknown>, { ok: false }>,
): Exclude<SignInResult, { ok: true }>['error'] {
  if (result.error === 'network') return 'network';
  if (result.error === 'unauthorized') return 'unauthorized';
  if (result.error === 'rate_limited') return 'rate_limited';
  return 'other';
}
