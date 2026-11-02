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
  onFocusStart(): void;
  onDrinkCoffee(): void;
  onOpenProfile(): void;
  onOpenSocial(): void;
  onOpenShop(): void;
  onOpenMore(): void;
  onWipe(): void;
}

/** Thông tin tiến độ hiển thị trên HUD. */
export interface ProgressView {
  level: number;
  title: string;
  ratio: number;
  into: number;
  needed: number;
  isMax: boolean;
  coins: number;
}

export interface MissionView {
  goalText: string;
  progress: number;
  total: number;
}

/** Gợi ý tương tác: null = ẩn nút. */
export interface InteractionHint {
  kind: 'use' | 'stand' | 'gift';
  label: string;
}

export interface OfficeHud {
  showToast(text: string): void;
  setStats(stats: EngineStats): void;
  setHint(hint: InteractionHint | null): void;
  /** Hiện nút "Gõ phím tập trung" (khi đang ngồi ở bàn làm việc). */
  setFocusAvailable(available: boolean): void;
  setWipeAvailable(available: boolean): void;
  /** Trạng thái ly cà phê: đang pha / đang cầm / không có. */
  setCoffee(phase: 'idle' | 'brewing' | 'holding'): void;
  setProgress(view: ProgressView): void;
  /** Chữ "+XP" bay lên cạnh thanh XP. */
  showXpGain(xp: number, capped: boolean): void;
  setMission(mission: MissionView | null): void;
  /** Mũi tên ▲ cạnh thanh XP: đang ngồi máy / họp nên XP đang lên từ từ. */
  setXpRising(rising: boolean): void;
  /** Trạng thái kết nối (số người online, đang kết nối lại...). */
  setNetStatus(text: string, tone: 'ok' | 'warn'): void;
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

  // Thẻ tên + cấp/chức danh + thanh XP; bấm vào để mở hồ sơ.
  const levelText = el('span', { className: 'office-badge-floor' });
  const xpFill = el('span', { className: 'xp-bar-fill' });
  const xpText = el('span', { className: 'xp-bar-text' });
  const xpBar = el('span', {
    className: 'xp-bar',
    attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    children: [xpFill, xpText],
  });
  const xpFloat = el('span', { className: 'xp-float', attrs: { 'aria-live': 'polite' } });
  const xpRising = el('span', {
    className: 'xp-rising',
    text: '▲',
    attrs: { title: STRINGS.progress.xpRising, 'aria-label': STRINGS.progress.xpRising },
  });
  xpRising.hidden = true;
  const badge = el('button', {
    className: 'office-badge',
    attrs: {
      type: 'button',
      title: STRINGS.progress.openProfile,
      'aria-label': STRINGS.progress.openProfile,
    },
    children: [
      el('span', { className: 'office-badge-dot', attrs: { 'aria-hidden': 'true' } }),
      el('span', {
        className: 'office-badge-text',
        children: [
          el('span', { className: 'office-badge-name', text: options.name }),
          levelText,
          el('span', { className: 'xp-row', children: [xpBar, xpRising] }),
        ],
      }),
      xpFloat,
    ],
  });
  badge.addEventListener('click', () => {
    options.onOpenProfile();
  });
  // Số xu hiện có (điểm trong game).
  const coinChip = el('span', { className: 'coin-chip', attrs: { 'aria-live': 'polite' } });

  // Thẻ việc sếp giao.
  const missionGoal = el('span', { className: 'mission-goal' });
  const missionCount = el('span', { className: 'mission-count' });
  const missionCard = el('div', {
    className: 'mission-card',
    attrs: { role: 'status' },
    children: [
      el('span', { className: 'mission-label', text: STRINGS.progress.mission.label }),
      missionGoal,
      missionCount,
    ],
  });
  missionCard.hidden = true;

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

  const focusButton = el('button', {
    className: 'button button-soft focus-button',
    text: STRINGS.focus.start,
    attrs: { type: 'button' },
  });
  focusButton.hidden = true;
  focusButton.addEventListener('click', () => {
    options.onFocusStart();
  });

