import { runConnectionTest } from '../net/connectionTest';
import { STRINGS } from '../strings';
import { describeConnectionResult } from './connectionStatus';

export interface HudOptions {
  title: string;
  wsUrl: string;
}

export interface Hud {
  showError(text: string): void;
}

/** Dựng HUD Phase 0: tiêu đề, nút "Thử kết nối" và dòng trạng thái. */
export function mountHud(root: HTMLElement, options: HudOptions): Hud {
  const card = document.createElement('section');
  card.className = 'hud-card';

  const title = document.createElement('h1');
  title.className = 'hud-title';
  title.textContent = options.title;

  const tagline = document.createElement('p');
  tagline.className = 'hud-tagline';
  tagline.textContent = STRINGS.hud.tagline;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button';
  button.textContent = STRINGS.hud.connectButton;

  const status = document.createElement('p');
  status.className = 'hud-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  // Luôn dùng textContent: nội dung từ server không bao giờ được chèn dưới dạng HTML.
  const setStatus = (text: string, tone: 'ok' | 'error' | 'pending'): void => {
    status.textContent = text;
    status.dataset.tone = tone;
  };

  button.addEventListener('click', () => {
    button.disabled = true;
    setStatus(STRINGS.connection.connecting, 'pending');
    void runConnectionTest(options.wsUrl, STRINGS.connection.testMessage).then((result) => {
      const view = describeConnectionResult(result);
      setStatus(view.text, view.tone);
      button.disabled = false;
    });
  });

  card.append(title, tagline, button, status);
  root.append(card);

  return {
    showError(text) {
      setStatus(text, 'error');
    },
  };
}
