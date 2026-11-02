// Tài khoản: token + mã khôi phục, thêm tên đăng nhập + mật khẩu (tuỳ chọn), hoặc chơi khách.
// Không thu email hay thông tin cá nhân.
import { createProgress, normalizeRecoveryCode } from '@dilam/shared';
import { hashPassword, verifyPassword } from '../auth/password';
import { hashSecret, newRecoveryCode, newToken, newUserId } from '../auth/secrets';
import type { Repositories, UserRecord } from '../db/repositories';

const DAY_MS = 86_400_000;
/** Chỉ ghi "lần cuối thấy" khi đã cách lần trước ít nhất chừng này (đỡ ghi DB mỗi yêu cầu). */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Băm sẵn để so khi tên đăng nhập không tồn tại (thời gian trả lời như nhau). */
let dummyHash: string | null = null;

export type CredentialError = 'name_taken' | 'already_registered';

export interface AccountService {
  create(
    timeZone: string,
    options?: { guest?: boolean },
  ): { userId: string; token: string; recoveryCode: string };
  /** Gắn tên đăng nhập + mật khẩu cho tài khoản (khách hoặc ẩn danh cũ), giữ nguyên tiến độ. */
  setCredentials(
    userId: string,
    username: string,
    password: string,
  ): { ok: true } | { ok: false; error: CredentialError };
  /** Đăng nhập bằng tên + mật khẩu: cấp token mới (phiên cũ trên máy khác hết hiệu lực). */
  login(username: string, password: string): { userId: string; token: string } | null;
  /** Đăng xuất: khách thì xoá hẳn tài khoản, còn lại chỉ huỷ token. */
  logout(userId: string): { deleted: boolean };
  /** Xoá tài khoản khách không thấy từ trước `before` (trừ người đang online). */
  cleanupGuests(before: number, online: (userId: string) => boolean): number;
  /** Token hợp lệ và chưa hết hạn thì trả người dùng (gia hạn trượt), ngược lại null. */
  authenticate(token: string): UserRecord | null;
  /** Đăng nhập lại bằng mã khôi phục: cấp token mới, token cũ mất hiệu lực. */
  recover(recoveryCode: string): { userId: string; token: string } | null;
  /** Cấp mã khôi phục mới (mã cũ hết hiệu lực). */
  rotateRecovery(userId: string): string;
  /** Xoá tài khoản và toàn bộ dữ liệu (khoá ngoại ON DELETE CASCADE). */
  remove(userId: string): void;
}

export function createAccountService(
  repos: Repositories,
  options: { tokenTtlDays: number; now?: () => number },
): AccountService {
  const now = options.now ?? Date.now;
  const ttl = options.tokenTtlDays * DAY_MS;

  return {
    create(timeZone, createOptions) {
      const at = now();
      const userId = newUserId();
      const token = newToken();
      const recoveryCode = newRecoveryCode();
      repos.transaction(() => {
        repos.users.create({
          id: userId,
          tokenHash: hashSecret(token),
          tokenExpiresAt: at + ttl,
          recoveryHash: hashSecret(recoveryCode),
          timeZone,
          createdAt: at,
          lastSeenAt: at,
        });
        repos.progress.save(userId, createProgress(at), at);
        if (createOptions?.guest) repos.users.setGuest(userId, true);
      });
      return { userId, token, recoveryCode };
    },

    setCredentials(userId, username, password) {
      if (repos.users.account(userId)?.username) return { ok: false, error: 'already_registered' };
      if (repos.users.byUsername(username)) return { ok: false, error: 'name_taken' };
      const hash = hashPassword(password);
      try {
        repos.users.setCredentials(userId, username, hash);
      } catch {
        // Hai người đăng ký cùng tên một lúc: chỉ mục UNIQUE chặn người sau.
        return { ok: false, error: 'name_taken' };
      }
      return { ok: true };
    },

    login(username, password) {
      const user = repos.users.byUsername(username);
      if (!user) {
        dummyHash ??= hashPassword('khong-co-tai-khoan');
        verifyPassword(password, dummyHash);
        return null;
      }
      if (!verifyPassword(password, user.passwordHash)) return null;
      const token = newToken();
      const at = now();
      repos.users.setToken(user.id, hashSecret(token), at + ttl);
      repos.users.touch(user.id, at, at + ttl);
      return { userId: user.id, token };
    },

    logout(userId) {
      if (repos.users.account(userId)?.guest) {
        repos.users.delete(userId);
        return { deleted: true };
      }
      // Token mới không ai biết: token đang dùng hết hiệu lực.
      repos.users.setToken(userId, hashSecret(newToken()), now() + ttl);
      return { deleted: false };
    },

    cleanupGuests(before, online) {
      let removed = 0;
      for (const id of repos.users.staleGuests(before)) {
        if (online(id)) continue;
        repos.users.delete(id);
        removed += 1;
      }
      return removed;
    },

    authenticate(token) {
      if (token.length < 20 || token.length > 100) return null;
      const user = repos.users.byTokenHash(hashSecret(token));
      const at = now();
      if (!user || user.tokenExpiresAt <= at) return null;
      if (at - user.lastSeenAt >= TOUCH_INTERVAL_MS) {
        repos.users.touch(user.id, at, at + ttl);
        return { ...user, lastSeenAt: at, tokenExpiresAt: at + ttl };
      }
      return user;
    },

    recover(raw) {
      const code = normalizeRecoveryCode(raw);
      if (!code) return null;
      const user = repos.users.byRecoveryHash(hashSecret(code));
      if (!user) return null;
      const token = newToken();
      const at = now();
      repos.users.setToken(user.id, hashSecret(token), at + ttl);
      repos.users.touch(user.id, at, at + ttl);
      return { userId: user.id, token };
    },

    rotateRecovery(userId) {
      const code = newRecoveryCode();
      repos.users.setRecovery(userId, hashSecret(code));
      return code;
    },

    remove(userId) {
      repos.users.delete(userId);
    },
  };
}
