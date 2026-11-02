// Công cụ dev (chỉ có khi chạy `npm run dev`): tua ngày, tạo nhanh sự kiện để thử vòng thăng tiến.
import { daysBetween, dayKey, makeEvent, type ActivityEvent } from '@dilam/shared';
import { clock } from '../clock';
import { STRINGS } from '../strings';
import { el } from './dom';

const DAY_MS = 86_400_000;

export interface DevPanelOptions {
  emit(event: ActivityEvent): void;
  forceMission(): void;
  /** Sau khi tua ngày (để cập nhật HUD). */
  onTimeChange(): void;
}

export function mountDevPanel(root: HTMLElement, o: DevPanelOptions): { dispose(): void } {
  const s = STRINGS.progress.dev;
  const label = el('p', { className: 'dev-day' });
  const render = (): void => {
    const real = dayKey(new Date());
    label.textContent = s.day(clock.today(), daysBetween(real, clock.today()));
  };
  const button = (text: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', { className: 'dev-button', text, attrs: { type: 'button' } });
    b.addEventListener('click', () => {
      onClick();
      render();
    });
    return b;
  };
  const shift = (days: number): void => {
    clock.setOffset(clock.offsetMs() + days * DAY_MS);
    o.onTimeChange();
  };
  const panel = el('details', {
    className: 'dev-panel',
    children: [
      el('summary', { text: s.title }),
      label,
      el('div', {
        className: 'dev-buttons',
        children: [
          button(s.plusDay, () => {
            shift(1);
          }),
          button(s.plusWeek, () => {
            shift(7);
          }),
          button(s.reset, () => {
            clock.setOffset(0);
            o.onTimeChange();
          }),
          button(s.checkin, () => {
            o.emit(
              makeEvent('checkin', clock.now(), 0, { day: clock.today(), streak: 0, total: 0 }),
            );
          }),
          button(s.focus, () => {
            o.emit(
              makeEvent('focus-typing', clock.now() - 300_000, 300_000, {
                plannedMs: 300_000,
                presses: 300,
                scoredKeys: 280,
                lines: 280,
                completed: true,
              }),
            );
          }),
          button(s.gift, () => {
            o.emit(makeEvent('coffee-gift', clock.now(), 0, { npcId: 'npc-0' }));
          }),
          button(s.chore, () => {
            o.emit(makeEvent('chore', clock.now(), 0, { target: 'plant-0' }));
          }),
          button(s.mission, () => {
            o.forceMission();
          }),
        ],
      }),
    ],
  });
  root.append(panel);
  render();
  return {
    dispose() {
      panel.remove();
    },
  };
}
