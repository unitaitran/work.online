// Màn "Ở nhà": ra khỏi văn phòng (nút Đi về, hoặc vừa nghỉ việc). Từ đây đi làm lại, mở công ty,
// xem bản đồ công ty, đổi nhân vật, lưu tài khoản (khách) hoặc đăng xuất.
import { STRINGS } from '../strings';
import type { SessionError } from '../net/session';
import { validateCredentials } from '../net/session';
import { credentialFields, errorText } from './authScreen';
import { el } from './dom';

export interface LobbyOptions {
  name: string;
  stats: string;
  /** Nơi làm hiện tại (null: đang nghỉ việc). */
  workplace: string | null;
  notice: string | null;
  account: { guest: boolean; username: string | null };
  onWork(): void;
  onCompany(): void;
  onCompanyMap(): void;
  onWardrobe(): void;
  /** Lưu tài khoản (khách / tài khoản cũ): null là thành công. */
  onRegister(username: string, password: string): Promise<SessionError | null>;
  onLogout(): void;
}

const s = STRINGS.lobby;

export function mountLobbyPanel(
  root: HTMLElement,
  options: LobbyOptions,
): { element: HTMLElement; getInset(): { right: number; bottom: number }; dispose(): void } {
  const button = (text: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const b = el('button', {
      className: primary ? 'button button-primary' : 'button button-soft',
      text,
      attrs: { type: 'button' },
    });
    b.addEventListener('click', onClick);
    return b;
  };

  const account = el('div', { className: 'lobby-account' });
  const renderAccount = (): void => {
    const { guest, username } = options.account;
    if (username && !guest) {
      account.replaceChildren(el('p', { className: 'fortune-note', text: s.signedInAs(username) }));
    } else {
      const fields = credentialFields('register');
      const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
      const save = el('button', {
        className: 'button button-primary',
        text: s.saveAccount,
        attrs: { type: 'submit' },
      });
      const form = el('form', { className: 'auth-form', children: [fields.element, save] });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const { username: name, password } = fields.read();
        const invalid = validateCredentials(name, password);
        if (invalid) {
          message.textContent = errorText(invalid);
          message.dataset.tone = 'error';
          return;
        }
        save.disabled = true;
        void options.onRegister(name, password).then((error) => {
          save.disabled = false;
          if (error) {
            message.textContent = errorText(error);
            message.dataset.tone = 'error';
            return;
          }
          options.account = { guest: false, username: name };
          renderAccount();
          account.append(el('p', { className: 'activity-message', text: s.saved }));
        });
      });
      account.replaceChildren(
        el('p', {
          className: `notice${guest ? ' notice-warn' : ''}`,
          text: guest ? s.guestWarn : s.legacy,
        }),
        form,
        message,
      );
    }
  };
  renderAccount();

  let logoutArmed = false;
  const logout = button(s.logout, () => {
    if (options.account.guest && !logoutArmed) {
      logoutArmed = true;
      logout.textContent = s.logoutGuestConfirm;
      logout.classList.add('button-danger');
      return;
    }
    options.onLogout();
  });

  const panel = el('section', {
    className: 'creator-panel lobby-panel',
    attrs: { 'aria-labelledby': 'lobby-title' },
    children: [
      el('h1', { className: 'creator-title', text: s.title, attrs: { id: 'lobby-title' } }),
      el('p', { className: 'creator-subtitle', text: `${s.hello(options.name)} ${options.stats}` }),
      ...(options.notice ? [el('p', { className: 'notice', text: options.notice })] : []),
      ...(options.workplace === null ? [el('p', { className: 'notice', text: s.unemployed })] : []),
      el('div', {
        className: 'lobby-actions',
        children: [
          button(
            options.workplace ? s.workAt(options.workplace) : s.workDefault,
            () => {
              options.onWork();
            },
            true,
          ),
          button(s.company, () => {
            options.onCompany();
          }),
          button(s.companyMap, () => {
            options.onCompanyMap();
          }),
          button(s.wardrobe, () => {
            options.onWardrobe();
          }),
        ],
      }),
      account,
      el('div', { className: 'lobby-actions', children: [logout] }),
    ],
  });
  root.append(panel);
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
      panel.remove();
    },
  };
}
