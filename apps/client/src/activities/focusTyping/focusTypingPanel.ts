import { STRINGS } from '../../strings';
import { el } from '../../ui/dom';
import {
  FOCUS_MINUTES,
  finishTypingSession,
  isTimeUp,
  lineAt,
  pressKey,
  remainingMs,
  startTypingSession,
  type FocusMinutes,
  type TypingSession,
  type TypingSummary,
} from './focusTyping';

/** "m:ss" */
export function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}

/** Nút chọn 1/3/5 phút. */
export function mountFocusChooser(
  body: HTMLElement,
  onChoose: (minutes: FocusMinutes) => void,
): void {
  const s = STRINGS.focus;
  body.append(
    el('p', { className: 'activity-intro', text: s.chooseBody }),
    el('div', {
      className: 'activity-actions focus-choices',
      children: FOCUS_MINUTES.map((minutes) => {
        const button = el('button', {
          className: 'button button-primary',
          text: s.minutes(minutes),
          attrs: { type: 'button' },
        });
        button.addEventListener('click', () => {
          onChoose(minutes);
        });
        return button;
      }),
    }),
  );
}

export interface FocusWindowOptions {
  minutes: FocusMinutes;
  /** Mỗi lần gõ (kể cả không được tính): phát tiếng gõ. */
  onPress(scored: boolean): void;
  onFinish(summary: TypingSummary, startedAt: number): void;
}

const VISIBLE_LINES = 7;

/**
 * Cửa sổ "kinh công sở": bắt mọi phím (trừ Esc = dừng) trong lúc chơi để nhân vật
 * không đi lung tung; trên màn cảm ứng thì chạm vào ô gõ.
 */
export function openFocusWindow(root: HTMLElement, options: FocusWindowOptions): { stop(): void } {
  const s = STRINGS.focus;
  let session: TypingSession = startTypingSession(options.minutes, Date.now(), Date.now() & 0xffff);
  let finished = false;

  const timer = el('span', { className: 'focus-timer' });
  const counter = el('span', { className: 'focus-counter' });
  const lines = el('ol', { className: 'focus-lines', attrs: { 'aria-live': 'polite' } });
  const warning = el('p', { className: 'focus-warning', text: s.tooFast });
  warning.hidden = true;
  const tapArea = el('button', {
    className: 'focus-tap',
    text: s.tapArea,
    attrs: { type: 'button' },
  });
  const stop = el('button', {
    className: 'button button-soft',
    text: s.stop,
    attrs: { type: 'button' },
  });
  const panel = el('section', {
    className: 'focus-window',
    attrs: { role: 'dialog', 'aria-label': s.windowTitle },
    children: [
      el('header', {
        className: 'focus-header',
        children: [el('h2', { className: 'focus-title', text: s.windowTitle }), timer],
      }),
      lines,
      warning,
      el('div', { className: 'focus-footer', children: [counter, stop] }),
      tapArea,
    ],
  });

  let warningTimer: number | undefined;
  const render = (): void => {
    const now = Date.now();
    timer.textContent = s.remaining(formatDuration(remainingMs(session, now)));
    counter.textContent = s.counter(session.scoredKeys, session.lines);
  };

  const press = (): void => {
    if (finished) return;
    const result = pressKey(session, Date.now());
    session = result.session;
    options.onPress(result.scored);
    if (result.scored) {
      const item = el('li', { text: lineAt(session.lines - 1, session.seed) });
      lines.append(item);
      while (lines.children.length > VISIBLE_LINES) lines.firstElementChild?.remove();
    } else {
      warning.hidden = false;
      window.clearTimeout(warningTimer);
      warningTimer = window.setTimeout(() => {
        warning.hidden = true;
      }, 1200);
    }
    render();
  };

  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.clearInterval(tick);
    window.clearTimeout(warningTimer);
    window.removeEventListener('keydown', onKey, true);
    panel.remove();
    options.onFinish(finishTypingSession(session, Date.now()), session.startedAt);
  };

  // Bắt phím ở pha capture của window: cảnh 3D (WASD, E) không nhận được phím trong lúc gõ.
  const onKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
      return;
    }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Tab') return;
    event.preventDefault();
    press();
  };

  const tick = window.setInterval(() => {
    if (isTimeUp(session, Date.now())) finish();
    else render();
  }, 250);

  tapArea.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    press();
  });
  stop.addEventListener('click', finish);
  window.addEventListener('keydown', onKey, true);
  root.append(panel);
  render();
  return { stop: finish };
}

/** Màn tổng kết sau phiên gõ. */
export function mountFocusSummary(body: HTMLElement, summary: TypingSummary): void {
  const s = STRINGS.focus;
  body.append(
    el('p', {
      className: 'activity-intro',
      text: summary.completed ? s.summaryDone : s.summaryEarly,
    }),
    el('ul', {
      className: 'focus-summary',
      children: [
        el('li', { text: s.summaryTime(formatDuration(summary.actualMs)) }),
        el('li', { text: s.summaryPresses(summary.presses) }),
        el('li', { text: s.summaryScored(summary.scoredKeys) }),
        el('li', { text: s.summaryLines(summary.lines) }),
      ],
    }),
  );
}
