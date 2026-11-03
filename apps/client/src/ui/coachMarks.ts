import { STRINGS } from '../strings';
import { el } from './dom';

export interface CoachMarks {
  dispose(): void;
}

/** Một bước hướng dẫn. `target`: bộ chọn CSS của phần tử được làm nổi bật (null: không có). */
export interface CoachCard {
  icon: string;
  title: string;
  body: string;
  target: string | null;
}

const CARD_WIDTH = 320;
const GAP = 14;
const PAD = 6;

/**
 * Hướng dẫn từng bước: phần được nhắc tới sáng lên (phần còn lại tối đi), thẻ ngắn gọn đặt cạnh
 * nó. Bỏ qua được bất cứ lúc nào; Esc cũng đóng.
 */
export function showCoachMarks(
  root: HTMLElement,
  options: { cards: readonly CoachCard[]; onDone(): void },
): CoachMarks {
  const s = STRINGS.coach;
  const { cards } = options;
  let index = 0;

  const spot = el('div', { className: 'coach-spot', attrs: { 'aria-hidden': 'true' } });
  const icon = el('span', { className: 'coach-icon', attrs: { 'aria-hidden': 'true' } });
  const title = el('h2', { className: 'coach-title', attrs: { id: 'coach-title' } });
  const body = el('p', { className: 'coach-body' });
  const dots = el('div', { className: 'coach-dots', attrs: { 'aria-hidden': 'true' } });
  const stepText = el('span', { className: 'visually-hidden' });
  const skip = el('button', {
    className: 'button button-soft',
    text: s.skip,
    attrs: { type: 'button' },
  });
  const next = el('button', { className: 'button button-primary', attrs: { type: 'button' } });
  const card = el('section', {
    className: 'coach',
    attrs: { role: 'dialog', 'aria-labelledby': 'coach-title' },
    children: [
      el('div', { className: 'coach-head', children: [icon, title] }),
      body,
      el('div', { className: 'coach-actions', children: [dots, stepText, skip, next] }),
    ],
  });
  const layer = el('div', { className: 'coach-layer', children: [spot, card] });

  const place = (): void => {
    const current = cards[index];
    const target = current?.target ? document.querySelector(current.target) : null;
    const rect = target?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - 24);
    card.style.width = `${String(width)}px`;
    if (!rect || rect.width === 0) {
      spot.classList.add('is-empty');
      card.style.left = `${String((vw - width) / 2)}px`;
      card.style.top = `${String(Math.max(16, vh / 2 - card.offsetHeight / 2))}px`;
      return;
    }
    spot.classList.remove('is-empty');
    spot.style.left = `${String(rect.left - PAD)}px`;
    spot.style.top = `${String(rect.top - PAD)}px`;
    spot.style.width = `${String(rect.width + PAD * 2)}px`;
    spot.style.height = `${String(rect.height + PAD * 2)}px`;
    const h = card.offsetHeight;
    const clampTop = (y: number): number => Math.min(Math.max(12, y), vh - h - 12);
    const clampLeft = (x: number): number => Math.min(Math.max(12, x), vw - width - 12);
    let left: number;
    let top: number;
    if (vw - rect.right - GAP >= width + 12) {
      left = rect.right + GAP;
      top = clampTop(rect.top + rect.height / 2 - h / 2);
    } else if (rect.left - GAP >= width + 12) {
      left = rect.left - GAP - width;
      top = clampTop(rect.top + rect.height / 2 - h / 2);
    } else {
      left = clampLeft(rect.left + rect.width / 2 - width / 2);
      top = rect.top > vh / 2 ? clampTop(rect.top - GAP - h) : clampTop(rect.bottom + GAP);
    }
    card.style.left = `${String(left)}px`;
    card.style.top = `${String(top)}px`;
  };

  const render = (): void => {
    const current = cards[index];
    if (!current) return;
    icon.textContent = current.icon;
    title.textContent = current.title;
    body.textContent = current.body;
    stepText.textContent = s.step(index + 1, cards.length);
    dots.replaceChildren(
      ...cards.map((_, i) =>
        el('span', { className: i === index ? 'coach-dot is-on' : 'coach-dot' }),
      ),
    );
    const last = index === cards.length - 1;
    next.textContent = last ? s.done : s.next;
    skip.hidden = last;
    place();
  };

  const onResize = (): void => {
    place();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  const cleanup = (): void => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    layer.remove();
  };
  function close(): void {
    cleanup();
    options.onDone();
  }

  skip.addEventListener('click', close);
  next.addEventListener('click', () => {
    if (index >= cards.length - 1) close();
    else {
      index += 1;
      render();
      next.focus();
    }
  });
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);

  root.append(layer);
  render();
  // Bố cục (bảng Ở nhà, HUD) có thể vừa dựng xong: đặt lại vị trí sau một khung hình.
  window.requestAnimationFrame(() => {
    place();
  });
  next.focus();
  return { dispose: cleanup };
}
