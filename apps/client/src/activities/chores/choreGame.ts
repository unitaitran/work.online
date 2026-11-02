// Công quả: bốn mini-game 5-10 giây, dùng được bằng chuột, ngón tay và bàn phím.
// Logic thuần (choreLogic) tách riêng để test; ở đây chỉ là giao diện.
import { STRINGS } from '../../strings';
import { el } from '../../ui/dom';
import {
  CHORE_SECONDS,
  newTidyCups,
  UNJAM_TAPS,
  waterResult,
  WIPE_TARGET,
  type ChoreKind,
} from './choreLogic';

export interface ChoreGameOptions {
  kind: ChoreKind;
  onDone(success: boolean): void;
}

export function mountChoreGame(body: HTMLElement, o: ChoreGameOptions): { dispose(): void } {
  const s = STRINGS.chores;
  const texts = s[o.kind];
  const timerText = el('p', { className: 'chore-timer' });
  const stage = el('div', { className: `chore-stage chore-${o.kind}` });
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  let left = CHORE_SECONDS[o.kind];
  let finished = false;
  const cleanups: (() => void)[] = [];

  const finish = (success: boolean, text?: string): void => {
    if (finished) return;
    finished = true;
    window.clearInterval(timer);
    message.textContent = text ?? (success ? s.done : s.fail);
    message.dataset.tone = success ? 'ok' : 'error';
    stage.classList.add(success ? 'is-done' : 'is-failed');
    o.onDone(success);
  };

  const timer = window.setInterval(() => {
    left -= 1;
    timerText.textContent = s.seconds(left);
    if (left <= 0) finish(false);
  }, 1000);
  timerText.textContent = s.seconds(left);

  switch (o.kind) {
    case 'water': {
      // Giữ nút: nước dâng lên; thả tay khi mực nước trong vạch xanh.
      const fill = el('div', { className: 'water-fill' });
      const zone = el('div', { className: 'water-zone' });
      const gauge = el('div', { className: 'water-gauge', children: [zone, fill] });
      const hold = el('button', {
        className: 'button button-primary',
        text: texts.action,
        attrs: { type: 'button' },
      });
      let level = 0;
      let raf = 0;
      let last = 0;
      const tick = (now: number): void => {
        level = Math.min(1.05, level + ((now - last) / 1000) * 0.45);
        last = now;
        fill.style.height = `${String(Math.round(Math.min(1, level) * 100))}%`;
        if (level >= 1.05) {
          release();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      const press = (event: Event): void => {
        event.preventDefault();
        if (finished || raf) return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      };
      const release = (): void => {
        if (!raf) return;
        cancelAnimationFrame(raf);
        raf = 0;
        const result = waterResult(level);
        if (result === 'ok') finish(true);
        else if (result === 'over') {
          finish(false, s.tooMuch);
        } else {
          // Chưa đủ: được giữ tiếp.
        }
      };
      hold.addEventListener('pointerdown', press);
      hold.addEventListener('pointerup', release);
      hold.addEventListener('pointerleave', release);
      hold.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') press(e);
      });
      hold.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'Enter') release();
      });
      cleanups.push(() => {
        cancelAnimationFrame(raf);
      });
      stage.append(gauge, hold);
      break;
    }
    case 'wipe': {
      // Chà qua lại: mỗi đoạn di chuyển đủ dài lau đi một phần vết bẩn.
      const dirt = el('div', { className: 'wipe-dirt' });
      const pad = el('div', {
        className: 'wipe-pad',
        attrs: { tabindex: '0', role: 'button', 'aria-label': texts.title },
        children: [dirt],
      });
      let rubbed = 0;
      let lastX: number | null = null;
      const rub = (amount: number): void => {
        rubbed += amount;
        dirt.style.opacity = String(Math.max(0, 1 - rubbed / WIPE_TARGET));
        if (rubbed >= WIPE_TARGET) finish(true);
      };
      pad.addEventListener('pointermove', (e) => {
        if (finished) return;
        if (lastX !== null) rub(Math.abs(e.clientX - lastX));
        lastX = e.clientX;
      });
      pad.addEventListener('pointerleave', () => {
        lastX = null;
      });
      pad.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') rub(WIPE_TARGET / 20);
      });
      stage.append(pad);
      break;
    }
    case 'tidy': {
      // Bấm từng cốc bẩn để dọn.
      const cups = newTidyCups(Math.random);
      let leftCups = cups.length;
      for (const cup of cups) {
        const b = el('button', {
          className: 'tidy-cup',
          text: '☕',
          attrs: { type: 'button', 'aria-label': texts.title },
        });
        b.style.left = `${String(cup.x)}%`;
        b.style.top = `${String(cup.y)}%`;
        b.addEventListener('click', () => {
          b.remove();
          leftCups -= 1;
          if (leftCups === 0) finish(true);
        });
        stage.append(b);
      }
      break;
    }
    case 'unjam': {
      // Bấm nhanh để kéo tờ giấy kẹt ra.
      const paper = el('div', { className: 'unjam-paper' });
      const pull = el('button', {
        className: 'button button-primary',
        text: texts.action,
        attrs: { type: 'button' },
      });
      let taps = 0;
      pull.addEventListener('click', () => {
        if (finished) return;
        taps += 1;
        paper.style.transform = `translateY(${String((taps / UNJAM_TAPS) * 60)}px)`;
        if (taps >= UNJAM_TAPS) finish(true);
      });
      stage.append(el('div', { className: 'unjam-printer', children: [paper] }), pull);
      break;
    }
  }

  body.append(
    el('p', { className: 'activity-intro', text: texts.hint }),
    timerText,
    stage,
    message,
  );
  return {
    dispose() {
      window.clearInterval(timer);
      for (const fn of cleanups) fn();
    },
  };
}
