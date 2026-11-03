// Công cụ dev (chỉ có khi chạy `npm run dev`): gọi API dev của server để tua ngày, cộng XP/xu,
// nhằm thử nhanh vòng thăng tiến. Server chỉ bật API này khi chạy với cờ --dev.
import { STRINGS } from '../strings';
import { el } from './dom';

export interface DevPanelOptions {
  /** Gọi API dev; trả false nếu server không bật công cụ dev. */
  call(path: string, body: unknown): Promise<boolean>;
  today(): string | null;
  /** Cộng xu / XP cho người khác theo tên đăng nhập; null nếu lỗi. */
  grantUsers(
    usernames: string[],
    grant: { xp?: number; coins?: number },
  ): Promise<{ granted: string[]; missing: string[] } | null>;
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
  // Cộng cho người khác: tên đăng nhập (cách nhau dấu phẩy) + số lượng.
  const names = el('input', {
    className: 'dev-input',
    attrs: { type: 'text', placeholder: s.othersPlaceholder, 'aria-label': s.othersPlaceholder },
  });
  const amount = el('input', {
    className: 'dev-input dev-amount',
    attrs: { type: 'number', min: '1', step: '1', value: '1000', 'aria-label': s.amount },
  });
  const grantOthers = (kind: 'coins' | 'xp'): void => {
    const list = names.value
      .split(/[,\s]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    const value = Math.floor(Number(amount.value));
    if (list.length === 0 || !Number.isFinite(value) || value <= 0) return;
    void o.grantUsers(list, kind === 'coins' ? { coins: value } : { xp: value }).then((r) => {
      if (!r) {
        o.toast(s.failed);
        return;
      }
      o.toast(s.granted(r.granted, r.missing));
    });
  };
  const othersButton = (text: string, kind: 'coins' | 'xp'): HTMLButtonElement => {
    const b = el('button', { className: 'dev-button', text, attrs: { type: 'button' } });
    b.addEventListener('click', () => {
      grantOthers(kind);
    });
    return b;
  };
  panel.append(
    el('p', { className: 'dev-day', text: s.othersTitle }),
    el('div', { className: 'dev-buttons', children: [names] }),
    el('div', {
      className: 'dev-buttons',
      children: [amount, othersButton(s.plusCoins, 'coins'), othersButton(s.plusXp, 'xp')],
    }),
  );
  panel.addEventListener('toggle', render);
  root.append(panel);
  render();
  return {
    dispose() {
      panel.remove();
    },
  };
}
