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
  CEO_TITLE,
  GLOBAL_UNLOCK,
  ladderUnlockLevels,
  stepFor,
  type Branch,
  type Workplace,
  type ProgressState,
  jobName,
  jobTagFor,
} from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export type ProfileTab = 'card' | 'log' | 'roadmap' | 'account';
const TABS: readonly ProfileTab[] = ['card', 'log', 'roadmap', 'account'];

export interface ProfileSource {
  readonly state: ProgressState;
  todayEarned(): number;
  onChange(listener: () => void): () => void;
}

export interface AccountActions {
  /** Vào tài khoản khác bằng mã khôi phục; true nếu thành công (trang sẽ tải lại). */
  recover(code: string): Promise<boolean>;
  /** Tạo mã khôi phục mới (mã cũ hết hiệu lực); null nếu lỗi. */
  newRecoveryCode(): Promise<string | null>;
  /** Xoá tài khoản và toàn bộ dữ liệu. */
  deleteAccount(): Promise<boolean>;
  analyticsEnabled(): boolean;
  setAnalytics(enabled: boolean): void;
}

export interface ProfilePanelOptions {
  name: string;
  playerId: string;
  progress: ProfileSource;
  /** Nơi làm hiện tại (công ty người chơi): lộ trình theo công ty đó. */
  workplace?: () => Workplace | null;
  /** Tên công ty người chơi (khi làm ở công ty người chơi). */
  companyName?: () => string | null;
  initialTab?: ProfileTab;
  account: AccountActions;
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
  const currentTitle = jobName(
    jobTagFor(o.workplace?.() ?? null, p.level),
    titleFor(state.xp),
    state.branch,
  );
  const employer = state.employer
    ? (s.card.employers[state.employer] ??
        (state.employer.startsWith('company:') ? o.companyName?.() : null) ??
        s.card.companyUnknown)
    : s.card.unemployed;
  const department = state.department ? DEPARTMENT_NAMES[state.department] : s.card.noDepartment;
  const branch = state.branch ? BRANCH_NAMES[state.branch] : s.card.noBranch;
  const pct = Math.round(p.ratio * 100);

