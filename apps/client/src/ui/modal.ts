import { STRINGS } from '../strings';
import { el } from './dom';

export interface Modal {
  readonly body: HTMLElement;
  close(): void;
}

let openCount = 0;

/** Có hộp thoại nào đang mở không (để chặn phím tắt trong cảnh 3D). */
export function isModalOpen(): boolean {
  return openCount > 0;
}

/** Hộp thoại giữa màn hình: nền mờ chặn chạm xuống cảnh 3D, Esc hoặc nút Đóng để đóng. */
export function openModal(
  root: HTMLElement,
  options: { title: string; className?: string; onClose?(): void },
): Modal {
  const titleId = `modal-title-${String(Date.now())}`;
  const closeButton = el('button', {
    className: 'modal-close',
    text: '×',
    attrs: { type: 'button', 'aria-label': STRINGS.common.close, title: STRINGS.common.close },
  });
  const body = el('div', { className: 'modal-body' });
  const dialog = el('section', {
    className: `modal ${options.className ?? ''}`.trim(),
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    children: [
      el('header', {
        className: 'modal-header',
        children: [
          el('h2', { className: 'modal-title', text: options.title, attrs: { id: titleId } }),
          closeButton,
        ],
      }),
      body,
    ],
  });
  const backdrop = el('div', { className: 'modal-backdrop', children: [dialog] });
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    openCount -= 1;
    window.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    previousFocus?.focus();
    options.onClose?.();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  closeButton.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) close();
  });
  window.addEventListener('keydown', onKey, true);
  openCount += 1;
  root.append(backdrop);
  closeButton.focus();
  return { body, close };
}
