// Màn "Ở nhà": màn đầu tiên khi mở game và khi rời văn phòng. Một nút Đi làm lớn, ba ô to
// (Sửa nhân vật, Công ty, Tìm việc) và khung tài khoản (đăng ký / đăng nhập / đăng xuất).
import { GAME_NAME, type UsernameCheckResponse } from '@dilam/shared';
import type { SessionError } from '../net/session';
import { STRINGS } from '../strings';
import { mountAccountForm } from './accountForm';
import { el } from './dom';

export interface LobbyOptions {
  name: string;
  stats: string;
  /** Nơi làm hiện tại (null: đang nghỉ việc). */
  workplace: string | null;
  notice: string | null;
  account: { guest: boolean; username: string | null };
  onWork: () => void;
  onCompany: () => void;
  onCompanyMap: () => void;
  onEdit: () => void;
  onHelp: () => void;
  /** Đăng ký cho tài khoản đang chơi: null là thành công. */
  onRegister: (username: string, password: string) => Promise<SessionError | null>;
  onLogin: (username: string, password: string) => Promise<SessionError | null>;
  onRecover: (code: string) => Promise<SessionError | null>;
  checkUsername: (username: string) => Promise<UsernameCheckResponse | null>;
  onLogout: () => void;
}

const s = STRINGS.lobby;

export function mountLobbyPanel(
  root: HTMLElement,
  options: LobbyOptions,
): { element: HTMLElement; getInset(): { right: number; bottom: number }; dispose(): void } {
  const tile = (icon: string, text: string, className: string, onClick: () => void) => {
    const b = el('button', {
      className: `lobby-tile ${className}`,
      attrs: { type: 'button' },
      children: [
        el('span', { className: 'lobby-tile-icon', text: icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { className: 'lobby-tile-text', text }),
      ],
    });
    b.addEventListener('click', onClick);
    return b;
  };

  const work = el('button', {
    className: 'button button-primary lobby-work',
    attrs: { type: 'button' },
    children: [
      el('span', { className: 'lobby-work-icon', text: '🏢', attrs: { 'aria-hidden': 'true' } }),
      el('span', {
        className: 'lobby-work-text',
        children: [
          el('strong', { text: s.work }),
          el('small', {
            text: options.workplace ? s.workAt(options.workplace) : s.workBack,
          }),
        ],
      }),
    ],
  });
  work.addEventListener('click', () => {
    options.onWork();
  });

  const help = el('button', {
    className: 'lobby-help',
    text: '?',
    attrs: { type: 'button', title: s.help, 'aria-label': s.help },
  });
  help.addEventListener('click', () => {
    options.onHelp();
  });

  // ---------- Tài khoản ----------
  const account = el('section', { className: 'lobby-account' });
  let form: { dispose(): void } | null = null;
  let logoutArmed = false;
  const renderAccount = (): void => {
    form?.dispose();
    form = null;
    const { guest, username } = options.account;
    const logout = el('button', {
      className: 'button button-soft lobby-logout',
      text: s.logout,
      attrs: { type: 'button' },
    });
    logout.addEventListener('click', () => {
      if (options.account.guest && !logoutArmed) {
        logoutArmed = true;
        logout.textContent = s.logoutGuestConfirm;
        logout.classList.add('button-danger');
        return;
      }
      options.onLogout();
    });
    if (username && !guest) {
      account.replaceChildren(
        el('div', {
          className: 'lobby-signed-in',
          children: [el('span', { text: s.signedInAs(username) }), logout],
        }),
      );
      return;
    }
    account.replaceChildren(
      el('h2', { className: 'lobby-section-title', text: s.accountTitle }),
      el('p', {
        className: guest ? 'notice notice-warn' : 'notice',
        text: guest ? s.guestWarn : s.legacy,
      }),
    );
    form = mountAccountForm(account, {
      register: options.onRegister,
      login: options.onLogin,
      recover: options.onRecover,
      checkUsername: options.checkUsername,
      onRegistered: (name) => {
        options.account = { guest: false, username: name };
        renderAccount();
        account.append(el('p', { className: 'activity-message', text: s.saved }));
      },
    });
    if (guest) account.append(el('div', { className: 'lobby-actions', children: [logout] }));
  };
  renderAccount();

  const panel = el('section', {
    className: 'creator-panel lobby-panel',
    attrs: { 'aria-labelledby': 'lobby-title' },
    children: [
      el('div', {
        className: 'lobby-head',
        children: [
          el('div', {
            children: [
              el('h1', {
                className: 'creator-title',
                text: s.hello(options.name),
                attrs: { id: 'lobby-title' },
              }),
              el('p', { className: 'lobby-stats', text: options.stats }),
            ],
          }),
          help,
        ],
      }),
      ...(options.notice ? [el('p', { className: 'notice', text: options.notice })] : []),
      ...(options.workplace === null ? [el('p', { className: 'notice', text: s.unemployed })] : []),
      work,
      el('div', {
        className: 'lobby-tiles',
        children: [
          tile('✏️', s.edit, 'lobby-tile-edit', options.onEdit),
          tile('💼', s.company, 'lobby-tile-company', options.onCompany),
          tile('🗺️', s.companyMap, 'lobby-tile-map', options.onCompanyMap),
        ],
      }),
      account,
    ],
  });

  // Logo nhỏ góc trên bên trái.
  const logo = el('div', {
    className: 'home-logo',
    children: [
      el('img', { attrs: { src: '/logo-128.png', alt: '', width: '44', height: '44' } }),
      el('span', { className: 'home-logo-text', text: GAME_NAME }),
    ],
  });

  root.append(logo, panel);
  return {
    element: panel,
    getInset: () => {
      const rect = panel.getBoundingClientRect();
      const wide = window.innerWidth >= 760;
      return wide
        ? { right: window.innerWidth - rect.left, bottom: 0 }
        : { right: 0, bottom: window.innerHeight - rect.top };
    },
    dispose: () => {
      form?.dispose();
      logo.remove();
      panel.remove();
    },
  };
}
