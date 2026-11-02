import { MICRO_TASKS } from '../../data/micro-tasks';
import { STRINGS } from '../../strings';
import { el } from '../../ui/dom';
import { chosenTaskId, complete, deal, flip, type TaskFlipState } from './taskFlip';

export interface TaskFlipPanelOptions {
  /** Kết thúc một lượt: đã lật và (có thể) đã đánh dấu xong. */
  onResult(result: {
    taskId: number;
    completed: boolean;
    flippedAt: number;
    endedAt: number;
  }): void;
  onCompleted(): void;
}

/** Ba lá bài úp; lật một lá ra việc nhỏ, có nút "Đã xong!". */
export function mountTaskFlipPanel(
  body: HTMLElement,
  options: TaskFlipPanelOptions,
): { dispose(): void } {
  const s = STRINGS.taskFlip;
  let state: TaskFlipState = deal(Math.random);
  let reported = false;

  const cardsRow = el('div', { className: 'task-cards' });
  const result = el('div', { className: 'task-result', attrs: { role: 'status' } });
  const doneButton = el('button', {
    className: 'button button-primary',
    text: s.done,
    attrs: { type: 'button' },
  });
  const redeal = el('button', {
    className: 'button button-soft',
    text: s.redeal,
    attrs: { type: 'button' },
  });

  const report = (): void => {
    if (reported || state.phase === 'dealt') return;
    reported = true;
    const taskId = chosenTaskId(state) ?? 0;
    options.onResult({
      taskId,
      completed: state.phase === 'done',
      flippedAt: state.flippedAt,
      endedAt: state.phase === 'done' ? state.doneAt : Date.now(),
    });
  };

  const render = (): void => {
    const buttons = state.cards.map((taskId, i) => {
      const flipped = state.phase !== 'dealt' && state.chosen === i;
      const button = el('button', {
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
      button.disabled = state.phase !== 'dealt';
      button.addEventListener('click', () => {
        state = flip(state, i, Date.now());
        render();
      });
      return button;
    });
    cardsRow.replaceChildren(...buttons);

    const taskId = chosenTaskId(state);
    if (taskId === null) {
      result.replaceChildren(el('p', { className: 'activity-intro', text: s.intro }));
    } else {
      result.replaceChildren(
        el('p', { className: 'task-label', text: s.yourTask }),
        el('p', { className: 'task-text', text: MICRO_TASKS[taskId] ?? '' }),
      );
    }
    doneButton.hidden = state.phase !== 'flipped';
    redeal.hidden = state.phase !== 'done';
  };

  doneButton.addEventListener('click', () => {
    state = complete(state, Date.now());
    report();
    options.onCompleted();
    render();
  });
  redeal.addEventListener('click', () => {
    state = deal(Math.random);
    reported = false;
    render();
  });

  body.append(
    cardsRow,
    result,
    el('div', { className: 'activity-actions', children: [doneButton, redeal] }),
  );
  render();
  return {
    // Đóng khi đã lật mà chưa xong: vẫn ghi sự kiện (completed: false).
    dispose: report,
  };
}