  return el('div', {
    className: 'profile-card-modern',
    children: [
      // Hero Header
      el('div', {
        className: 'profile-head-modern',
        children: [
          el('div', {
            className: 'profile-avatar-badge',
            text: o.name.charAt(0).toUpperCase() || '👤',
          }),
          el('div', {
            className: 'profile-title-block',
            children: [
              el('div', {
                className: 'profile-name-row',
                children: [
                  el('h3', { className: 'profile-name-hero', text: o.name }),
                  el('span', { className: 'badge-pill badge-id', text: `#${o.playerId}` }),
                ],
              }),
              el('div', {
                className: 'profile-role-row',
                children: [
                  el('span', { className: 'badge-pill badge-rank', text: `⭐ Cấp ${p.level}` }),
                  el('span', { className: 'badge-pill badge-title', text: currentTitle }),
                ],
              }),
            ],
          }),
        ],
      }),

      // XP Progress Bar
      el('div', {
        className: 'profile-xp-box',
        children: [
          el('div', {
            className: 'profile-xp-labels',
            children: [
              el('span', { className: 'xp-box-title', text: 'Kinh nghiệm tích luỹ' }),
              el('span', {
                className: 'xp-box-val',
                text: p.isMax
                  ? s.xpMax
                  : `${p.into.toLocaleString('vi-VN')} / ${p.needed.toLocaleString('vi-VN')} XP (${pct}%)`,
              }),
            ],
          }),
          xpBar(
            p.ratio,
            p.isMax
              ? s.xpMax
              : `${p.into.toLocaleString('vi-VN')} / ${p.needed.toLocaleString('vi-VN')} XP`,
          ),
        ],
      }),

      // 4 Bento KPI Metric Cards
      el('div', {
        className: 'profile-kpi-grid',
        children: [
          // Coins
          el('div', {
            className: 'kpi-card kpi-coins',
            children: [
              el('div', {
                className: 'kpi-header',
                children: [
                  el('span', { className: 'kpi-icon', text: '🪙' }),
                  el('span', { className: 'kpi-label', text: s.card.coins }),
                ],
              }),
              el('div', {
                className: 'kpi-value',
                text: `${state.coins.toLocaleString('vi-VN')} xu`,
              }),
              el('div', { className: 'kpi-sub', text: 'Số dư khả dụng' }),
            ],
          }),
          // Reputation
          el('div', {
            className: 'kpi-card kpi-reputation',
            children: [
              el('div', {
                className: 'kpi-header',
                children: [
                  el('span', { className: 'kpi-icon', text: '⭐' }),
                  el('span', { className: 'kpi-label', text: s.card.reputation }),
                ],
              }),
              el('div', { className: 'kpi-value', text: state.reputation.toLocaleString('vi-VN') }),
              el('div', { className: 'kpi-sub', text: 'Độ tín nhiệm công sở' }),
            ],
          }),
          // Streak
          el('div', {
            className: 'kpi-card kpi-streak',
            children: [
              el('div', {
                className: 'kpi-header',
                children: [
                  el('span', { className: 'kpi-icon', text: '🔥' }),
                  el('span', { className: 'kpi-label', text: s.card.streak }),
                ],
              }),
              el('div', {
                className: 'kpi-value',
                text: `${state.checkIn.streak.toLocaleString('vi-VN')} ngày`,
              }),
              el('div', { className: 'kpi-sub', text: 'Chăm chỉ liên tiếp' }),
            ],
          }),
          // Daily XP
          el('div', {
            className: 'kpi-card kpi-today',
            children: [
              el('div', {
                className: 'kpi-header',
                children: [
                  el('span', { className: 'kpi-icon', text: '📈' }),
                  el('span', { className: 'kpi-label', text: s.card.today }),
                ],
              }),
              el('div', {
                className: 'kpi-value',
                text: `${o.progress.todayEarned().toLocaleString('vi-VN')}/${BALANCE.dailySoftCap.toLocaleString('vi-VN')}`,
              }),
              el('div', { className: 'kpi-sub', text: 'Hạn mức tiêu chuẩn' }),
            ],
          }),
        ],
      }),

      // Meta Organization Info Cards
      el('div', {
        className: 'profile-meta-grid',
        children: [
          el('div', {
            className: 'profile-meta-card',
            children: [
              el('span', { className: 'meta-icon', text: '🏢' }),
              el('div', {
                children: [
                  el('small', { text: s.card.company }),
                  el('strong', { text: employer }),
                ],
              }),
            ],
          }),
          el('div', {
            className: 'profile-meta-card',
            children: [
              el('span', { className: 'meta-icon', text: '📂' }),
              el('div', {
                children: [
                  el('small', { text: s.card.department }),
                  el('strong', { text: department }),
                ],
              }),
            ],
          }),
          el('div', {
            className: 'profile-meta-card',
            children: [
              el('span', { className: 'meta-icon', text: '🌿' }),
              el('div', {
                children: [
                  el('small', { text: s.card.branch }),
                  el('strong', { text: branch }),
                ],
              }),
            ],
          }),
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

/** Lộ trình ở công ty người chơi: các bậc CEO đặt (CEO thì một dòng CEO). */
function companyTitles(workplace: Workplace, level: number): HTMLElement {
  if (workplace.owner) {
    return el('ol', {
      className: 'roadmap-titles',
      children: [
        el('li', { className: 'is-current', text: `${CEO_TITLE} (${s.roadmap.current})` }),
      ],
    });
  }
  const current = stepFor(workplace.ladder, level);
  return el('ol', {
    className: 'roadmap-titles',
    children: workplace.ladder.steps.map((step, i) =>
      el('li', {
        className: i === current ? 'is-current' : i < current ? 'is-done' : '',
        text: `${step.name} — ${s.roadmap.minLevel(step.minLevel)}${i === current ? ` (${s.roadmap.current})` : ''}`,
      }),
    ),
  });
}

function renderRoadmap(state: ProgressState, workplace: Workplace | null): HTMLElement {
  const level = levelFor(state.xp);
  const company = canOpenCompany(state);
  const current = titleFor(state.xp);
  const unlockAt =
    workplace && !workplace.owner ? ladderUnlockLevels(workplace.ladder) : GLOBAL_UNLOCK;
  const titles = workplace
    ? companyTitles(workplace, level)
    : el('ol', {
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
    children: [
      ...(workplace && !workplace.owner
        ? [
            el('li', { text: s.roadmap.companyDepartment(unlockAt.department) }),
            el('li', { text: s.roadmap.companyBranch(unlockAt.branch) }),
          ]
        : []),
      ...UNLOCKS.map((unlock) =>
        el('li', { text: `${s.roadmap.unlockAt(unlock.kind, unlock.at)}: ${unlock.text}` }),
      ),
    ],
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
      el('h3', { text: workplace ? s.roadmap.companyTitles : s.roadmap.titles }),
      titles,
      el('h3', { text: s.roadmap.unlocks }),
      unlocks,
      el('h3', { text: s.roadmap.company }),
      companyChecks,
      el('p', { className: 'fortune-note', text: s.roadmap.companyLater }),
    ],
  });
}

function renderAccount(o: ProfilePanelOptions): HTMLElement {
  const a = STRINGS.account;
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const say = (text: string, tone: 'ok' | 'error'): void => {
    message.textContent = text;
    message.dataset.tone = tone;
  };

  const codeBox = el('input', {
    className: 'save-code',
    attrs: { type: 'text', 'aria-label': a.recoverTitle, spellcheck: 'false', autocomplete: 'off' },
  });
  const recover = el('button', {
    className: 'button button-primary',
    text: a.recover,
    attrs: { type: 'button' },
  });
  recover.addEventListener('click', () => {
    recover.disabled = true;
    void o.account.recover(codeBox.value).then((ok) => {
      recover.disabled = false;
      if (!ok) say(a.recoverFailed, 'error');
    });
  });

  const fresh = el('code', { className: 'recovery-code' });
  fresh.hidden = true;
  const newCode = el('button', {
    className: 'button button-soft',
    text: a.newCode,
    attrs: { type: 'button' },
  });
  newCode.addEventListener('click', () => {
    newCode.disabled = true;
    void o.account.newRecoveryCode().then((code) => {
      newCode.disabled = false;
      if (!code) {
        say(STRINGS.net.actionFailed, 'error');
        return;
      }
      fresh.textContent = code;
      fresh.hidden = false;
    });
  });

  const analyticsBox = el('input', { attrs: { type: 'checkbox', id: 'analytics-toggle' } });
  analyticsBox.checked = o.account.analyticsEnabled();
  analyticsBox.addEventListener('change', () => {
    o.account.setAnalytics(analyticsBox.checked);
  });
  const analyticsToggle = el('label', {
    className: 'vent-check',
    children: [analyticsBox, el('span', { text: a.analytics })],
  });

  const confirm = el('input', {
    className: 'save-code',
    attrs: { type: 'text', 'aria-label': a.deleteConfirm, placeholder: a.deleteConfirm },
  });
  const del = el('button', {
    className: 'button button-danger',
    text: a.delete,
    attrs: { type: 'button' },
  });
  del.addEventListener('click', () => {
    if (confirm.value.trim().toUpperCase() !== 'XOA') {
      say(a.deleteConfirm, 'error');
      return;
    }
    del.disabled = true;
    void o.account.deleteAccount().then((ok) => {
      say(ok ? a.deleted : STRINGS.net.actionFailed, ok ? 'ok' : 'error');
      if (!ok) del.disabled = false;
    });
  });

  return el('div', {
    className: 'profile-save',
    children: [
      el('dl', { className: 'profile-grid', children: [row(a.code, o.playerId)] }),
      el('h3', { text: a.recoveryTitle }),
      el('p', { className: 'activity-intro', text: a.newCodeHint }),
      el('div', { className: 'activity-actions', children: [newCode] }),
      fresh,
      el('h3', { text: a.recoverTitle }),
      el('p', { className: 'activity-intro', text: a.recoverHint }),
      codeBox,
      el('div', { className: 'activity-actions', children: [recover] }),
      el('h3', { text: a.privacyTitle }),
      el('ul', {
        className: 'roadmap-unlocks',
        children: a.privacy.map((line) => el('li', { text: line })),
      }),
      analyticsToggle,
      el('h3', { text: a.deleteTitle }),
      el('p', { className: 'activity-intro', text: a.deleteHint }),
      confirm,
      el('div', { className: 'activity-actions', children: [del] }),
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
    // Tab tài khoản không vẽ lại khi tiến độ đổi (giữ nội dung đang nhập).
    const view =
      tab === 'card'
        ? renderCard(state, o)
        : tab === 'log'
          ? renderLog(state)
          : tab === 'roadmap'
            ? renderRoadmap(state, o.workplace?.() ?? null)
            : renderAccount(o);
    content.replaceChildren(view);
  };

  body.append(tabBar, content);
  render();
  const off = o.progress.onChange(() => {
    if (tab !== 'account') render();
  });
  return { dispose: off };
}
