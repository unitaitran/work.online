import { STRINGS } from '../../strings';
import { el } from '../../ui/dom';
import { validateVent, VENT_MAX_LENGTH, type VentEntry } from './ventWall';

export interface VentWallPanelOptions {
  entries: readonly VentEntry[];
  /** Lưu một dòng hợp lệ; trả về danh sách mới để hiển thị. */
  onPost(text: string, anonymous: boolean): readonly VentEntry[];
}

function formatWhen(at: number): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(at);
}

export function mountVentWallPanel(body: HTMLElement, options: VentWallPanelOptions): void {
  const s = STRINGS.vent;
  const input = el('input', {
    className: 'creator-input vent-input',
    attrs: { type: 'text', placeholder: s.placeholder, 'aria-label': s.title, autocomplete: 'off' },
  });
  const counter = el('span', { className: 'vent-counter', attrs: { 'aria-live': 'polite' } });
  const anonymous = el('input', { attrs: { type: 'checkbox', id: 'vent-anonymous' } });
  anonymous.checked = true;
  const post = el('button', {
    className: 'button button-primary',
    text: s.post,
    attrs: { type: 'submit' },
  });
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const list = el('ul', { className: 'vent-list' });

  const renderCounter = (): void => {
    const length = Array.from(input.value.trim()).length;
    counter.textContent = s.counter(length, VENT_MAX_LENGTH);
    counter.classList.toggle('is-over', length > VENT_MAX_LENGTH);
  };

  const renderList = (entries: readonly VentEntry[]): void => {
    if (entries.length === 0) {
      list.replaceChildren(el('li', { className: 'vent-empty', text: s.none }));
      return;
    }
    list.replaceChildren(
      ...entries.slice(0, 8).map((entry) =>
        el('li', {
          className: 'vent-item',
          children: [
            el('p', { className: 'vent-text', text: entry.text }),
            el('p', {
              className: 'vent-meta',
              text: `${entry.author ?? s.anonymousAuthor} · ${formatWhen(entry.at)}`,
            }),
          ],
        }),
      ),
    );
  };

  const form = el('form', {
    className: 'vent-form',
    children: [
      input,
      el('div', {
        className: 'vent-row',
        children: [
          el('label', {
            className: 'vent-check',
            children: [anonymous, el('span', { text: s.anonymous })],
          }),
          counter,
          post,
        ],
      }),
    ],
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateVent(input.value);
    if (!result.ok) {
      message.textContent = result.reason === 'empty' ? s.empty : s.tooLong(VENT_MAX_LENGTH);
      message.dataset.tone = 'error';
      return;
    }
    renderList(options.onPost(result.text, anonymous.checked));
    input.value = '';
    renderCounter();
    message.textContent = s.posted;
    message.dataset.tone = 'ok';
  });
  input.addEventListener('input', renderCounter);

  body.append(
    el('p', { className: 'activity-intro', text: s.intro }),
    form,
    message,
    el('h3', { className: 'vent-heading', text: s.recent }),
    list,
  );
  renderCounter();
  renderList(options.entries);
  input.focus();
}
