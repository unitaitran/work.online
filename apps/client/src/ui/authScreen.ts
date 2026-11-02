// Màn mở đầu khi chưa có phiên: chơi khách, đăng nhập, đăng ký, hoặc khôi phục tài khoản cũ.
import { GAME_NAME } from '@dilam/shared';
import { validateCredentials, type SignInResult } from '../net/session';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface AuthActions {
  guest(): Promise<SignInResult>;
  login(username: string, password: string): Promise<SignInResult>;
  register(username: string, password: string): Promise<SignInResult>;
  recover(code: string): Promise<SignInResult>;
}

const a = STRINGS.auth;

/** Mẫu nhập tên + mật khẩu (dùng lại ở màn "Ở nhà" để khách lưu tài khoản). */
export function credentialFields(mode: 'login' | 'register'): {
  element: HTMLElement;
  read(): { username: string; password: string };
  focus(): void;
} {
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
      placeholder: a.password,
    },
  });
  const field = (label: string, input: HTMLInputElement, hint: string | null): HTMLElement =>
    el('label', {
      className: 'auth-field',
      children: [
        el('span', { className: 'creator-label', text: label }),
        input,
        ...(hint ? [el('small', { className: 'auth-hint', text: hint })] : []),
      ],
    });
  return {
    element: el('div', {
      className: 'auth-fields',
      children: [
        field(a.username, username, mode === 'register' ? a.usernameHint : null),
        field(a.password, password, mode === 'register' ? a.passwordHint : null),
      ],
    }),
    read: () => ({ username: username.value.trim().toLowerCase(), password: password.value }),
    focus: () => {
      username.focus();
    },
  };
}

export function errorText(error: string): string {
  return a.errors[error] ?? a.errors.other ?? '';
}

/** Hiện màn mở đầu; trả kết quả khi người chơi vào được. */
export function showAuthScreen(root: HTMLElement, actions: AuthActions): Promise<SignInResult> {
  return new Promise((resolve) => {
    let mode: 'login' | 'register' = 'login';
    let busy = false;
    const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
    const formBox = el('div');
    const tabs = el('div', { className: 'auth-tabs', attrs: { role: 'tablist' } });
    const card = el('section', {
      className: 'auth-card',
      attrs: { 'aria-labelledby': 'auth-title' },
    });
    const screen = el('div', { className: 'auth-screen', children: [card] });

    const finish = (result: SignInResult): void => {
      if (result.ok) {
        screen.remove();
        resolve(result);
        return;
      }
      busy = false;
      card.classList.remove('is-busy');
      message.textContent = errorText(result.error);
      message.dataset.tone = 'error';
    };
    const run = (task: () => Promise<SignInResult>): void => {
      if (busy) return;
      busy = true;
      card.classList.add('is-busy');
      message.textContent = a.working;
      message.dataset.tone = 'ok';
      void task().then(finish);
    };

    const guest = el('button', {
      className: 'button button-primary auth-guest',
      text: a.guest,
      attrs: { type: 'button' },
    });
    guest.addEventListener('click', () => {
      run(() => actions.guest());
    });

    const renderForm = (): void => {
      tabs.replaceChildren(
        ...(['login', 'register'] as const).map((id) => {
          const tab = el('button', {
            className: `auth-tab${id === mode ? ' is-active' : ''}`,
            text: id === 'login' ? a.loginTab : a.registerTab,
            attrs: { type: 'button', role: 'tab', 'aria-selected': String(id === mode) },
          });
          tab.addEventListener('click', () => {
            mode = id;
            message.textContent = '';
            renderForm();
          });
          return tab;
        }),
      );
      const fields = credentialFields(mode);
      const submit = el('button', {
        className: 'button button-primary',
        text: mode === 'login' ? a.login : a.register,
        attrs: { type: 'submit' },
      });
      const form = el('form', {
        className: 'auth-form',
        children: [fields.element, submit],
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const { username, password } = fields.read();
        const invalid = mode === 'register' ? validateCredentials(username, password) : null;
        if (invalid) {
          message.textContent = errorText(invalid);
          message.dataset.tone = 'error';
          return;
        }
        run(() =>
          mode === 'login'
            ? actions.login(username, password)
            : actions.register(username, password),
        );
      });
      formBox.replaceChildren(form);
    };
    renderForm();

    // Khôi phục tài khoản ẩn danh cũ bằng mã (trước khi có đăng nhập bằng mật khẩu).
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
      if (code.length >= 16) run(() => actions.recover(code));
    });
    const recover = el('details', {
      className: 'auth-recover',
      children: [
        el('summary', { text: a.recover }),
        el('div', { className: 'creator-name-row', children: [recoverInput, recoverButton] }),
      ],
    });

    card.append(
      el('h1', { className: 'auth-title', text: GAME_NAME, attrs: { id: 'auth-title' } }),
      el('p', { className: 'creator-subtitle', text: a.tagline }),
      guest,
      el('p', { className: 'fortune-note', text: a.guestNote }),
      el('hr', { className: 'auth-divider' }),
      tabs,
      formBox,
      message,
      recover,
      el('p', { className: 'fortune-note', text: a.noPersonalData }),
    );
    root.append(screen);
    guest.focus();
  });
}
