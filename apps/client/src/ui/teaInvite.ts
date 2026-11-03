// Thẻ lời rủ uống trà sữa (góc phải trên): ai rủ, đếm ngược, nút Uống luôn / Thôi.
// Trượt vào / ra mượt; trả lời xong thì cảm ơn ngắn rồi tự ẩn.
import type { MilkTeaReplyError, MilkTeaRoundView } from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface TeaInviteCard {
  show(round: MilkTeaRoundView, serverOffsetMs: number): void;
  /** Kết quả trả lời của mình (từ server). */
  replied(id: number, accept: boolean, ok: boolean, reason?: MilkTeaReplyError): void;
  end(id: number): void;
  dispose(): void;
}

const HIDE_MS = 260;

export function mountTeaInvite(
  root: HTMLElement,
  onReply: (id: number, accept: boolean) => void,
): TeaInviteCard {
  const s = STRINGS.tea;
  const title = el('strong', { className: 'tea-title' });
  const timer = el('span', { className: 'tea-timer' });
  const note = el('p', { className: 'tea-note' });
  const yes = el('button', {
    className: 'button button-primary',
    text: s.accept,
    attrs: { type: 'button' },
  });
  const no = el('button', {
    className: 'button button-soft',
    text: s.decline,
    attrs: { type: 'button' },
  });
  const actions = el('div', { className: 'tea-actions', children: [no, yes] });
  const card = el('section', {
    className: 'tea-card',
    attrs: { role: 'alertdialog', 'aria-live': 'polite' },
    children: [
      el('div', {
        className: 'tea-head',
        children: [
          el('span', { className: 'tea-icon', text: '🧋', attrs: { 'aria-hidden': 'true' } }),
          title,
          timer,
        ],
      }),
      note,
      actions,
    ],
  });
  card.hidden = true;
  root.append(card);

  let current: MilkTeaRoundView | null = null;
  let tick: number | undefined;
  let hideTimer: number | undefined;

  const hide = (delay: number): void => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      card.classList.remove('is-open');
      hideTimer = window.setTimeout(() => {
        card.hidden = true;
      }, HIDE_MS);
    }, delay);
  };
  const answer = (accept: boolean): void => {
    if (!current) return;
    yes.disabled = true;
    no.disabled = true;
    onReply(current.id, accept);
  };
  yes.addEventListener('click', () => {
    answer(true);
  });
  no.addEventListener('click', () => {
    answer(false);
  });

  return {
    show(round, offset) {
      window.clearTimeout(hideTimer);
      window.clearInterval(tick);
      current = round;
      title.textContent = s.invited(round.hostName);
      note.textContent = s.treat(round.price);
      actions.hidden = false;
      yes.disabled = false;
      no.disabled = false;
      const endsAt = round.endsAt - offset;
      const update = (): void => {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        timer.textContent = `${String(left)}s`;
        if (left === 0) hide(0);
      };
      update();
      tick = window.setInterval(update, 250);
      card.hidden = false;
      // Khung hình sau mới thêm lớp mở để hiệu ứng trượt vào chạy.
      window.requestAnimationFrame(() => {
        card.classList.add('is-open');
      });
    },
    replied(id, accept, ok, reason) {
      if (current?.id !== id) return;
      window.clearInterval(tick);
      timer.textContent = '';
      actions.hidden = true;
      note.textContent = ok
        ? accept
          ? s.thanks(current.hostName)
          : s.declined
        : (s.errors[reason ?? 'ended'] ?? s.errors.ended ?? '');
      hide(ok && !accept ? 600 : 1800);
    },
    end(id) {
      if (current?.id !== id) return;
      window.clearInterval(tick);
      current = null;
      hide(0);
    },
    dispose() {
      window.clearInterval(tick);
      window.clearTimeout(hideTimer);
      card.remove();
    },
  };
}
