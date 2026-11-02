import { STRINGS } from '../strings';
import { el } from './dom';

export interface CoachMarks {
  dispose(): void;
}

/** Vài thẻ hướng dẫn ngắn cho lần đầu vào văn phòng. Bỏ qua được bất cứ lúc nào. */
export function showCoachMarks(
  root: HTMLElement,
  options: { touch: boolean; onDone(): void },
): CoachMarks {
  const s = STRINGS.coach;
  const cards = s.cards;
  let index = 0;

  const step = el('p', { className: 'coach-step' });
  const title = el('h2', { className: 'coach-title', attrs: { id: 'coach-title' } });
  const body = el('p', { className: 'coach-body' });
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
      step,
      title,
      body,
      el('div', { className: 'coach-actions', children: [skip, next] }),
    ],
  });

  const render = (): void => {
    const current = cards[index];
    if (!current) return;
    step.textContent = s.step(index + 1, cards.length);
    title.textContent = current.title;
    body.textContent = options.touch && current.bodyTouch ? current.bodyTouch : current.body;
    next.textContent = index === cards.length - 1 ? s.done : s.next;
    skip.hidden = index === cards.length - 1;
  };

  const close = (): void => {
    card.remove();
    options.onDone();
  };

  skip.addEventListener('click', close);
  next.addEventListener('click', () => {
    if (index >= cards.length - 1) close();
    else {
      index += 1;
      render();
      next.focus();
    }
  });

  render();
  root.append(card);
  next.focus();
  return {
    dispose() {
      card.remove();
    },
  };
}
