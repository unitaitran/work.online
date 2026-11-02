import type { EngineStats } from '../engine/engine';
import { QUALITY_MODES, isQualityMode, type QualityMode } from '../engine/quality';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface OfficeHudOptions {
  name: string;
  mode: QualityMode;
  touch: boolean;
  notice: string | null;
  showStats: boolean;
  onEdit(): void;
  onQualityChange(mode: QualityMode): void;
}

export interface OfficeHud {
  showToast(text: string): void;
  setStats(stats: EngineStats): void;
  dispose(): void;
}

const TOAST_MS = 5000;

export function mountOfficeHud(root: HTMLElement, options: OfficeHudOptions): OfficeHud {
  const s = STRINGS.office;

  const editButton = el('button', {
    className: 'button button-soft',
    text: s.editCard,
    attrs: { type: 'button' },
  });
  editButton.addEventListener('click', () => {
    options.onEdit();
  });

  const select = el('select', { className: 'quality-select', attrs: { id: 'quality-select' } });
  for (const mode of QUALITY_MODES) {
    const option = el('option', { text: s.qualityModes[mode], attrs: { value: mode } });
    option.selected = mode === options.mode;
    select.append(option);
  }
  select.addEventListener('change', () => {
    if (isQualityMode(select.value)) options.onQualityChange(select.value);
    select.blur();
  });

  const badge = el('div', {
    className: 'office-badge',
    children: [
      el('span', { className: 'office-badge-dot', attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'office-badge-name', text: options.name }),
    ],
  });

  const stats = el('p', { className: 'office-stats', attrs: { 'aria-hidden': 'true' } });
  stats.hidden = !options.showStats;

  const toast = el('p', { className: 'notice toast', attrs: { role: 'status' } });
  toast.hidden = true;

  const bar = el('div', {
    className: 'office-bar',
    children: [
      badge,
      el('div', {
        className: 'office-actions',
        children: [
          el('label', {
            className: 'quality-label',
            children: [el('span', { text: s.qualityLabel }), select],
          }),
          editButton,
        ],
      }),
    ],
  });

  const hint = el('p', {
    className: 'office-hint',
    text: options.touch ? s.hintTouch : s.hintDesktop,
  });
  const layer = el('div', { className: 'office-hud', children: [bar, toast, stats, hint] });
  root.append(layer);

  let toastTimer: number | undefined;
  const showToast = (text: string): void => {
    toast.textContent = text;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, TOAST_MS);
  };
  if (options.notice) showToast(options.notice);

  return {
    showToast,
    setStats(value) {
      if (stats.hidden) return;
      stats.textContent = s.stats(
        value.fps,
        value.cpuFrameMs,
        value.drawCalls,
        s.qualityModes[value.level],
      );
    },
    dispose() {
      window.clearTimeout(toastTimer);
      layer.remove();
    },
  };
}
