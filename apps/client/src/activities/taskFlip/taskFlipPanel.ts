// Bảng task: trên là việc đang nhận (đếm giờ làm, xác nhận xong / bỏ), dưới là bài mới để lật
// và nhận. Server giữ danh sách việc đã nhận và tính XP khi xác nhận.
import { TASKS_HELD_MAX, taskWaitMs, type HeldTask } from '@dilam/shared';
import { MICRO_TASKS } from '../../data/micro-tasks';
import type { ActionReply } from '../../net/roomClient';
import { STRINGS } from '../../strings';
import { el } from '../../ui/dom';
import { deal, flip, flipAll, formatWait, type Deal } from './taskFlip';

export interface TaskFlipPanelOptions {
  held(): readonly HeldTask[];
  onChange(listener: () => void): () => void;
  accept(taskId: number): Promise<ActionReply>;
  done(taskId: number): Promise<ActionReply>;
  drop(taskId: number): Promise<ActionReply>;
  /** Vừa xác nhận xong một việc (âm thanh, thông báo). */
  onCompleted: () => void;
  /** Vừa nhận việc. */
  onAccepted: () => void;
}

export function mountTaskFlipPanel(
  body: HTMLElement,
  options: TaskFlipPanelOptions,
): { dispose(): void } {
  const s = STRINGS.taskFlip;
  const heldIds = (): number[] => options.held().map((t) => t.taskId);
  let state: Deal = deal(Math.random, heldIds());
  let busy = false;

  const heldTitle = el('h3', { className: 'task-section-title' });
  const heldList = el('ul', { className: 'task-held' });
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const cardsRow = el('div', { className: 'task-cards' });
  const flipAllButton = el('button', {
    className: 'button button-soft',
    text: s.flipAll,
    attrs: { type: 'button' },
  });
  const redeal = el('button', {
    className: 'button button-soft',
    text: s.redeal,
    attrs: { type: 'button' },
  });

  const say = (text: string, tone: 'ok' | 'error' = 'error'): void => {
    message.textContent = text;
    message.dataset.tone = tone;
  };
  const run = (call: Promise<ActionReply>, ok: () => void): void => {
    if (busy) return;
    busy = true;
    void call.then((reply) => {
      busy = false;
      if (reply.ok) {
        say('');
        ok();
      } else {
        say(s.errors[reply.reason] ?? STRINGS.net.actionFailed);
      }
      render();
    });
  };

  const renderHeld = (): void => {
    const held = options.held();
    const now = Date.now();
    heldTitle.textContent = s.heldTitle(held.length, TASKS_HELD_MAX);
    if (held.length === 0) {
      heldList.replaceChildren(el('li', { className: 'activity-intro', text: s.heldEmpty }));
      return;
    }
    heldList.replaceChildren(
      ...held.map((task) => {
        const wait = taskWaitMs(task, now);
        const confirm = el('button', {
          className: 'button button-primary task-confirm',
          text: wait > 0 ? s.wait(formatWait(wait)) : s.confirm,
          attrs: { type: 'button' },
        });
        confirm.disabled = wait > 0 || busy;
        confirm.addEventListener('click', () => {
          run(options.done(task.taskId), options.onCompleted);
        });
        const drop = el('button', {
          className: 'task-drop',
          text: '✕',
          attrs: { type: 'button', title: s.drop, 'aria-label': s.drop },
        });
        drop.addEventListener('click', () => {
          run(options.drop(task.taskId), () => undefined);
        });
        return el('li', {
          className: 'task-held-row',
          children: [
            el('span', { className: 'task-held-text', text: MICRO_TASKS[task.taskId] ?? '' }),
            confirm,
            drop,
          ],
        });
      }),
    );
  };

  const renderCards = (): void => {
    const held = heldIds();
    const full = held.length >= TASKS_HELD_MAX;
    cardsRow.replaceChildren(
      ...state.cards.map((taskId, i) => {
        const flipped = state.flipped[i] === true;
        const card = el('button', {
          className: `task-card${flipped ? ' is-flipped' : ''}`,
          attrs: {
            type: 'button',
            'aria-label': flipped ? (MICRO_TASKS[taskId] ?? '') : s.cardLabel(i + 1),
          },
          children: [
            el('span', { className: 'task-card-face task-card-back', text: '?' }),
            el('span', {
              className: 'task-card-face task-card-front',
              text: MICRO_TASKS[taskId] ?? '',
            }),
          ],
        });
        card.disabled = flipped;
        card.addEventListener('click', () => {
          state = flip(state, i);
          render();
        });
        const taken = held.includes(taskId);
        const accept = el('button', {
          className: `button ${taken ? 'button-soft' : 'button-primary'} task-accept`,
          text: taken ? s.accepted : s.accept,
          attrs: { type: 'button' },
        });
        accept.hidden = !flipped;
        accept.disabled = taken || full || busy;
        accept.addEventListener('click', () => {
          run(options.accept(taskId), options.onAccepted);
        });
        return el('div', { className: 'task-slot', children: [card, accept] });
      }),
    );
    flipAllButton.hidden = state.flipped.every(Boolean);
  };

  function render(): void {
    renderHeld();
    renderCards();
    if (heldIds().length >= TASKS_HELD_MAX && state.flipped.some(Boolean)) {
      if (!message.textContent) say(s.full, 'ok');
    }
  }

  flipAllButton.addEventListener('click', () => {
    state = flipAll(state);
    render();
  });
  redeal.addEventListener('click', () => {
    state = deal(Math.random, heldIds());
    say('');
    render();
  });

  body.append(
    el('p', { className: 'activity-intro', text: s.intro }),
    heldTitle,
    heldList,
    el('h3', { className: 'task-section-title', text: s.newTitle }),
    cardsRow,
    message,
    el('div', { className: 'activity-actions', children: [flipAllButton, redeal] }),
  );
  render();
  // Đếm ngược thời gian làm của các việc đang nhận.
  const timer = window.setInterval(renderHeld, 1000);
  const off = options.onChange(render);
  return {
    dispose: () => {
      window.clearInterval(timer);
      off();
    },
  };
}