  const drinkButton = el('button', {
    className: 'button button-soft coffee-drink',
    text: STRINGS.coffee.drink,
    attrs: { type: 'button' },
  });
  drinkButton.addEventListener('click', () => {
    options.onDrinkCoffee();
  });
  const coffeeText = el('span', { className: 'coffee-text' });
  const coffeeChip = el('div', {
    className: 'coffee-chip',
    attrs: { role: 'status' },
    children: [
      el('span', { className: 'coffee-cup', attrs: { 'aria-hidden': 'true' } }),
      coffeeText,
      drinkButton,
    ],
  });
  coffeeChip.hidden = true;

  const socialButton = el('button', {
    className: 'button button-soft social-button',
    text: STRINGS.social.open,
    attrs: { type: 'button' },
  });
  socialButton.addEventListener('click', () => {
    options.onOpenSocial();
  });
  const netStatus = el('p', { className: 'net-status', attrs: { role: 'status' } });
  const shopButton = el('button', {
    className: 'button button-soft shop-button',
    text: STRINGS.shop.open,
    attrs: { type: 'button' },
  });
  shopButton.addEventListener('click', () => {
    options.onOpenShop();
  });
  const moreButton = el('button', {
    className: 'button button-soft more-button',
    text: STRINGS.hub.open,
    attrs: { type: 'button' },
  });
  moreButton.addEventListener('click', () => {
    options.onOpenMore();
  });
  const wipeButton = el('button', {
    className: 'button button-soft wipe-button',
    text: STRINGS.chores.wipeButton,
    attrs: { type: 'button' },
  });
  wipeButton.hidden = true;
  wipeButton.addEventListener('click', () => {
    options.onWipe();
  });

  const eventsLink = el('a', {
    className: 'events-link',
    text: STRINGS.eventsPage.open,
    attrs: { href: './events.html', target: '_blank', rel: 'noopener' },
  });
  eventsLink.hidden = !options.showStats;

  const bar = el('div', {
    className: 'office-bar',
    children: [
      el('div', { className: 'office-badge-group', children: [badge, coinChip] }),
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
    children: [
      bar,
      missionCard,
      toast,
      stats,
      eventsLink,
      netStatus,
      socialButton,
      shopButton,
      moreButton,
      wipeButton,
      coffeeChip,
      focusButton,
      interact,
      hint,
    ],
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
          : (value.kind === 'gift'
              ? STRINGS.coffee.giftPrompt(value.label)
              : STRINGS.interact.prompt(value.label)) +
            (options.touch ? '' : STRINGS.interact.keyHint);
      if (text === lastHint) return;
      lastHint = text;
      interact.hidden = text === '';
      interact.textContent = text;
    },
    setProgress(view) {
      levelText.textContent = STRINGS.progress.levelLabel(view.level, view.title);
      xpFill.style.width = `${String(Math.round(view.ratio * 100))}%`;
      xpText.textContent = view.isMax
        ? STRINGS.progress.xpMax
        : STRINGS.progress.xpBar(view.into, view.needed);
      xpBar.setAttribute('aria-valuenow', String(Math.round(view.ratio * 100)));
      xpBar.setAttribute('aria-label', xpText.textContent);
      coinChip.textContent = STRINGS.progress.coins(view.coins);
    },
    showXpGain(xp, capped) {
      xpFloat.textContent = STRINGS.progress.xpGain(xp);
      xpFloat.classList.remove('is-showing');
      xpFloat.getBoundingClientRect(); // ép trình duyệt tính lại để chạy lại hiệu ứng
      xpFloat.classList.add('is-showing');
      if (capped) showToast(STRINGS.progress.xpCapped);
    },
    setMission(mission) {
      missionCard.hidden = mission === null;
      if (!mission) return;
      missionGoal.textContent = mission.goalText;
      missionCount.textContent = STRINGS.progress.mission.progress(mission.progress, mission.total);
    },
    setWipeAvailable(available) {
      wipeButton.hidden = !available;
    },
    setXpRising(rising) {
      xpRising.hidden = !rising;
    },
    setNetStatus(text, tone) {
      netStatus.textContent = text;
      netStatus.dataset.tone = tone;
    },
    setFocusAvailable(available) {
      focusButton.hidden = !available;
    },
    setCoffee(phase) {
      coffeeChip.hidden = phase === 'idle';
      coffeeChip.dataset.phase = phase;
      coffeeText.textContent =
        phase === 'brewing' ? STRINGS.coffee.brewing : STRINGS.coffee.holding;
      drinkButton.hidden = phase !== 'holding';
    },
    dispose() {
      window.clearTimeout(toastTimer);
      layer.remove();
    },
  };
}
