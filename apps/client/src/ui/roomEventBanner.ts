// Băng rôn sự kiện phòng ở đầu màn hình: tiêu đề, lời nhắn, nút tham gia, đếm ngược, tiến độ.
import type { RoomEventView } from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface RoomEventBanner {
  show(event: RoomEventView, serverOffsetMs: number): void;
  progress(id: number, progress: number): void;
  /** Người chơi đã làm xong phần của mình (ví dụ đã ngồi vào phòng họp): báo ngắn rồi ẩn. */
  dismiss(id: number, text: string): void;
  /** Sự kiện kết thúc. Trả false nếu banner đã ẩn từ trước (khi đó tự báo kết quả bằng toast). */
  end(id: number, text: string): boolean;
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
  let dismissedId: number | null = null;
  let endsAtLocal = 0;
  let tick: number | undefined;
  let hideTimer: number | undefined;

  // Đánh dấu trên lớp HUD để thông báo nhỏ (toast) dời xuống dưới banner, không đè nhau.
  const setVisible = (visible: boolean): void => {
    banner.hidden = !visible;
    root.classList.toggle('has-room-event', visible);
    if (visible) {
      window.requestAnimationFrame(() => {
        // offsetTop/offsetHeight không bị hiệu ứng phóng to lúc hiện làm sai kích thước.
        const bottom = banner.offsetTop + banner.offsetHeight;
        root.style.setProperty('--room-event-bottom', `${String(bottom)}px`);
      });
    }
  };
  const hideLater = (ms: number): void => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      setVisible(false);
    }, ms);
  };

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
      // Sự kiện nào cũng có nút: bấm là tự chạy tới làm nhiệm vụ.
      action.hidden = false;
      action.disabled = false;
      progressText.textContent =
        event.goal !== undefined ? STRINGS.events.progress(event.progress ?? 0, event.goal) : '';
      endsAtLocal = event.endsAt - serverOffsetMs;
      dismissedId = null;
      setVisible(true);
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
    dismiss(id, message) {
      if (current?.id !== id || dismissedId === id) return;
      dismissedId = id;
      stopTick();
      text.textContent = message;
      action.hidden = true;
      progressText.textContent = '';
      timer.textContent = '';
      hideLater(2000);
    },
    end(id, message) {
      if (current?.id !== id) return false;
      current = null;
      stopTick();
      if (dismissedId === id) return false;
      text.textContent = message;
      action.hidden = true;
      progressText.textContent = '';
      timer.textContent = '';
      hideLater(3500);
      return true;
    },
    dispose() {
      stopTick();
      window.clearTimeout(hideTimer);
      root.classList.remove('has-room-event');
      banner.remove();
    },
  };
}
