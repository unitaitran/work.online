// Mã nhân viên của người chơi trên máy này (dùng chọn quẻ theo người, in trên thẻ).
// Phase 4 sẽ thay bằng mã từ server.
import type { KeyValueStore } from '../storage';

export const PLAYER_ID_KEY = 'dilam.player.v1';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PATTERN = /^NV-[A-Z2-9]{6}$/;

export function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && PATTERN.test(value);
}

export function generatePlayerId(randomByte: () => number): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) code += ALPHABET[randomByte() % ALPHABET.length] ?? 'A';
  return `NV-${code}`;
}

function cryptoByte(): number {
  return crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
}

/** Đọc mã đã lưu, chưa có thì tạo mới và lưu. Bị chặn lưu thì mã chỉ dùng trong phiên này. */
export function loadOrCreatePlayerId(store: KeyValueStore | null): string {
  try {
    const saved = store?.getItem(PLAYER_ID_KEY);
    if (isPlayerId(saved)) return saved;
  } catch {
    // bỏ qua
  }
  const id = generatePlayerId(cryptoByte);
  try {
    store?.setItem(PLAYER_ID_KEY, id);
  } catch {
    // bỏ qua
  }
  return id;
}
