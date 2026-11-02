// Pha cà phê: chạm máy ở pantry → chờ vài giây → cầm ly, có thể tặng NPC hoặc tự uống.

export const BREW_MS = 3500;
/** Đứng cách NPC trong khoảng này (mét) thì tặng được. */
export const GIFT_RADIUS = 1.6;

export type CoffeeState =
  | { phase: 'idle' }
  | { phase: 'brewing'; startedAt: number; readyAt: number }
  | { phase: 'holding'; brewedAt: number };

export const IDLE_COFFEE: CoffeeState = { phase: 'idle' };

/** Bắt đầu pha; đang pha hoặc đang cầm ly thì không pha thêm. */
export function startBrew(state: CoffeeState, now: number, brewMs = BREW_MS): CoffeeState {
  if (state.phase !== 'idle') return state;
  return { phase: 'brewing', startedAt: now, readyAt: now + brewMs };
}

/** Pha xong chưa? Xong thì chuyển sang cầm ly. */
export function tickBrew(state: CoffeeState, now: number): { state: CoffeeState; ready: boolean } {
  if (state.phase === 'brewing' && now >= state.readyAt) {
    return { state: { phase: 'holding', brewedAt: now }, ready: true };
  }
  return { state, ready: false };
}

export function brewProgress(state: CoffeeState, now: number): number {
  if (state.phase === 'holding') return 1;
  if (state.phase !== 'brewing') return 0;
  return Math.min(1, Math.max(0, (now - state.startedAt) / (state.readyAt - state.startedAt)));
}

/** Tặng hoặc uống: chỉ được khi đang cầm ly. */
export function handOver(state: CoffeeState): { state: CoffeeState; ok: boolean } {
  if (state.phase !== 'holding') return { state, ok: false };
  return { state: IDLE_COFFEE, ok: true };
}
