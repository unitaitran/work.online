// Tường than thở chung (server): một dòng ẩn danh mỗi ngày, lọc ở server, nút báo cáo.
// Nội dung người chơi luôn gán bằng textContent.
import { WALL_MAX_LENGTH, type WallPost } from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface WallApi {
  list(): Promise<WallPost[] | null>;
  post(text: string): Promise<{ ok: true; posts: WallPost[] } | { ok: false; reason: string }>;
  report(id: number): Promise<WallPost[] | null>;
}

export function mountWallPanel(body: HTMLElement, api: WallApi): void {
  const s = STRINGS.wall;
  const input = el('input', {
    className: 'creator-input vent-input',
    attrs: {
      type: 'text',
      placeholder: s.placeholder,
      'aria-label': s.title,
      autocomplete: 'off',
      maxlength: String(WALL_MAX_LENGTH * 2),
    },
  });
  const counter = el('span', { className: 'vent-counter', attrs: { 'aria-live': 'polite' } });
  const post = el('button', {
    className: 'button button-primary',
    text: s.post,
    attrs: { type: 'submit' },
  });
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const list = el('ul', { className: 'vent-list' });

  const renderCounter = (): void => {
    const n = Array.from(input.value.trim()).length;
    counter.textContent = `${String(n)}/${String(WALL_MAX_LENGTH)}`;
    counter.classList.toggle('is-over', n > WALL_MAX_LENGTH);
  };
  const render = (posts: readonly WallPost[]): void => {
    if (posts.length === 0) {
      list.replaceChildren(el('li', { className: 'vent-empty', text: s.empty }));
      return;
    }
    list.replaceChildren(
      ...posts.map((p) => {
        const meta: HTMLElement[] = [el('span', { text: p.day })];
        if (p.mine) meta.push(el('span', { text: ` · ${s.mine}` }));
        else {
          const report = el('button', {
            className: 'link-button',
            text: p.reportedByMe ? s.reported : s.report,
            attrs: { type: 'button' },
          });
          report.disabled = p.reportedByMe;
          report.addEventListener('click', () => {
            report.disabled = true;
            void api.report(p.id).then((posts2) => {
              if (posts2) render(posts2);
            });
          });
          meta.push(el('span', { text: ' · ' }), report);
        }
        return el('li', {
          className: 'vent-item',
          children: [
            el('p', { className: 'vent-text', text: p.text }),
            el('p', { className: 'vent-meta', children: meta }),
          ],
        });
      }),
    );
  };

  const form = el('form', {
    className: 'vent-form',
    children: [input, el('div', { className: 'vent-row', children: [counter, post] })],
  });
  input.addEventListener('input', renderCounter);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) {
      message.textContent = s.errors.empty ?? '';
      return;
    }
    post.disabled = true;
    void api.post(text).then((result) => {
      post.disabled = false;
      if (result.ok) {
        input.value = '';
        renderCounter();
        message.textContent = '';
        render(result.posts);
      } else {
        message.textContent = s.errors[result.reason] ?? STRINGS.net.actionFailed;
        message.dataset.tone = 'error';
      }
    });
  });

  body.append(el('p', { className: 'activity-intro', text: s.intro }), form, message, list);
  renderCounter();
  void api.list().then((posts) => {
    if (posts) render(posts);
  });
}
