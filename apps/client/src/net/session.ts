// Phiên đăng nhập. Tài khoản có tên đăng nhập (hoặc tài khoản ẩn danh cũ): token ở localStorage.
// Chơi khách: token ở sessionStorage, đóng tab hoặc bấm "Đăng xuất" là mất. Server chỉ giữ bản băm.
import type { LoginResponse, MeResponse } from '@dilam/shared';
import type { KeyValueStore } from '../storage';
import type { ApiClient, ApiResult } from './api';

export const TOKEN_KEY = 'dilam.session.v1';
export const GUEST_TOKEN_KEY = 'dilam.guest.v1';

export interface SessionStores {
  /** localStorage: tài khoản đã đăng ký. */
  local: KeyValueStore | null;
  /** sessionStorage: tài khoản khách. */
  tab: KeyValueStore | null;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

export function loadToken(store: KeyValueStore | null, key = TOKEN_KEY): string | null {
  try {
    const token = store?.getItem(key) ?? null;
    return token && TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function saveToken(
  store: KeyValueStore | null,
  token: string | null,
  key = TOKEN_KEY,
): void {
  try {
    if (token) store?.setItem(key, token);
    else store?.removeItem(key);
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

export type SessionError =
  'network' | 'unauthorized' | 'rate_limited' | 'name_taken' | 'rejected' | 'invalid' | 'other';

export type SignInResult =
  { ok: true; me: MeResponse; recoveryCode: string | null } | { ok: false; error: SessionError };

/** Kiểm tra token, cập nhật múi giờ máy nếu đổi (đi công tác...). */
async function useToken(api: ApiClient, token: string): Promise<SignInResult> {
  api.setToken(token);
  const me = await api.me();
  if (!me.ok) return { ok: false, error: mapError(me) };
  const tz = localTimeZone();
  if (me.value.timeZone !== tz) {
    const updated = await api.setTimeZone(tz);
    if (updated.ok) return { ok: true, me: updated.value, recoveryCode: null };
  }
  return { ok: true, me: me.value, recoveryCode: null };
}

/**
 * Vào lại phiên đã lưu (tài khoản trên máy, hoặc khách trong tab này).
 * Trả null khi chưa có phiên nào: hiện màn đăng nhập / đăng ký / chơi khách.
 */
export async function resumeSession(
  api: ApiClient,
  stores: SessionStores,
): Promise<SignInResult | null> {
  const candidates: [KeyValueStore | null, string][] = [
    [stores.local, TOKEN_KEY],
    [stores.tab, GUEST_TOKEN_KEY],
  ];
  for (const [store, key] of candidates) {
    const token = loadToken(store, key);
    if (!token) continue;
    const result = await useToken(api, token);
    if (result.ok || result.error !== 'unauthorized') return result;
    // Token hết hạn hoặc tài khoản đã xoá (khách bị dọn): bỏ token.
    saveToken(store, null, key);
  }
  api.setToken(null);
  return null;
}

/** Chơi ngay không cần tài khoản. */
export async function startGuest(api: ApiClient, stores: SessionStores): Promise<SignInResult> {
  api.setToken(null);
  const created = await api.createAccount(localTimeZone(), true);
  if (!created.ok) return { ok: false, error: mapError(created) };
  saveToken(stores.tab, created.value.token, GUEST_TOKEN_KEY);
  return useToken(api, created.value.token);
}

function keep(stores: SessionStores, token: string): void {
  saveToken(stores.local, token);
  saveToken(stores.tab, null, GUEST_TOKEN_KEY);
}

export async function login(
  api: ApiClient,
  stores: SessionStores,
  username: string,
  password: string,
): Promise<SignInResult> {
  api.setToken(null);
  const result = await api.request<LoginResponse>('POST', '/api/accounts/login', {
    username,
    password,
  });
  if (!result.ok) return { ok: false, error: mapError(result) };
  keep(stores, result.value.token);
  return useToken(api, result.value.token);
}

/**
 * Đăng ký. Đang chơi khách (hoặc tài khoản ẩn danh cũ) thì giữ nguyên tiến độ, chỉ gắn tên +
 * mật khẩu; chưa có phiên thì tạo tài khoản mới.
 */
export async function register(
  api: ApiClient,
  stores: SessionStores,
  username: string,
  password: string,
): Promise<SignInResult> {
  const current = api.getToken();
  if (current) {
    const result = await api.request<MeResponse>('POST', '/api/accounts/register', {
      username,
      password,
    });
    if (!result.ok) return { ok: false, error: mapError(result) };
    keep(stores, current);
    return { ok: true, me: result.value, recoveryCode: null };
  }
  const result = await api.request<LoginResponse>('POST', '/api/accounts/register', {
    username,
    password,
    timeZone: localTimeZone(),
  });
  if (!result.ok) return { ok: false, error: mapError(result) };
  keep(stores, result.value.token);
  return useToken(api, result.value.token);
}

/** Đăng xuất: khách thì server xoá luôn tài khoản. Xoá token ở cả hai nơi. */
export async function logout(api: ApiClient, stores: SessionStores): Promise<void> {
  if (api.getToken()) await api.request('POST', '/api/accounts/logout', {});
  api.setToken(null);
  saveToken(stores.local, null);
  saveToken(stores.tab, null, GUEST_TOKEN_KEY);
}

/** Đăng nhập lại bằng mã khôi phục (tài khoản ẩn danh cũ, máy mới). */
export async function recoverAccount(
  api: ApiClient,
  stores: SessionStores,
  code: string,
): Promise<SignInResult> {
  const result = await api.recover(code);
  if (!result.ok) return { ok: false, error: mapError(result) };
  keep(stores, result.value.token);
  return useToken(api, result.value.token);
}

/** Kiểm tra trước ở client (server vẫn kiểm tra lại). */
export function validateCredentials(
  username: string,
  password: string,
): 'username' | 'password' | null {
  if (!/^[a-z0-9_.]{3,20}$/.test(username.trim().toLowerCase())) return 'username';
  if (password.length < 8 || password.length > 72) return 'password';
  return null;
}

function mapError(result: Extract<ApiResult<unknown>, { ok: false }>): SessionError {
  if (result.error === 'network') return 'network';
  if (result.error === 'unauthorized') return 'unauthorized';
  if (result.error === 'rate_limited') return 'rate_limited';
  if (result.error === 'conflict') return 'name_taken';
  if (result.error === 'rejected') return 'rejected';
  if (result.error === 'bad_request') return 'invalid';
  return 'other';
}
