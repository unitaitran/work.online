import { STRINGS } from '../../strings';
import { formatClock } from '../../ui/format';
import { el } from '../../ui/dom';
import { hasCheckedInToday, visibleStreak, type CheckInResult, type CheckInState } from './checkIn';

export interface CheckInPanelOptions {
  name: string;
  playerId: string;
  floorName: string;
  state: CheckInState;
  now(): Date;
  /** Quẹt thẻ: server trả kết quả để hiện thông báo; null nếu không gửi được (mất mạng). */
  onSwipe(): Promise<CheckInResult | null>;
}

/** Thẻ nhân viên với nút quẹt thẻ (có hiệu ứng thẻ trượt qua máy đọc). */
export function mountCheckInPanel(body: HTMLElement, options: CheckInPanelOptions): void {
  const s = STRINGS.checkIn;
  let state = options.state;

  const initials = options.name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toUpperCase();

  const streak = el('p', { className: 'badge-card-line' });
  const total = el('p', { className: 'badge-card-line' });
  const card = el('div', {
    className: 'badge-card',
    children: [
      el('div', { className: 'badge-card-stripe', text: options.floorName }),
      el('div', {
        className: 'badge-card-main',
        children: [
          el('div', {
            className: 'badge-card-photo',
            text: initials,
            attrs: { 'aria-hidden': 'true' },
          }),
          el('div', {
            className: 'badge-card-info',
            children: [
              el('p', { className: 'badge-card-name', text: options.name }),
              el('p', { className: 'badge-card-line', text: `${s.code}: ${options.playerId}` }),
              streak,
              total,
            ],
          }),
        ],
      }),
    ],
  });

  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const swipe = el('button', {
    className: 'button button-primary',
    text: s.swipe,
    attrs: { type: 'button' },
  });
  const reader = el('div', { className: 'card-reader', attrs: { 'aria-hidden': 'true' } });

  const render = (): void => {
    const now = options.now();
    streak.textContent = s.streak(visibleStreak(state, now));
    total.textContent = s.total(state.total);
    if (hasCheckedInToday(state, now) && state.lastAt !== null) {
      swipe.disabled = true;
      if (!message.textContent)
        message.textContent = s.already(formatClock(state.lastAt).slice(0, 5));
    } else if (state.total === 0 && !message.textContent) {
      message.textContent = s.firstTime;
    }
  };

  swipe.addEventListener('click', () => {
    swipe.disabled = true;
    card.classList.add('is-swiping');
    const pending = options.onSwipe();
    window.setTimeout(() => {
      void pending.then((result) => {
        card.classList.remove('is-swiping');
        if (!result) {
          message.textContent = STRINGS.net.actionFailed;
          swipe.disabled = false;
          return;
        }
        state = result.state;
        message.textContent =
          result.status === 'checked'
            ? `${s.beep} ${s.newStreak(result.state.streak)}`
            : s.already(formatClock(result.state.lastAt ?? Date.now()).slice(0, 5));
        reader.classList.add(result.status === 'checked' ? 'is-ok' : 'is-done');
        render();
      });
    }, 750);
  });

  body.append(
    el('div', { className: 'badge-stage', children: [card, reader] }),
    message,
    el('div', { className: 'activity-actions', children: [swipe] }),
  );
  render();
}
