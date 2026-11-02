// Tường than thở: viết một dòng, có thể ẩn danh, chỉ lưu trên máy (chưa có tường chung).
import { z } from 'zod';
import type { KeyValueStore } from '../../storage';

/** Độ dài tối đa (ký tự). Dài hơn thì chặn, không cắt ngầm. */
export const VENT_MAX_LENGTH = 120;
/** Chỉ giữ chừng này dòng gần nhất. */
export const VENT_LIMIT = 50;
export const VENT_KEY = 'dilam.vent.v1';

export interface VentEntry {
  id: string;
  text: string;
  /** null = ẩn danh. */
  author: string | null;
  at: number;
}

export type VentValidation =
  { ok: true; text: string } | { ok: false; reason: 'empty' | 'too_long'; length: number };

/** Chuẩn hoá: bỏ ký tự điều khiển, gộp khoảng trắng (một dòng), rồi kiểm tra độ dài. */
export function validateVent(raw: string): VentValidation {
  const text = raw.normalize('NFC').replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim();
  const length = Array.from(text).length;
  if (length === 0) return { ok: false, reason: 'empty', length };
  if (length > VENT_MAX_LENGTH) return { ok: false, reason: 'too_long', length };
  return { ok: true, text };
}

export function addVent(entries: readonly VentEntry[], entry: VentEntry): VentEntry[] {
  return [entry, ...entries].slice(0, VENT_LIMIT);
}

const schema = z.array(
  z.object({
    id: z.string(),
    text: z.string().max(VENT_MAX_LENGTH * 4),
    author: z.string().nullable(),
    at: z.number(),
  }),
);

export function loadVents(store: KeyValueStore | null): VentEntry[] {
  try {
    const raw = store?.getItem(VENT_KEY);
    if (!raw) return [];
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.slice(0, VENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveVents(store: KeyValueStore | null, entries: readonly VentEntry[]): boolean {
  try {
    if (!store) return false;
    store.setItem(VENT_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}
