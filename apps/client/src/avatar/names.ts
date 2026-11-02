import { STRINGS } from '../strings';

/** Hàm sinh số ngẫu nhiên trong [0, 1), thay được khi test. */
export type Rng = () => number;

export function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('pick() from an empty list');
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index] as T;
}

/** Tên ngẫu nhiên dạng "Họ + Tên", cố gắng khác với `avoid` (tên đang hiển thị). */
export function randomVietnameseName(rng: Rng = Math.random, avoid?: string): string {
  let name = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    name = `${pick(STRINGS.names.surnames, rng)} ${pick(STRINGS.names.givenNames, rng)}`;
    if (name !== avoid) break;
  }
  return name;
}
