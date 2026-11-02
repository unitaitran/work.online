// Trang debug: xem lại các sự kiện hoạt động đã phát (đọc từ localStorage).
// Tự cập nhật khi tab văn phòng phát thêm sự kiện (sự kiện "storage" giữa các tab).
import './style.css';
import {
  ACTIVITY_EVENT_TYPES,
  clearEventLog,
  EVENT_LOG_KEY,
  loadEventLog,
  type ActivityEvent,
} from './activities/events';
import { openLocalStorage } from './storage';
import { STRINGS } from './strings';
import { el } from './ui/dom';

const s = STRINGS.eventsPage;
const root = document.querySelector('#events-root');
if (!(root instanceof HTMLElement)) throw new Error('Missing #events-root');
document.title = s.title;

const store = openLocalStorage();
let filter = '';

const select = el('select', {
  className: 'quality-select',
  attrs: { 'aria-label': s.filterLabel },
});
select.append(el('option', { text: s.filterAll, attrs: { value: '' } }));
for (const type of ACTIVITY_EVENT_TYPES)
  select.append(el('option', { text: type, attrs: { value: type } }));
select.addEventListener('change', () => {
  filter = select.value;
  render();
});

const clear = el('button', {
  className: 'button button-soft',
  text: s.clear,
  attrs: { type: 'button' },
});
clear.addEventListener('click', () => {
  clearEventLog(store);
  render();
});

const count = el('p', { className: 'events-count' });
const table = el('table', { className: 'events-table' });

function formatTime(at: number): string {
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(at);
}

function row(event: ActivityEvent): HTMLTableRowElement {
  return el('tr', {
    children: [
      el('td', { text: formatTime(event.startedAt) }),
      el('td', { children: [el('code', { text: event.type })] }),
      el('td', { text: `${(event.durationMs / 1000).toFixed(1)} s` }),
      el('td', {
        children: [el('code', { className: 'events-detail', text: JSON.stringify(event.detail) })],
      }),
    ],
  });
}

function render(): void {
  const events = loadEventLog(store)
    .filter((event) => filter === '' || event.type === filter)
    .reverse();
  count.textContent = s.count(events.length);
  const head = el('thead', {
    children: [
      el('tr', {
        children: [s.columns.time, s.columns.type, s.columns.duration, s.columns.detail].map(
          (label) => el('th', { text: label, attrs: { scope: 'col' } }),
        ),
      }),
    ],
  });
  const body =
    events.length === 0
      ? el('tbody', {
          children: [
            el('tr', { children: [el('td', { text: s.empty, attrs: { colspan: '4' } })] }),
          ],
        })
      : el('tbody', { children: events.map(row) });
  table.replaceChildren(head, body);
}

root.append(
  el('header', {
    className: 'events-header',
    children: [
      el('h1', { text: s.title }),
      el('p', { className: 'activity-intro', text: s.intro }),
      el('div', {
        className: 'events-toolbar',
        children: [
          select,
          clear,
          el('a', { className: 'button button-soft', text: s.back, attrs: { href: './?debug' } }),
          count,
        ],
      }),
    ],
  }),
  el('div', { className: 'events-scroll', children: [table] }),
);

window.addEventListener('storage', (event) => {
  if (event.key === EVENT_LOG_KEY || event.key === null) render();
});
render();
