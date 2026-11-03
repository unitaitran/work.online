// Khung tài khoản ở màn "Ở nhà": đăng ký (giữ tiến độ đang chơi) hoặc đăng nhập tài khoản khác,
// kiểm tra tên đăng nhập ngay khi gõ, và vào bằng mã khôi phục (tài khoản ẩn danh cũ).
import type { UsernameCheckResponse } from '@dilam/shared';
import { validateCredentials, type SessionError } from '../net/session';
import { STRINGS } from '../strings';
import { el } from './dom';

const a = STRINGS.auth;

export function errorText(error: string): string {
  return a.errors[error] ?? a.errors.other ?? '';
}

export interface AccountFormActions {
  /** Đăng ký cho tài khoản đang chơi (giữ tiến độ). null là thành công. */
  register: (username: string, password: string) => Promise<SessionError | null>;
  /** Đăng nhập tài khoản khác (thành công thì trang tải lại). */
  login: (username: string, password: string) => Promise<SessionError | null>;
  recover: (code: string) => Promise<SessionError | null>;
  checkUsername: (username: string) => Promise<UsernameCheckResponse | null>;
  onRegistered: (username: string) => void;
}

const CHECK_DELAY_MS = 450;

/** Ô nhập tên + mật khẩu; ở chế độ đăng ký thì báo ngay tên đã có người dùng hay chưa. */
function credentialFields(
  mode: 'login' | 'register',
  check: AccountFormActions['checkUsername'],
): { element: HTMLElement; read(): { username: string; password: string }; dispose(): void } {
  const username = el('input', {
    className: 'creator-input',
    attrs: {
      type: 'text',
      name: 'username',
      autocomplete: 'username',
      autocapitalize: 'none',
      spellcheck: 'false',
      maxlength: '20',
      'aria-label': a.username,
      placeholder: a.username,
    },
  });
  const password = el('input', {
    className: 'creator-input',
    attrs: {
      type: 'password',
      name: 'password',
      autocomplete: mode === 'login' ? 'current-password' : 'new-password',
      maxlength: '72',
      'aria-label': a.password,
      placeholder: mode === 'register' ? `${a.password} (${a.passwordHint})` : a.password,
    },
  });
  const status = el('small', { className: 'auth-hint', attrs: { 'aria-live': 'polite' } });
  if (mode === 'register') status.textContent = a.usernameHint;

  let timer: number | undefined;
  let asked = '';
  if (mode === 'register') {
    username.addEventListener('input', () => {
      window.clearTimeout(timer);
      const name = username.value.trim().toLowerCase();
      status.dataset.tone = '';
      if (name.length < 3) {
        status.textContent = a.usernameHint;
        return;
      }
      if (validateCredentials(name, 'xxxxxxxx') === 'username') {
        status.textContent = errorText('username');
        status.dataset.tone = 'error';
        return;
      }
      status.textContent = a.checking;
      timer = window.setTimeout(() => {
        asked = name;
        void check(name).then((result) => {
          if (asked !== name || username.value.trim().toLowerCase() !== name) return;
          if (!result) {
            status.textContent = a.usernameHint;
            return;
          }
          status.textContent = result.available ? a.available : errorText(result.reason ?? 'other');
          status.dataset.tone = result.available ? 'ok' : 'error';
        });
      }, CHECK_DELAY_MS);
    });
  }

  return {
    element: el('div', { className: 'auth-fields', children: [username, status, password] }),
    read: () => ({ username: username.value.trim().toLowerCase(), password: password.value }),
    dispose: () => {
      window.clearTimeout(timer);
    },
  };
}

/** Khung đăng ký / đăng nhập (dùng cho người chơi thử và tài khoản ẩn danh cũ). */
export function mountAccountForm(
  root: HTMLElement,
  actions: AccountFormActions,
): { dispose(): void } {
  let mode: 'register' | 'login' = 'register';
  let fields: ReturnType<typeof credentialFields> | null = null;
  let busy = false;
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const tabs = el('div', { className: 'auth-tabs', attrs: { role: 'tablist' } });
  const formBox = el('div');

  const show = (text: string, tone: 'ok' | 'error'): void => {
    message.textContent = text;
    message.dataset.tone = tone;
  };

  const render = (): void => {
    fields?.dispose();
    tabs.replaceChildren(
      ...(['register', 'login'] as const).map((id) => {
        const tab = el('button', {
          className: `auth-tab${id === mode ? ' is-active' : ''}`,
          text: id === 'login' ? a.loginTab : a.registerTab,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(id === mode) },
        });
        tab.addEventListener('click', () => {
          mode = id;
          message.textContent = '';
          render();
        });
        return tab;
      }),
    );
    const current = credentialFields(mode, actions.checkUsername);
    fields = current;
    const submit = el('button', {
      className: 'button button-primary',
      text: mode === 'login' ? a.login : a.register,
      attrs: { type: 'submit' },
    });
    const form = el('form', { className: 'auth-form', children: [current.element, submit] });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy) return;
      const { username, password } = current.read();
      const invalid = validateCredentials(username, password);
      if (invalid && mode === 'register') {
        show(errorText(invalid), 'error');
        return;
      }
      busy = true;
      submit.disabled = true;
      show(a.working, 'ok');
      const task =
        mode === 'login' ? actions.login(username, password) : actions.register(username, password);
      void task.then((error) => {
        busy = false;
        submit.disabled = false;
        if (error) {
          show(errorText(error), 'error');
          return;
        }
        if (mode === 'register') actions.onRegistered(username);
      });
    });
    formBox.replaceChildren(form);
  };
  render();

  // Tài khoản ẩn danh cũ: vào bằng mã khôi phục.
  const recoverInput = el('input', {
    className: 'creator-input',
    attrs: {
      type: 'text',
      autocapitalize: 'characters',
      spellcheck: 'false',
      maxlength: '40',
      placeholder: a.recoverPlaceholder,
      'aria-label': a.recover,
    },
  });
  const recoverButton = el('button', {
    className: 'button button-soft',
    text: a.recoverSubmit,
    attrs: { type: 'button' },
  });
  recoverButton.addEventListener('click', () => {
    const code = recoverInput.value.trim();
    if (code.length < 16 || busy) return;
    busy = true;
    show(a.working, 'ok');
    void actions.recover(code).then((error) => {
      busy = false;
      if (error) show(errorText(error), 'error');
    });
  });
  const recover = el('details', {
    className: 'auth-recover',
    children: [
      el('summary', { text: a.recover }),
      el('div', { className: 'creator-name-row', children: [recoverInput, recoverButton] }),
    ],
  });

  const box = el('div', { className: 'account-form', children: [tabs, formBox, message, recover] });
  root.append(box);
  return {
    dispose: () => {
      fields?.dispose();
      box.remove();
    },
  };
}
