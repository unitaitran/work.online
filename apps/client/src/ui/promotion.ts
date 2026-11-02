// Lên chức danh (tự động theo cấp): màn chúc mừng (pháo giấy + nhạc) → chọn phòng ban / nhánh nếu cần.
import {
  BRANCHES,
  BRANCH_NAMES,
  DEPARTMENTS,
  DEPARTMENT_NAMES,
  type Branch,
  type Department,
} from '@dilam/shared';
import type { SoundName } from '../audio/audioEngine';
import { STRINGS } from '../strings';
import { el } from './dom';
import type { Modal } from './modal';

const s = STRINGS.progress;

export interface PromotionDeps {
  root: HTMLElement;
  /** Mở hộp thoại (khoá điều khiển cảnh trong lúc mở). */
  openPanel(title: string, onClose?: () => void): Modal;
  play(sound: SoundName): void;
  /** Khoá/mở điều khiển cảnh 3D (màn chúc mừng không đi qua openPanel). */
  lockInput(locked: boolean): void;
  progress: {
    chooseDepartment(department: Department): void;
    chooseBranch(branch: Branch): void;
    needsDepartment(): boolean;
    needsBranch(): boolean;
  };
  onDone?(): void;
}

/** Chúc mừng lên chức rồi hỏi phòng ban / nhánh nếu vừa mở khoá. */
export function celebratePromotion(deps: PromotionDeps, titleText: string): void {
  showCelebration(deps, titleText, () => {
    askChoices(deps);
  });
}

/** Màn chúc mừng: pháo giấy bằng CSS (không ảnh), nhạc chiến thắng sinh bằng Web Audio. */
export function showCelebration(
  deps: Pick<PromotionDeps, 'root' | 'play' | 'lockInput'>,
  title: string,
  onClose: () => void,
): void {
  deps.play('fanfare');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['#ff8a65', '#ffd479', '#8fc7ff', '#9fe0a8', '#d6b4ff', '#f28a8a'];
  const confetti = reduced
    ? []
    : Array.from({ length: 60 }, (_, i) => {
        const piece = el('span', { className: 'confetti' });
        piece.style.setProperty('--x', `${String((i * 37) % 100)}vw`);
        piece.style.setProperty('--delay', `${String((i % 12) * 0.08)}s`);
        piece.style.setProperty('--spin', `${String(((i * 53) % 720) - 360)}deg`);
        piece.style.background = colors[i % colors.length] ?? '#ff8a65';
        return piece;
      });
  const button = el('button', {
    className: 'button button-primary',
    text: s.promoted.continue,
    attrs: { type: 'button' },
  });
  const overlay = el('div', {
    className: 'celebration',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': s.promoted.title },
    children: [
      ...confetti,
      el('section', {
        className: 'celebration-card',
        children: [
          el('p', { className: 'celebration-badge', text: '★', attrs: { 'aria-hidden': 'true' } }),
          el('h2', { text: s.promoted.title }),
          el('p', { className: 'celebration-title', text: s.promoted.body(title) }),
          button,
        ],
      }),
    ],
  });
  // Khoá điều khiển cảnh trong lúc chúc mừng (không đi lại hay tương tác phía sau).
  deps.lockInput(true);
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
    deps.lockInput(false);
    onClose();
  };
  button.addEventListener('click', close);
  window.addEventListener('keydown', onKey, true);
  deps.root.append(overlay);
  button.focus();
}

/** Sau khi lên chức: chọn phòng ban (chức danh 3) hoặc nhánh (chức danh 5) nếu cần. */
export function askChoices(deps: PromotionDeps): void {
  if (deps.progress.needsDepartment()) {
    // Đóng mà chưa chọn thì thôi (lần vào văn phòng sau sẽ hỏi lại), chọn xong mới hỏi tiếp.
    const modal = deps.openPanel(s.department.title, () => {
      if (!deps.progress.needsDepartment()) askChoices(deps);
    });
    modal.body.append(
      el('p', { className: 'activity-intro', text: s.department.intro }),
      el('div', {
        className: 'choice-cards',
        children: DEPARTMENTS.map((department) => {
          const button = el('button', {
            className: 'choice-card',
            attrs: { type: 'button', 'data-department': department },
            children: [
              el('strong', { text: DEPARTMENT_NAMES[department] }),
              el('span', { text: s.department.descriptions[department] }),
            ],
          });
          button.addEventListener('click', () => {
            deps.progress.chooseDepartment(department);
            deps.play('ting');
            modal.close();
          });
          return button;
        }),
      }),
    );
    return;
  }
  if (deps.progress.needsBranch()) {
    const modal = deps.openPanel(s.branch.title, () => {
      if (!deps.progress.needsBranch()) askChoices(deps);
    });
    modal.body.append(
      el('p', { className: 'activity-intro', text: s.branch.intro }),
      el('div', {
        className: 'choice-cards',
        children: BRANCHES.map((branch) => {
          const button = el('button', {
            className: 'choice-card',
            attrs: { type: 'button', 'data-branch': branch },
            children: [
              el('strong', { text: BRANCH_NAMES[branch] }),
              el('span', { text: s.branch.descriptions[branch] }),
            ],
          });
          button.addEventListener('click', () => {
            deps.progress.chooseBranch(branch);
            deps.play('ting');
            modal.close();
          });
          return button;
        }),
      }),
    );
    return;
  }
  deps.onDone?.();
}
