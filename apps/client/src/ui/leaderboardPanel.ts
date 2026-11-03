// Bảng xếp hạng tuần/tháng, theo phòng ban hoặc tổng; tuỳ chọn ẩn mình.
import {
  DEPARTMENT_NAMES,
  DEPARTMENTS,
  titleName,
  type Department,
  type LeaderboardPeriod,
  type LeaderboardResponse,
} from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface LeaderboardApi {
  load(
    period: LeaderboardPeriod,
    department: Department | 'all',
  ): Promise<LeaderboardResponse | null>;
  setHidden(hidden: boolean): Promise<boolean>;
}

export function mountLeaderboardPanel(body: HTMLElement, api: LeaderboardApi): void {
  const s = STRINGS.board;
  let period: LeaderboardPeriod = 'week';
  let department: Department | 'all' = 'all';
  const tabs = el('div', { className: 'profile-tabs', attrs: { role: 'tablist' } });
  const select = el('select', { className: 'board-select', attrs: { 'aria-label': s.all } });
  select.append(
    el('option', { text: s.all, attrs: { value: 'all' } }),
    ...DEPARTMENTS.map((d) => el('option', { text: DEPARTMENT_NAMES[d], attrs: { value: d } })),
  );
  const since = el('p', { className: 'fortune-note' });
  const list = el('ol', { className: 'board-list' });
  const mine = el('p', { className: 'board-mine' });
  const hide = el('input', { attrs: { type: 'checkbox', id: 'board-hide' } });

  const load = (): void => {
    tabs.replaceChildren(
      ...(['week', 'month'] as const).map((p) => {
        const b = el('button', {
          className: 'profile-tab',
          text: p === 'week' ? s.week : s.month,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(p === period) },
        });
        b.addEventListener('click', () => {
          period = p;
          load();
        });
        return b;
      }),
    );
    void api.load(period, department).then((data) => {
      if (!data) return;
      since.textContent = s.since(data.since);
      hide.checked = data.hidden;
      list.replaceChildren(
        ...(data.rows.length === 0
          ? [el('li', { className: 'activity-intro', text: s.empty })]
          : data.rows.map((row) =>
              el('li', {
                className: row.me ? 'is-me' : '',
                children: [
                  el('span', { className: 'board-rank', text: `#${String(row.rank)}` }),
                  el('span', {
                    className: 'board-name',
                    children: [
                      el('strong', { text: row.name }),
                      el('span', { text: ` · ${titleName(row.title, row.branch)}` }),
                    ],
                  }),
                  el('span', { className: 'board-xp', text: s.xp(row.xp) }),
                ],
              }),
            )),
      );
      mine.textContent = data.mine ? s.mine(data.mine.rank) : '';
    });
  };

  select.addEventListener('change', () => {
    department = select.value as Department | 'all';
    load();
  });
  hide.addEventListener('change', () => {
    void api.setHidden(hide.checked).then(load);
  });
  body.append(
    tabs,
    select,
    since,
    list,
    mine,
    el('label', { className: 'vent-check', children: [hide, el('span', { text: s.hideMe })] }),
  );
  load();
}
