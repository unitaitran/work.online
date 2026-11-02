// Tài khoản ẩn danh: token + mã khôi phục. Không thu email hay thông tin cá nhân.
import { createProgress, normalizeRecoveryCode } from '@dilam/shared';
import { hashSecret, newRecoveryCode, newToken, newUserId } from '../auth/secrets';
import type { Repositories, UserRecord } from '../db/repositories';

const DAY_MS = 86_400_000;
/** Chỉ ghi "lần cuối thấy" khi đã cách lần trước ít nhất chừng này (đỡ ghi DB mỗi yêu cầu). */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export interface AccountService {
  create(timeZone: string): { userId: string; token: string; recoveryCode: string };
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
    create(timeZone) {
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
      });
      return { userId, token, recoveryCode };
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
