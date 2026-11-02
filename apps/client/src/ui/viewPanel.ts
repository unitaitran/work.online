// Nút "Góc nhìn" và bảng nhỏ nổi cạnh nút: Xuyên thấu, Tự động xoay, Nhìn từ trên, Đặt lại góc
// nhìn, bật/tắt tên khu, kèm thông tin văn phòng. Không phải hộp thoại: vẫn kéo xoay cảnh được.
import { STRINGS } from '../strings';
import { el } from './dom';

export interface ViewControls {
  setXray(on: boolean): void;
  setAutoRotate(on: boolean): void;
  setTopView(on: boolean): void;
  setZoneLabels(on: boolean): void;
  resetView(): void;
}

export function mountViewPanel(root: HTMLElement, controls: ViewControls): { dispose(): void } {
  const s = STRINGS.view;
  const state = { xray: false, rotate: false, top: false, labels: true };
  const toggle = el('button', {
    className: 'button button-soft view-button',
    text: `🎥 ${s.open}`,
    attrs: { type: 'button', 'aria-expanded': 'false' },
  });
  const panel = el('section', {
    className: 'view-panel',
    attrs: { 'aria-label': s.title },
  });
  panel.hidden = true;

  const switchButton = (
    label: string,
    key: 'xray' | 'rotate' | 'top' | 'labels',
    apply: (on: boolean) => void,
  ) => {
    const b = el('button', { className: 'view-switch', text: label, attrs: { type: 'button' } });
    const render = (): void => {
      b.setAttribute('aria-pressed', String(state[key]));
    };
    b.addEventListener('click', () => {
      state[key] = !state[key];
      apply(state[key]);
      render();
    });
    render();
    return { element: b, render };
  };
  const xray = switchButton(s.xray, 'xray', (on) => {
    controls.setXray(on);
  });
  const rotate = switchButton(s.autoRotate, 'rotate', (on) => {
    controls.setAutoRotate(on);
  });
  const top = switchButton(s.topDown, 'top', (on) => {
    controls.setTopView(on);
  });
  const labels = switchButton(s.labels, 'labels', (on) => {
    controls.setZoneLabels(on);
  });
  const reset = el('button', {
    className: 'view-switch view-reset',
    text: s.reset,
    attrs: { type: 'button' },
  });
  reset.addEventListener('click', () => {
    state.rotate = false;
    state.top = false;
    controls.resetView();
    rotate.render();
    top.render();
  });

  panel.append(
    el('h2', { className: 'view-title', text: s.title }),
    el('div', {
      className: 'view-grid',
      children: [xray.element, rotate.element, top.element, labels.element, reset],
    }),
    el('p', { className: 'view-info', text: s.info }),
    el('p', { className: 'view-hint', text: s.hint }),
  );
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
  root.append(toggle, panel);
  return {
    dispose() {
      toggle.remove();
      panel.remove();
    },
  };
}
