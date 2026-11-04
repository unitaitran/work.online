// Bảng task: chia vài lá úp (ngẫu nhiên riêng từng người), lật để xem việc nhỏ, nhận việc muốn làm.
import { MICRO_TASK_COUNT, TASK_DEAL_COUNT } from '@dilam/shared';
import type { Rng } from '../../avatar/names';

/** Chọn `count` việc khác nhau (chỉ số trong MICRO_TASKS), bỏ qua các việc đang giữ. */
export function dealTasks(
  rng: Rng,
  count = TASK_DEAL_COUNT,
  exclude: readonly number[] = [],
  total = MICRO_TASK_COUNT,
): number[] {
  const pool = Array.from({ length: total }, (_, i) => i).filter((i) => !exclude.includes(i));
  const picked: number[] = [];
  for (let i = 0; i < Math.min(count, pool.length + picked.length) && pool.length > 0; i += 1) {
    const j = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    const [taskId] = pool.splice(j, 1);
    if (taskId !== undefined) picked.push(taskId);
  }
  return picked;
}

export interface Deal {
  cards: number[];
  /** Các lá đã lật (theo vị trí). */
  flipped: boolean[];
}

export function deal(rng: Rng, exclude: readonly number[] = []): Deal {
  const cards = dealTasks(rng, TASK_DEAL_COUNT, exclude);
  return { cards, flipped: cards.map(() => false) };
}

export function flip(state: Deal, index: number): Deal {
  if (index < 0 || index >= state.cards.length || state.flipped[index]) return state;
  return { ...state, flipped: state.flipped.map((f, i) => f || i === index) };
}

export function flipAll(state: Deal): Deal {
  return { ...state, flipped: state.cards.map(() => true) };
}

/** "m:ss" cho thời gian chờ còn lại. */
export function formatWait(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}
