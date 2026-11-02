// Token và mã khôi phục. Server chỉ lưu bản băm SHA-256 (cả hai đều ngẫu nhiên ≥ 80 bit,
// nên băm nhanh là đủ; không dùng được bảng tra sẵn).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { RECOVERY_ALPHABET, RECOVERY_GROUP_LENGTH, RECOVERY_GROUPS } from '@dilam/shared';

/** Token phiên: 32 byte ngẫu nhiên, base64url (43 ký tự). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Mã khôi phục dễ đọc: DLO-XXXX-XXXX-XXXX-XXXX (Crockford base32, 80 bit). */
export function newRecoveryCode(): string {
  const length = RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH;
  const bytes = randomBytes(length);
  let body = '';
  for (const byte of bytes) body += RECOVERY_ALPHABET.charAt(byte & 31);
  const groups: string[] = [];
  for (let i = 0; i < length; i += RECOVERY_GROUP_LENGTH) {
    groups.push(body.slice(i, i + RECOVERY_GROUP_LENGTH));
  }
  return `DLO-${groups.join('-')}`;
}

export function newUserId(): string {
  return randomUUID();
}

/** Mã nhân viên hiển thị: NV- + 6 ký tự rút từ id (không lộ id thật). */
export function playerCodeOf(userId: string): string {
  return `NV-${hashSecret(`player|${userId}`).slice(0, 6).toUpperCase()}`;
}
