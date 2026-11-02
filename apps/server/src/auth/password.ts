// Băm mật khẩu bằng scrypt (node:crypto), muối ngẫu nhiên 16 byte, so bằng timingSafeEqual.
// Định dạng lưu: scrypt$N$r$p$<muối hex>$<băm hex>.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFC'), salt, KEY_LENGTH, { N, r: R, p: P });
  return `scrypt$${String(N)}$${String(R)}$${String(P)}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, n, r, p, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(
    password.normalize('NFC'),
    Buffer.from(saltHex, 'hex'),
    expected.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    },
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
