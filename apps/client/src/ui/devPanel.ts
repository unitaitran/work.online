// Công cụ dev (chỉ có khi chạy `npm run dev`): gọi API dev của server để tua ngày, cộng XP/xu,
// nhằm thử nhanh vòng thăng tiến. Server chỉ bật API này khi chạy với cờ --dev.
import { STRINGS } from '../strings';
import { el } from './dom';

export interface DevPanelOptions {
  /** Gọi API dev; trả false nếu server không bật công cụ dev. */
  call(path: string, body: unknown): Promise<boolean>;
  today(): string | null;
  toast(text: string): void;
}

export function mountDevPanel(root: HTMLElement, o: DevPanelOptions): { dispose(): void } {
  const s = STRINGS.progress.dev;
  const label = el('p', { className: 'dev-day' });
  const render = (): void => {
    label.textContent = s.day(o.today() ?? '…');
  };
  const button = (text: string, path: string, body: unknown): HTMLButtonElement => {
    const b = el('button', { className: 'dev-button', text, attrs: { type: 'button' } });
    b.addEventListener('click', () => {
      void o.call(path, body).then((ok) => {
        if (!ok) o.toast(s.failed);
        window.setTimeout(render, 300);
      });
    });
    return b;
  };
  const panel = el('details', {
    className: 'dev-panel',
    children: [
      el('summary', { text: s.title }),
      label,
      el('div', {
        className: 'dev-buttons',
        children: [
          button(s.plusDay, '/api/dev/shift-day', { days: 1 }),
          button(s.plusWeek, '/api/dev/shift-day', { days: 7 }),
          button(s.xp, '/api/dev/grant', { xp: 200 }),
          button(s.xpBig, '/api/dev/grant', { xp: 5000 }),
          button(s.coins, '/api/dev/grant', { coins: 1000 }),
        ],
      }),
    ],
  });
  panel.addEventListener('toggle', render);
  root.append(panel);
  render();
  return {
    dispose() {
      panel.remove();
    },
  };
}
