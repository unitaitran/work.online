import type { KpiFortune } from '../../data/kpi-fortunes';
import { STRINGS } from '../../strings';
import { el } from '../../ui/dom';

export interface FortunePanelOptions {
  fortune: KpiFortune;
  /** Hôm nay đã xin rồi: hiện luôn kết quả. */
  alreadyDrawn: boolean;
  /** Gọi khi quẻ được rút ra (sau khi lắc xong). */
  onDraw(): void;
}

const SHAKE_MS = 1300;

function renderFortune(fortune: KpiFortune): HTMLElement {
  const s = STRINGS.fortune;
  const aspect = (label: string, text: string): HTMLElement =>
    el('div', {
      className: 'fortune-aspect',
      children: [el('dt', { text: label }), el('dd', { text })],
    });
  return el('article', {
    className: 'fortune-card',
    children: [
      el('p', { className: 'fortune-level', text: s.level(fortune.level) }),
      el('h3', { className: 'fortune-name', text: fortune.name }),
      el('dl', {
        className: 'fortune-aspects',
        children: [
          aspect(s.aspects.work, fortune.work),
          aspect(s.aspects.salary, fortune.salary),
          aspect(s.aspects.colleagues, fortune.colleagues),
          aspect(s.aspects.health, fortune.health),
        ],
      }),
      el('p', {
        className: 'fortune-advice',
        children: [
          el('strong', { text: `${s.advice}: ` }),
          document.createTextNode(fortune.advice),
        ],
      }),
    ],
  });
}

/** Ống quẻ lắc lắc (vẽ bằng CSS, không dùng ảnh) rồi bật ra một thẻ quẻ. */
export function mountFortunePanel(body: HTMLElement, options: FortunePanelOptions): void {
  const s = STRINGS.fortune;
  const sticks = Array.from({ length: 7 }, (_, i) =>
    el('span', { className: 'fortune-stick', attrs: { style: `--i:${String(i)}` } }),
  );
  const tube = el('div', {
    className: 'fortune-tube',
    attrs: { 'aria-hidden': 'true' },
    children: [
      el('div', { className: 'fortune-sticks', children: sticks }),
      el('div', { className: 'fortune-body' }),
    ],
  });
  const intro = el('p', {
    className: 'activity-intro',
    text: options.alreadyDrawn ? s.again : s.intro,
  });
  const result = el('div', { className: 'fortune-result' });
  const shake = el('button', {
    className: 'button button-primary',
    text: s.shake,
    attrs: { type: 'button' },
  });

  const reveal = (): void => {
    tube.classList.remove('is-shaking');
    tube.classList.add('is-drawn');
    result.replaceChildren(renderFortune(options.fortune));
    shake.hidden = true;
  };

  shake.addEventListener('click', () => {
    shake.disabled = true;
    shake.textContent = s.shaking;
    tube.classList.add('is-shaking');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(
      () => {
        reveal();
        options.onDraw();
      },
      reduced ? 0 : SHAKE_MS,
    );
  });

  body.append(
    intro,
    el('div', { className: 'fortune-stage', children: [tube] }),
    result,
    el('div', { className: 'activity-actions', children: [shake] }),
  );
  if (options.alreadyDrawn) {
    reveal();
    options.onDraw();
  }
}
