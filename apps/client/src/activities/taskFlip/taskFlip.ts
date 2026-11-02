// Lật 1 trong 3 task: chia ba lá úp, lật một lá ra việc nhỏ làm được ngay.
import type { Rng } from '../../avatar/names';
import { MICRO_TASKS } from '../../data/micro-tasks';

export const CARD_COUNT = 3;

/** Chọn `count` việc khác nhau (chỉ số trong MICRO_TASKS). */
export function dealTasks(rng: Rng, count = CARD_COUNT, total = MICRO_TASKS.length): number[] {
  const picked: number[] = [];
  const pool = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < Math.min(count, total); i += 1) {
    const j = Math.floor(rng() * pool.length);
    const [taskId] = pool.splice(Math.min(j, pool.length - 1), 1);
    if (taskId !== undefined) picked.push(taskId);
  }
  return picked;
}

export type TaskFlipState =
  | { phase: 'dealt'; cards: number[] }
  | { phase: 'flipped'; cards: number[]; chosen: number; flippedAt: number }
  | { phase: 'done'; cards: number[]; chosen: number; flippedAt: number; doneAt: number };

export function deal(rng: Rng): TaskFlipState {
  return { phase: 'dealt', cards: dealTasks(rng) };
}

/** Lật lá thứ `cardIndex`. Chỉ lật được một lá. */
export function flip(state: TaskFlipState, cardIndex: number, now: number): TaskFlipState {
  if (state.phase !== 'dealt') return state;
  if (cardIndex < 0 || cardIndex >= state.cards.length) return state;
  return { phase: 'flipped', cards: state.cards, chosen: cardIndex, flippedAt: now };
}

export function complete(state: TaskFlipState, now: number): TaskFlipState {
  if (state.phase !== 'flipped') return state;
  return { ...state, phase: 'done', doneAt: now };
}

export function chosenTaskId(state: TaskFlipState): number | null {
  return state.phase === 'dealt' ? null : (state.cards[state.chosen] ?? null);
}
