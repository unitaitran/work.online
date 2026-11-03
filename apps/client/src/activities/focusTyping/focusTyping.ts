// Gõ phím tập trung: phiên 1/3/5 phút, mỗi lần gõ (được tính) hiện thêm một dòng "thư công sở".
import { THU_CONG_SO } from '../../data/thu-cong-so';
import { seededRng } from '../../npc/schedule';

export const FOCUS_MINUTES = [1, 3, 5] as const;
export type FocusMinutes = (typeof FOCUS_MINUTES)[number];

/**
 * Chống gian lận cơ bản: hai lần gõ được tính phải cách nhau ít nhất chừng này
 * (≈ 8 phím/giây, nhanh hơn người gõ giỏi nhưng chặn được giữ phím hay máy bấm tự động).
 * Gõ nhanh hơn vẫn có tiếng, nhưng không được tính và không ra dòng mới.
 */
export const MIN_SCORED_INTERVAL_MS = 120;

export interface TypingSession {
  plannedMs: number;
  startedAt: number;
  presses: number;
  scoredKeys: number;
  lines: number;
  lastScoredAt: number | null;
  /** Hạt giống để thứ tự dòng mỗi phiên một khác. */
  seed: number;
}

export interface TypingSummary {
  plannedMs: number;
  actualMs: number;
  presses: number;
  scoredKeys: number;
  lines: number;
  completed: boolean;
}

export function startTypingSession(minutes: FocusMinutes, now: number, seed = now): TypingSession {
  return {
    plannedMs: minutes * 60_000,
    startedAt: now,
    presses: 0,
    scoredKeys: 0,
    lines: 0,
    lastScoredAt: null,
    seed,
  };
}

export function remainingMs(session: TypingSession, now: number): number {
  return Math.max(0, session.startedAt + session.plannedMs - now);
}

export function isTimeUp(session: TypingSession, now: number): boolean {
  return remainingMs(session, now) === 0;
}

/** Một lần bấm phím hoặc chạm. Hết giờ thì không tính nữa. */
export function pressKey(
  session: TypingSession,
  now: number,
): { session: TypingSession; scored: boolean } {
  if (isTimeUp(session, now) || now < session.startedAt) return { session, scored: false };
  const scored =
    session.lastScoredAt === null || now - session.lastScoredAt >= MIN_SCORED_INTERVAL_MS;
  return {
    scored,
    session: {
      ...session,
      presses: session.presses + 1,
      scoredKeys: session.scoredKeys + (scored ? 1 : 0),
      lines: session.lines + (scored ? 1 : 0),
      lastScoredAt: scored ? now : session.lastScoredAt,
    },
  };
}

export function finishTypingSession(session: TypingSession, now: number): TypingSummary {
  const actualMs = Math.min(session.plannedMs, Math.max(0, now - session.startedAt));
  return {
    plannedMs: session.plannedMs,
    actualMs,
    presses: session.presses,
    scoredKeys: session.scoredKeys,
    lines: session.lines,
    completed: actualMs >= session.plannedMs,
  };
}

/** Thứ tự dòng xáo trộn theo hạt giống; hết vòng thì xáo lại. */
export function lineAt(
  index: number,
  seed: number,
  lines: readonly string[] = THU_CONG_SO,
): string {
  const round = Math.floor(index / lines.length);
  const order = lines.map((_, i) => i);
  const rng = seededRng(seed + round * 7919);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = a;
  }
  return lines[order[index % lines.length] ?? 0] ?? '';
}
