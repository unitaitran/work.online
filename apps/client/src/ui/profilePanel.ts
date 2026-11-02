// Hồ sơ nhân viên: thẻ, nhật ký XP, lộ trình (chức danh + mở công ty), lưu trữ.
import {
  BALANCE,
  BRANCH_NAMES,
  canOpenCompany,
  FIRST_BRANCH_TITLE,
  DEPARTMENT_NAMES,
  levelFor,
  levelProgress,
  titleFor,
  titleMinLevel,
  titleName,
  TITLE_COUNT,
  UNLOCKS,
  type Branch,
  type ProgressState,
} from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export type ProfileTab = 'card' | 'log' | 'roadmap' | 'save';
const TABS: readonly ProfileTab[] = ['card', 'log', 'roadmap', 'save'];

export interface ProfileSource {
  readonly state: ProgressState;
  todayEarned(): number;
  exportCode(): string;
  importCode(
    code: string,
  ): { ok: true } | { ok: false; error: 'format' | 'checksum' | 'version' | 'data' };
  onChange(listener: () => void): () => void;
}

export interface ProfilePanelOptions {
  name: string;
  playerId: string;
  progress: ProfileSource;
  initialTab?: ProfileTab;
}

const s = STRINGS.progress;

function row(label: string, value: string): HTMLElement {
  return el('div', {
    className: 'profile-row',
    children: [el('dt', { text: label }), el('dd', { text: value })],
  });
}

function xpBar(ratio: number, text: string): HTMLElement {
  const fill = el('span', { className: 'xp-bar-fill' });
  fill.style.width = `${String(Math.round(Math.min(1, Math.max(0, ratio)) * 100))}%`;
  return el('div', {
    className: 'xp-bar xp-bar-large',
    attrs: {
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(Math.round(ratio * 100)),
      'aria-label': text,
    },
    children: [fill, el('span', { className: 'xp-bar-text', text })],
  });
}

function renderCard(state: ProgressState, o: ProfilePanelOptions): HTMLElement {
  const p = levelProgress(state.xp);
  return el('div', {
    className: 'profile-card',
    children: [
      el('div', {
        className: 'profile-head',
        children: [
          el('p', { className: 'profile-name', text: o.name }),
          el('p', { className: 'profile-sub', text: `${STRINGS.checkIn.code}: ${o.playerId}` }),
        ],
      }),
      xpBar(p.ratio, p.isMax ? s.xpMax : s.xpBar(p.into, p.needed)),
      el('dl', {
        className: 'profile-grid',
        children: [
          row(s.card.title, titleName(titleFor(state.xp), state.branch)),
          row(s.card.level, String(p.level)),
          row(s.card.xp, String(state.xp)),
          row(s.card.today, s.card.todayValue(o.progress.todayEarned(), BALANCE.dailySoftCap)),
          row(
            s.card.department,
            state.department ? DEPARTMENT_NAMES[state.department] : s.card.noDepartment,
          ),
          row(s.card.branch, state.branch ? BRANCH_NAMES[state.branch] : s.card.noBranch),
          row(
            s.card.company,
            state.employer
              ? (s.card.employers[state.employer] ?? state.employer)
              : s.card.unemployed,
          ),
          row(s.card.streak, s.card.streakValue(state.checkIn.streak)),
          row(s.card.coins, String(state.coins)),
          row(s.card.reputation, String(state.reputation)),
        ],
      }),
    ],
  });
}

function renderLog(state: ProgressState): HTMLElement {
  if (state.log.length === 0) return el('p', { className: 'activity-intro', text: s.log.empty });
  const fmt = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
  return el('ol', {
    className: 'xp-log',
    children: [...state.log].reverse().map((entry) =>
      el('li', {
        children: [
          el('span', { className: 'xp-log-time', text: fmt.format(entry.at) }),
          el('span', {
            className: 'xp-log-source',
            text: s.log.sources[entry.source] ?? entry.source,
          }),
          el('span', {
            className: 'xp-log-xp',
            text:
              s.xpGain(entry.xp) + (entry.xp < entry.base ? ` (${s.log.capped(entry.base)})` : ''),
          }),
        ],
      }),
    ),
  });
}

/** Chưa chọn nhánh thì các chức danh theo nhánh hiện cả hai tên (Quản lý / Chuyên môn). */
function roadmapTitle(title: number, branch: Branch | null): string {
  if (branch !== null || title < FIRST_BRANCH_TITLE) return titleName(title, branch);
  return `${titleName(title, 'manager')} / ${titleName(title, 'specialist')}`;
}

