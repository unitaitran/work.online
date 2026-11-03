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
  /** Nút "Đi về": ra khỏi văn phòng về màn "Ở nhà". */
  onGoHome(): void;
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
  setName(name: string): void;
  /** Menu ☰ (chỉ có trên màn cảm ứng): nơi gắn thêm nút (ví dụ "Góc nhìn"). */
  readonly menu: HTMLElement | null;
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

  const homeButton = el('button', {
    className: 'button button-soft home-button',
    text: STRINGS.lobby.goHome,
    attrs: { type: 'button', title: STRINGS.lobby.goHomeHint },
  });
  homeButton.addEventListener('click', () => {
    options.onGoHome();
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
  const badgeName = el('span', { className: 'office-badge-name', text: options.name });
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
          badgeName,
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

  const soundGroup = el('div', { className: 'sound-group', children: [soundButton, volume] });
  const qualityLabel = el('label', {
    className: 'quality-label',
    children: [el('span', { text: s.qualityLabel }), select],
  });

  // Màn cảm ứng: thanh trên chỉ giữ thẻ tên, xu và "Đi về"; các nút khác gom vào menu ☰ góc trái
  // dưới (bấm mới bật lên), cần gạt nằm bên phải.
  let menu: HTMLElement | null = null;
  let menuButton: HTMLButtonElement | null = null;
  if (options.touch) {
    const sheet = el('div', {
      className: 'menu-sheet',
      attrs: { id: 'office-menu', role: 'menu' },
      children: [moreButton, shopButton, socialButton, editButton, soundGroup, qualityLabel],
    });
    sheet.hidden = true;
    const toggle = el('button', {
      className: 'menu-button',
      text: '☰',
      attrs: {
        type: 'button',
        'aria-label': s.menu,
        'aria-expanded': 'false',
        'aria-controls': 'office-menu',
      },
    });
    let isOpen = false;
    const setOpen = (open: boolean): void => {
      isOpen = open;
      sheet.hidden = !open;
      toggle.textContent = open ? '✕' : '☰';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? s.menuClose : s.menu);
    };
    toggle.addEventListener('click', () => {
      setOpen(!isOpen);
    });
    // Chọn một mục (trừ âm thanh, đồ họa) thì menu tự đóng.
    sheet.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('.menu-sheet > .button')) setOpen(false);
    });
    menu = sheet;
    menuButton = toggle;
  }

  const bar = el('div', {
    className: 'office-bar',
    children: [
      el('div', { className: 'office-badge-group', children: [badge, coinChip] }),
      el('div', {
        className: 'office-actions',
        children: options.touch ? [homeButton] : [soundGroup, qualityLabel, editButton, homeButton],
      }),
    ],
  });

  const layer = el('div', {
    className: options.touch ? 'office-hud is-touch' : 'office-hud',
    children: [
      bar,
      missionCard,
      toast,
      stats,
      eventsLink,
      netStatus,
      ...(options.touch ? [] : [socialButton, shopButton, moreButton]),
      wipeButton,
      coffeeChip,
      focusButton,
      interact,
      ...(menu && menuButton ? [menu, menuButton] : []),
      // Dòng hướng dẫn phím chỉ có trên máy tính.
      ...(options.touch ? [] : [el('p', { className: 'office-hint', text: s.hintDesktop })]),
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
    setName(name) {
      badgeName.textContent = name;
    },
    menu,
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
