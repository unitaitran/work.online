// Băng rôn sự kiện phòng ở đầu màn hình: tiêu đề, lời nhắn, nút tham gia, đếm ngược, tiến độ.
import type { RoomEventView } from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface RoomEventBanner {
  show(event: RoomEventView, serverOffsetMs: number): void;
  progress(id: number, progress: number): void;
  end(id: number, text: string): void;
  dispose(): void;
}

export function mountRoomEventBanner(
  root: HTMLElement,
  onRespond: (event: RoomEventView) => void,
): RoomEventBanner {
  const title = el('strong', { className: 'room-event-title' });
  const text = el('span', { className: 'room-event-text' });
  const timer = el('span', { className: 'room-event-timer' });
  const progressText = el('span', { className: 'room-event-progress' });
  const action = el('button', { className: 'button button-primary', attrs: { type: 'button' } });
  const banner = el('section', {
    className: 'room-event',
    attrs: { role: 'alert' },
    children: [
      el('div', { className: 'room-event-head', children: [title, timer] }),
      text,
      progressText,
      action,
    ],
  });
  banner.hidden = true;
  root.append(banner);
  let current: RoomEventView | null = null;
  let endsAtLocal = 0;
  let tick: number | undefined;
  let hideTimer: number | undefined;

  action.addEventListener('click', () => {
    if (current) onRespond(current);
  });

  const stopTick = (): void => {
    window.clearInterval(tick);
  };

  return {
    show(event, serverOffsetMs) {
      window.clearTimeout(hideTimer);
      current = event;
      const s = STRINGS.events[event.kind];
      banner.dataset.kind = event.kind;
      title.textContent = s.title;
      text.textContent = s.body;
      action.textContent = s.action;
      action.hidden = s.action === '';
      action.disabled = false;
      progressText.textContent =
        event.goal !== undefined ? STRINGS.events.progress(event.progress ?? 0, event.goal) : '';
      endsAtLocal = event.endsAt - serverOffsetMs;
      banner.hidden = false;
      stopTick();
      const update = (): void => {
        const left = Math.max(0, Math.ceil((endsAtLocal - Date.now()) / 1000));
        timer.textContent = `${String(left)}s`;
      };
      update();
      tick = window.setInterval(update, 250);
      action.focus({ preventScroll: true });
    },
    progress(id, progress) {
      if (current?.id !== id || current.goal === undefined) return;
      progressText.textContent = STRINGS.events.progress(progress, current.goal);
    },
    end(id, message) {
      if (current?.id !== id) return;
      current = null;
      stopTick();
      text.textContent = message;
      action.hidden = true;
      progressText.textContent = '';
      timer.textContent = '';
      hideTimer = window.setTimeout(() => {
        banner.hidden = true;
      }, 3500);
    },
    dispose() {
      stopTick();
      window.clearTimeout(hideTimer);
      banner.remove();
    },
  };
}