function renderRoadmap(state: ProgressState): HTMLElement {
  const level = levelFor(state.xp);
  const company = canOpenCompany(state);
  const current = titleFor(state.xp);
  const titles = el('ol', {
    className: 'roadmap-titles',
    children: Array.from({ length: TITLE_COUNT }, (_, i) => {
      const title = i + 1;
      const item = el('li', {
        className: title === current ? 'is-current' : title < current ? 'is-done' : '',
        text: `${roadmapTitle(title, state.branch)} — ${s.roadmap.minLevel(titleMinLevel(title))}${title === current ? ` (${s.roadmap.current})` : ''}`,
      });
      return item;
    }),
  });
  const unlocks = el('ul', {
    className: 'roadmap-unlocks',
    children: UNLOCKS.map((unlock) =>
      el('li', { text: `${s.roadmap.unlockAt(unlock.kind, unlock.at)}: ${unlock.text}` }),
    ),
  });
  const companyChecks = el('ul', {
    className: 'check-list',
    children: [
      el('li', {
        className: company.missing.includes('level') ? 'is-missing' : 'is-met',
        text: s.roadmap.companyLevel(BALANCE.company.unlockLevel, level),
      }),
      el('li', {
        className: company.missing.includes('employed') ? 'is-missing' : 'is-met',
        text: s.roadmap.companyLeave,
      }),
    ],
  });
  return el('div', {
    className: 'profile-roadmap',
    children: [
      el('h3', { text: s.roadmap.titles }),
      titles,
      el('h3', { text: s.roadmap.unlocks }),
      unlocks,
      el('h3', { text: s.roadmap.company }),
      companyChecks,
      el('p', { className: 'fortune-note', text: s.roadmap.companyLater }),
    ],
  });
}

function renderSave(o: ProfilePanelOptions): HTMLElement {
  const exportBox = el('textarea', {
    className: 'save-code',
    attrs: { readonly: '', rows: '3', 'aria-label': s.save.exportTitle },
  });
  exportBox.value = o.progress.exportCode();
  const copy = el('button', {
    className: 'button button-soft',
    text: s.save.copy,
    attrs: { type: 'button' },
  });
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  copy.addEventListener('click', () => {
    exportBox.select();
    // Trang không chạy HTTPS thì không có clipboard: vẫn đã bôi đen sẵn để người chơi tự chép.
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(exportBox.value))
      .catch(() => undefined);
    message.textContent = s.save.copied;
    message.dataset.tone = 'ok';
  });
  const importBox = el('textarea', {
    className: 'save-code',
    attrs: { rows: '3', 'aria-label': s.save.importTitle, spellcheck: 'false' },
  });
  const importButton = el('button', {
    className: 'button button-primary',
    text: s.save.import,
    attrs: { type: 'button' },
  });
  importButton.addEventListener('click', () => {
    const result = o.progress.importCode(importBox.value);
    message.textContent = result.ok ? s.save.imported : s.save.errors[result.error];
    message.dataset.tone = result.ok ? 'ok' : 'error';
    if (result.ok) exportBox.value = o.progress.exportCode();
  });
  return el('div', {
    className: 'profile-save',
    children: [
      el('h3', { text: s.save.exportTitle }),
      el('p', { className: 'activity-intro', text: s.save.exportHint }),
      exportBox,
      el('div', { className: 'activity-actions', children: [copy] }),
      el('h3', { text: s.save.importTitle }),
      el('p', { className: 'activity-intro', text: s.save.importHint }),
      importBox,
      el('div', { className: 'activity-actions', children: [importButton] }),
      message,
    ],
  });
}

export function mountProfilePanel(body: HTMLElement, o: ProfilePanelOptions): { dispose(): void } {
  let tab: ProfileTab = o.initialTab ?? 'card';
  const tabBar = el('div', { className: 'profile-tabs', attrs: { role: 'tablist' } });
  const content = el('div', { className: 'profile-content', attrs: { role: 'tabpanel' } });

  const render = (): void => {
    tabBar.replaceChildren(
      ...TABS.map((id) => {
        const button = el('button', {
          className: 'profile-tab',
          text: s.tabs[id],
          attrs: {
            type: 'button',
            role: 'tab',
            'aria-selected': String(id === tab),
            'data-tab': id,
          },
        });
        button.addEventListener('click', () => {
          tab = id;
          render();
        });
        return button;
      }),
    );
    const state = o.progress.state;
    // Tab lưu trữ không vẽ lại khi tiến độ đổi (giữ nội dung đang nhập).
    const view =
      tab === 'card'
        ? renderCard(state, o)
        : tab === 'log'
          ? renderLog(state)
          : tab === 'roadmap'
            ? renderRoadmap(state)
            : renderSave(o);
    content.replaceChildren(view);
  };

  body.append(tabBar, content);
  render();
  const off = o.progress.onChange(() => {
    if (tab !== 'save') render();
  });
  return { dispose: off };
}
