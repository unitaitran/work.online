import type { AudioSettings } from '../audio/audioEngine';
import type { EngineStats } from '../engine/engine';
import { QUALITY_MODES, isQualityMode, type QualityMode } from '../engine/quality';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface OfficeHudOptions {
  name: string;
  floorName: string;
  mode: QualityMode;
  audio: AudioSettings;
  touch: boolean;
  notice: string | null;
  showStats: boolean;
  onEdit(): void;
  onQualityChange(mode: QualityMode): void;
  onAudioChange(settings: AudioSettings): void;
  onInteract(): void;
}

/** Gợi ý tương tác: null = ẩn nút. */
export interface InteractionHint {
  kind: 'use' | 'stand';
  label: string;
}

export interface OfficeHud {
  showToast(text: string): void;
  setStats(stats: EngineStats): void;
  setHint(hint: InteractionHint | null): void;
  dispose(): void;
}

const TOAST_MS = 5000;

export function mountOfficeHud(root: HTMLElement, options: OfficeHudOptions): OfficeHud {
  const s = STRINGS.office;
  let audio = { ...options.audio };

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

  // Âm thanh: nút bật/tắt + thanh âm lượng.
  const soundButton = el('button', {
    className: 'button button-soft sound-toggle',
    attrs: { type: 'button' },
  });
  const volume = el('input', {
    className: 'volume-slider',
    attrs: { type: 'range', min: '0', max: '100', step: '5', 'aria-label': STRINGS.audio.volume },
  });
  volume.value = String(Math.round(audio.volume * 100));
  const renderSound = (): void => {
    soundButton.textContent = audio.enabled ? STRINGS.audio.on : STRINGS.audio.off;
    soundButton.setAttribute('aria-pressed', String(audio.enabled));
    volume.disabled = !audio.enabled;
  };
  soundButton.addEventListener('click', () => {
    audio = { ...audio, enabled: !audio.enabled };
    renderSound();
    options.onAudioChange(audio);
  });
  volume.addEventListener('input', () => {
    audio = { ...audio, volume: Number(volume.value) / 100 };
    options.onAudioChange(audio);
  });
  renderSound();

  const badge = el('div', {
    className: 'office-badge',
    children: [
      el('span', { className: 'office-badge-dot', attrs: { 'aria-hidden': 'true' } }),
      el('span', {
        className: 'office-badge-text',
        children: [
          el('span', { className: 'office-badge-name', text: options.name }),
          el('span', { className: 'office-badge-floor', text: options.floorName }),
        ],
      }),
    ],
  });

  const stats = el('p', { className: 'office-stats', attrs: { 'aria-hidden': 'true' } });
  stats.hidden = !options.showStats;

  const toast = el('p', { className: 'notice toast', attrs: { role: 'status' } });
  toast.hidden = true;

  const interact = el('button', {
    className: 'button button-primary interact-button',
    attrs: { type: 'button' },
  });
  interact.hidden = true;
  interact.addEventListener('click', () => {
    options.onInteract();
  });

  const bar = el('div', {
    className: 'office-bar',
    children: [
      badge,
      el('div', {
        className: 'office-actions',
        children: [
          el('div', { className: 'sound-group', children: [soundButton, volume] }),
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
  const layer = el('div', {
    className: 'office-hud',
    children: [bar, toast, stats, interact, hint],
  });
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

  let lastHint = '';
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
    setHint(value) {
      const text = !value
        ? ''
        : value.kind === 'stand'
          ? STRINGS.interact.standUp
          : STRINGS.interact.prompt(value.label) + (options.touch ? '' : STRINGS.interact.keyHint);
      if (text === lastHint) return;
      lastHint = text;
      interact.hidden = text === '';
      interact.textContent = text;
    },
    dispose() {
      window.clearTimeout(toastTimer);
      layer.remove();
    },
  };
}
