import './style.css';
import { GAME_NAME } from '@dilam/shared';
import {
  activeMission,
  BALANCE,
  goalAmount,
  levelProgress,
  QUICK_CHATS,
  titleFor,
  titleName,
  dayMood,
  PROTOCOL_VERSION,
  COMPANY_COLORS,
  type BuildingResponse,
  type CompanyPublic,
  type InventoryResponse,
  type LeaderboardResponse,
  type WallPost,
  type ProgressState,
  type RoomEventView,
  type ServerMessage,
} from '@dilam/shared';
import { ActivityBus } from './activities/events';
import { OfficeActivities } from './activities/officeActivities';
import { AudioEngine, type SoundName } from './audio/audioEngine';
import { DEFAULT_APPEARANCE, type Profile } from './avatar/appearance';
import { randomVietnameseName } from './avatar/names';
import { Engine } from './engine/engine';
import { detectLowPower, initialAutoLevel } from './engine/quality';
import { analyticsEnabled, setAnalyticsEnabled, track } from './net/analytics';
import { ApiClient } from './net/api';
import { RoomClient, type ActionReply } from './net/roomClient';
import { recoverAccount, saveToken, signIn, type SignInResult } from './net/session';
import { actionForEvent } from './progress/eventActions';
import { markLocalSaveImported, pendingLocalSave } from './progress/localSave';
import { ServerProgress } from './progress/serverProgress';
import { compareVersion, registerServiceWorker } from './version';
import { CreatorScene } from './scenes/creatorScene';
import { createNpcRoster } from './npc/roster';
import { OfficeScene, type OfficeEvent } from './scenes/officeScene';
import {
  loadAudioSettings,
  loadCoachDone,
  loadProfile,
  loadQualityMode,
  openLocalStorage,
  saveAudioSettings,
  saveCoachDone,
  saveProfile,
  saveQualityMode,
} from './storage';
import { STRINGS } from './strings';
import { mountCreatorPanel } from './ui/creatorPanel';
import { el } from './ui/dom';
import { showCoachMarks } from './ui/coachMarks';
import { openModal } from './ui/modal';
import type { CallResult } from './ui/companyPanel';

// Các màn ít dùng được tải lười (chia nhỏ JS, tải ban đầu nhẹ hơn).
const lazy = {
  shop: () => import('./ui/shopPanel'),
  company: () => import('./ui/companyPanel'),
  wall: () => import('./ui/wallPanel'),
  leaderboard: () => import('./ui/leaderboardPanel'),
  building: () => import('./ui/buildingPanel'),
  brag: () => import('./ui/bragCard'),
  dev: () => import('./ui/devPanel'),
};
import { mountOfficeHud, type OfficeHud } from './ui/officeHud';
import { mountProfilePanel, type ProfileTab } from './ui/profilePanel';
import { askChoices, celebratePromotion, type PromotionDeps } from './ui/promotion';
import { mountRoomEventBanner } from './ui/roomEventBanner';
import { loadHidden, mountSocialPanel, saveHidden } from './ui/socialPanel';
import { OFFICE_FLOOR, type InteractableKind } from './world/office/layout';
import { isDayPeriod, periodOfDay, type DayPeriod } from './world/office/period';

function requireElement<T extends Element>(selector: string, type: abstract new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing ${selector} in index.html`);
  return element;
}

document.title = GAME_NAME;
const canvas = requireElement('#scene', HTMLCanvasElement);
const hudRoot = requireElement('#hud', HTMLElement);
const debug = new URLSearchParams(window.location.search).has('debug');
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
/** Chế độ máy yếu tự phát hiện: bắt đầu ở chất lượng thấp (ít bóng, ít nhân vật chi tiết, ít hiệu ứng). */
const lowPower = detectLowPower({
  hardwareConcurrency: navigator.hardwareConcurrency,
  ...('deviceMemory' in navigator ? { deviceMemory: Number(navigator.deviceMemory) } : {}),
  ...('connection' in navigator
    ? { saveData: Boolean((navigator.connection as { saveData?: boolean } | undefined)?.saveData) }
    : {}),
});

const params = new URLSearchParams(window.location.search);
/** ?time=morning|afternoon|night: ép buổi trong ngày (để thử, chụp ảnh). */
const forcedPeriod = params.get('time');
const currentPeriod = (): DayPeriod =>
  isDayPeriod(forcedPeriod) ? forcedPeriod : periodOfDay(new Date());

const store = openLocalStorage();
const storageNotice = store ? null : STRINGS.storage.blocked;
/** Bus sự kiện hoạt động: ghi lại để trang events.html xem, và đổi thành hành động gửi server. */
const bus = new ActivityBus(store);
const api = new ApiClient();

/** Đăng nhập (hoặc tạo tài khoản ẩn danh); mất mạng thì hiện nút thử lại. */
async function bootSession(): Promise<Extract<SignInResult, { ok: true }>> {
  const status = el('p', { className: 'notice notice-center', text: STRINGS.net.bootTitle });
  hudRoot.append(status);
  for (;;) {
    const result = await signIn(api, store);
    if (result.ok) {
      status.remove();
      return result;
    }
    status.textContent =
      result.error === 'rate_limited' ? STRINGS.net.bootRateLimited : STRINGS.net.bootFailed;
    const retry = el('button', {
      className: 'button button-primary',
      text: STRINGS.net.retry,
      attrs: { type: 'button' },
    });
    status.append(el('br'), retry);
    await new Promise<void>((resolve) => {
      retry.addEventListener('click', () => {
        resolve();
      });
    });
    status.textContent = STRINGS.net.bootTitle;
  }
}

registerServiceWorker();

/** Báo có bản mới (bắt buộc tải lại nếu giao thức đã đổi). */
let updateShown = false;
function showUpdate(required: boolean): void {
  if (updateShown) return;
  updateShown = true;
  const reload = el('button', {
    className: 'button button-primary',
    text: STRINGS.update.reload,
    attrs: { type: 'button' },
  });
  reload.addEventListener('click', () => {
    window.location.reload();
  });
  hudRoot.append(
    el('div', {
      className: required ? 'update-banner is-required' : 'update-banner',
      attrs: { role: 'alert' },
      children: [
        el('span', { text: required ? STRINGS.update.required : STRINGS.update.available }),
        reload,
      ],
    }),
  );
}
async function checkVersion(): Promise<void> {
  const meta = await api.request<{ protocolVersion: number; buildId?: string | null }>(
    'GET',
    '/api/meta',
  );
  if (!meta.ok) return;
  const status = compareVersion(meta.value);
  if (status !== 'ok') showUpdate(status === 'required');
}
void checkVersion();
window.setInterval(() => void checkVersion(), 10 * 60_000);

const session = await bootSession();
track(store, 'session_start');
const playerId = session.me.playerCode;
// Tiến độ do server tính (Phase 4C); client chỉ hiển thị.
const progress = new ServerProgress(session.me.progress);
let startNotice: string | null = null;

// Tiến độ cũ chơi trên máy này (Phase 3): nhập một lần vào tài khoản.
const localSave = session.me.imported ? null : pendingLocalSave(store, Date.now());
if (localSave) {
  const imported = await api.importSave(localSave);
  if (imported.ok) {
    progress.replace(imported.value.progress);
    startNotice = STRINGS.net.imported;
  }
  // Đã nhập hoặc bị từ chối hẳn (đã có tiến độ, quá cao...): không gửi lại nữa.
  if (imported.ok || imported.status === 409 || imported.status === 422) {
    markLocalSaveImported(store);
  }
}

/** Báo lý do server từ chối một hành động (bỏ qua các lý do không cần người chơi biết). */
let toastReject: (text: string) => void = () => undefined;
const reportReply = (reply: ActionReply): void => {
  if (reply.ok) return;
  if (reply.reason === 'too_far' || reply.reason === 'too_fast') {
    toastReject(STRINGS.net.rejected[reply.reason] ?? '');
  } else if (reply.reason === 'offline' || reply.reason === 'timeout') {
    toastReject(STRINGS.net.actionFailed);
  }
};
bus.on((event) => {
  const action = actionForEvent(event);
  if (action) void progress.act(action).then(reportReply);
});

// Âm thanh dùng chung cho cả trang; chỉ bật sau lần chạm/bấm phím đầu tiên (chính sách autoplay).
const audio = new AudioEngine(loadAudioSettings(store), STRINGS.office.floorName);
const unlockAudio = (): void => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockAudio, true);
  window.removeEventListener('keydown', unlockAudio, true);
};
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);

/** Tiếng động khi dùng từng loại vật. */
const INTERACT_SOUNDS: Partial<Record<InteractableKind, SoundName>> = {
  printer: 'printer',
  fridge: 'ting',
  plant: 'ting',
  window: 'ting',
};

/** Hộp thoại mã khôi phục (chỉ hiện một lần khi vừa tạo tài khoản). */
function showRecoveryCode(code: string): void {
  const a = STRINGS.account;
  const modal = openModal(hudRoot, { title: a.recoveryTitle });
  const codeEl = el('code', { className: 'recovery-code', text: code });
  const copy = el('button', {
    className: 'button button-soft',
    text: a.copy,
    attrs: { type: 'button' },
  });
  copy.addEventListener('click', () => {
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(code))
      .then(() => {
        copy.textContent = a.copied;
      })
      .catch(() => undefined);
  });
  const done = el('button', {
    className: 'button button-primary',
    text: a.saved,
    attrs: { type: 'button' },
  });
  done.addEventListener('click', () => {
    modal.close();
  });
  modal.body.append(
    el('p', { className: 'activity-intro', text: a.recoveryIntro }),
    codeEl,
    el('div', { className: 'activity-actions', children: [copy, done] }),
  );
}

function start(): void {
  let officeHud: OfficeHud | null = null;
  let engine: Engine;
  try {
    engine = new Engine(canvas, {
      mode: loadQualityMode(store),
      autoStartLevel: initialAutoLevel(coarsePointer, lowPower),
      onAutoDowngrade: (level) => {
        officeHud?.showToast(STRINGS.office.qualityLowered(STRINGS.office.qualityModes[level]));
      },
      onStats: (stats) => {
        officeHud?.setStats(stats);
      },
    });
  } catch (error) {
    console.error(error);
    hudRoot.append(
      el('p', { className: 'notice notice-center', text: STRINGS.errors.webglUnavailable }),
    );
    return;
  }

  let teardown: (() => void) | null = null;
  let office: OfficeScene | null = null;
  let lastInteraction: string | null = null;

  const showCreator = (profile: Profile, notice: string | null): void => {
    teardown?.();
    const scene = new CreatorScene(canvas, profile.appearance);
    engine.setController(scene);
    const panel = mountCreatorPanel(hudRoot, {
      profile,
      notice,
      onAppearanceChange: (appearance) => {
        scene.setAppearance(appearance);
      },
      onPoseChange: (pose) => {
        scene.setPose(pose);
      },
      onEnter: (finished) => {
        // Nhân vật lưu ở server (tên qua bộ lọc); bản trên máy chỉ để mở nhanh lần sau.
        void api.saveCharacter(finished).then((saved) => {
          if (!saved.ok) {
            showCreator(
              finished,
              saved.error === 'rejected' ? STRINGS.net.nameRejected : STRINGS.net.saveFailed,
            );
            return;
          }
          const profile = saved.value.character ?? finished;
          const local = saveProfile(store, profile);
          showOffice(profile, local ? null : (storageNotice ?? STRINGS.storage.saveFailed));
        });
      },
    });
    const updateInset = (): void => {
      scene.setViewInset(panel.getInset());
    };
    const observer = new ResizeObserver(updateInset);
    observer.observe(panel.element);
    window.addEventListener('resize', updateInset);
    updateInset();
    teardown = () => {
      observer.disconnect();
      window.removeEventListener('resize', updateInset);
      panel.dispose();
      engine.setController(null);
    };
  };

  const showOffice = (profile: Profile, notice: string | null): void => {
    teardown?.();
    let hud: OfficeHud | null = null;
    let activities: OfficeActivities | null = null;
    const results: Partial<Record<InteractableKind, string>> = STRINGS.interact.results;
    const onEvent = (event: OfficeEvent): void => {
      if (event.type === 'seatTaken') {
        hud?.showToast(STRINGS.interact.seatTaken(event.name));
        return;
      }
      if (event.type === 'gift') {
        activities?.giftCoffee(event.npcId, event.name);
        return;
      }
      lastInteraction = event.item.id;
      if (activities?.handleInteract(event.item)) return;
      const { kind } = event.item;
      const sound = INTERACT_SOUNDS[kind];
      if (sound) audio.play(sound);
      const text = kind === 'window' ? STRINGS.interact.window[currentPeriod()] : results[kind];
      if (text) hud?.showToast(text);
    };
    const scene = new OfficeScene({
      canvas,
      hudLayer: hudRoot,
      appearance: profile.appearance,
      layout: OFFICE_FLOOR,
      period: currentPeriod(),
      npcs: createNpcRoster(),
      onHint: (hint) => {
        hud?.setHint(hint);
      },
      onEvent,
      onSound: (name) => {
        audio.play(name);
      },
      canGiftCoffee: () => activities?.canGiftCoffee() ?? false,
      onSeatChange: (item) => {
        activities?.onSeatChange(item);
      },
    });
    office = scene;
    engine.setController(scene);
    hud = mountOfficeHud(hudRoot, {
      name: profile.name,
      floorName: STRINGS.office.floorName,
      mode: engine.qualityMode,
      audio: audio.getSettings(),
      touch: coarsePointer,
      notice,
      showStats: debug,
      onEdit: () => {
        showCreator(profile, storageNotice);
      },
      onQualityChange: (mode) => {
        engine.setQualityMode(mode);
        saveQualityMode(store, mode);
      },
      onAudioChange: (settings) => {
        audio.unlock();
        audio.setEnabled(settings.enabled);
        audio.setVolume(settings.volume);
        saveAudioSettings(store, settings);
      },
      onInteract: () => {
        scene.triggerHint();
      },
      onFocusStart: () => {
        activities?.startFocus();
      },
      onDrinkCoffee: () => {
        activities?.drinkCoffee();
      },
      onOpenProfile: () => {
        openProfile();
      },
      onOpenSocial: () => {
        openSocial();
      },
      onOpenShop: () => {
        openShop();
      },
      onOpenMore: () => {
        openHub();
      },
      onWipe: () => {
        activities?.wipeDesk();
      },
    });
    officeHud = hud;
    const officeActivities = new OfficeActivities({
      root: hudRoot,
      store,
      bus,
      playerId,
      playerName: profile.name,
      floorName: STRINGS.office.floorName,
      openWall: () => {
        openWall();
      },
      coffeeOut: () => {
        if (eventState?.kind !== 'coffee_out') return false;
        respondEvent();
        return true;
      },
      progress: {
        checkIn: () => progress.state.checkIn,
        act: async (action) => {
          const reply = await progress.act(action);
          reportReply(reply);
          return reply;
        },
      },
      scene,
      hud,
      play: (sound) => {
        audio.play(sound);
      },
    });
    activities = officeActivities;
    const officeHudView = hud;

    // ---------- Tiến độ: thanh XP, lên cấp, lên chức danh, việc sếp giao ----------
    const refreshProgress = (state: ProgressState = progress.state): void => {
      const p = levelProgress(state.xp);
      officeHudView.setProgress({
        level: p.level,
        title: titleName(titleFor(state.xp), state.branch),
        ratio: p.ratio,
        into: p.into,
        needed: p.needed,
        isMax: p.isMax,
        coins: state.coins,
      });
      const mission = activeMission(state);
      officeHudView.setMission(
        mission
          ? {
              goalText: mission.goalText,
              progress: mission.progress,
              total: goalAmount(mission.goal),
            }
          : null,
      );
    };
    const promotionDeps: PromotionDeps = {
      root: hudRoot,
      openPanel: (title, onClose) => officeActivities.openPanel(title, onClose),
      lockInput: (locked) => {
        scene.setInputLocked(locked);
      },
      play: (sound) => {
        audio.play(sound);
      },
      progress,
    };
    const offProgress = progress.onChange((state, change) => {
      refreshProgress(state);
      if (change.kind === 'outcome') {
        const result = change.outcome;
        if (result.granted > 0)
          officeHudView.showXpGain(result.granted, result.granted < result.base);
        if (result.completedMission) {
          audio.play('ting');
          officeHudView.showToast(STRINGS.progress.mission.done(BALANCE.mission));
        }
        if (result.titleAfter > result.titleBefore) {
          // Lên chức danh: màn chúc mừng (có nhạc riêng) rồi hỏi phòng ban / nhánh nếu vừa mở khoá.
          celebratePromotion(promotionDeps, titleName(result.titleAfter, state.branch));
        } else if (result.levelAfter > result.levelBefore) {
          audio.play('levelup');
          officeHudView.showToast(STRINGS.progress.levelUp(result.levelAfter));
        }
      } else if (change.kind === 'missionAssigned') {
        audio.play('ting');
        officeHudView.showToast(change.mission.text);
      }
    });
    refreshProgress();
    track(store, 'office_enter');
    toastReject = (text) => {
      if (text) officeHudView.showToast(text);
    };

    // ---------- Phòng (Phase 4B): người chơi khác, biểu cảm, câu nhanh ----------
    const hidden = loadHidden(store);
    scene.remotes.setHidden(hidden);
    const updateOnline = (): void => {
      officeHudView.setNetStatus(STRINGS.net.online(scene.remotes.count), 'ok');
    };
    let idleModal: { close(): void } | null = null;
    const onRoomMessage = (message: ServerMessage): void => {
      switch (message.type) {
        case 'welcome':
          if (message.protocol !== PROTOCOL_VERSION) showUpdate(true);
          serverOffset = message.serverTime - Date.now();
          roomKind = message.room.replace(/-\d+$/, '');
          updateSign();
          scene.remotes.clear();
          for (const player of message.players) scene.remotes.add(player);
          updateOnline();
          break;
        case 'player_join':
          scene.remotes.add(message.player);
          updateOnline();
          break;
        case 'player_update':
          scene.remotes.updateProfile(message.player);
          break;
        case 'player_leave':
          scene.remotes.remove(message.sid);
          updateOnline();
          break;
        case 'states':
          scene.remotes.applyStates(message.s);
          break;
        case 'emote':
          scene.remotes.say(message.sid, STRINGS.social.emoteNames[message.emote] ?? '');
          break;
        case 'quick_chat':
          scene.remotes.say(message.sid, QUICK_CHATS[message.index] ?? '');
          break;
        case 'correct':
          scene.correctPosition(message.x, message.z);
          break;
        case 'idle_check': {
          idleModal?.close();
          const modal = officeActivities.openPanel(STRINGS.net.idleTitle);
          const stay = el('button', {
            className: 'button button-primary',
            text: STRINGS.net.idleStay,
            attrs: { type: 'button' },
          });
          stay.addEventListener('click', () => {
            room.send({ type: 'active' });
            modal.close();
          });
          modal.body.append(
            el('p', { className: 'activity-intro', text: STRINGS.net.idleBody }),
            el('div', { className: 'activity-actions', children: [stay] }),
          );
          idleModal = modal;
          break;
        }
        case 'progress':
        case 'mission_assigned':
          progress.receive(message);
          break;
        case 'room_event':
          eventState = message.event;
          banner.show(message.event, serverOffset);
          audio.play('alert');
          break;
        case 'room_event_progress':
          banner.progress(message.id, message.progress);
          break;
        case 'room_event_end': {
          const texts = STRINGS.events[message.kind];
          if (eventState?.id === message.id) eventState = null;
          banner.end(message.id, message.success ? texts.win : texts.lose);
          if (message.rewarded) {
            audio.play('ting');
            officeHudView.showToast(STRINGS.events.rewarded(''));
          }
          break;
        }
        case 'switch_failed':
          officeHudView.showToast(
            message.reason === 'full' ? STRINGS.building.full : STRINGS.building.failed,
          );
          break;
        case 'room_plants':
          scene.plants.set(message.plants);
          break;
        case 'plant_added':
          scene.plants.add(message.plant);
          break;
        case 'plant_removed':
          scene.plants.remove(message.ids);
          break;
        default:
          break;
      }
    };
    const room = new RoomClient({
      token: api.getToken() ?? '',
      onMessage: onRoomMessage,
      onStatus: (status, info) => {
        if (status === 'online') updateOnline();
        else if (status === 'connecting')
          officeHudView.setNetStatus(STRINGS.net.connecting, 'warn');
        else if (status === 'offline') {
          scene.remotes.clear();
          officeHudView.setNetStatus(
            STRINGS.net.offline(Math.ceil((info?.retryInMs ?? 0) / 1000)),
            'warn',
          );
        } else {
          scene.remotes.clear();
          idleModal?.close();
          const modal = officeActivities.openPanel(STRINGS.net.rejoin);
          const again = el('button', {
            className: 'button button-primary',
            text: STRINGS.net.rejoin,
            attrs: { type: 'button' },
          });
          again.addEventListener('click', () => {
            modal.close();
            room.reconnect();
          });
          modal.body.append(
            el('p', {
              className: 'activity-intro',
              text: STRINGS.net.kicked[info?.kick ?? 'idle'] ?? '',
            }),
            el('div', { className: 'activity-actions', children: [again] }),
          );
          officeHudView.setNetStatus(STRINGS.net.kicked[info?.kick ?? 'idle'] ?? '', 'warn');
        }
      },
    });
    progress.setSender(room);
    room.start();
    // Gửi vị trí ~10 lần/giây (RoomClient tự bỏ khi không đổi).
    const stateTimer = window.setInterval(() => {
      const st = scene.getPlayerState();
      room.sendState(st.x, st.z, st.facing, st.pose);
    }, 100);

    // Trang bị (cửa hàng): đọc lúc vào văn phòng, đổi thì dựng lại nhân vật và báo cả phòng.
    let equipped: string[] = [];
    const applyInventory = (inventory: InventoryResponse): void => {
      if (JSON.stringify(inventory.equipped) !== JSON.stringify(equipped)) {
        equipped = inventory.equipped;
        scene.setGear(profile.appearance, equipped);
        room.send({ type: 'profile_changed' });
      }
    };
    void api.request<InventoryResponse>('GET', '/api/shop/inventory').then((result) => {
      if (result.ok) applyInventory(result.value);
    });
    const shopCall = async (
      path: string,
      body: unknown,
    ): Promise<{ ok: true; inventory: InventoryResponse } | { ok: false; error: string }> => {
      const result = await api.request<InventoryResponse>('POST', path, body);
      return result.ok
        ? { ok: true, inventory: result.value }
        : { ok: false, error: result.reason ?? result.error };
    };
    const openShop = (): void => {
      track(store, 'shop_open');
      let panel: { dispose(): void } | null = null;
      const modal = officeActivities.openPanel(STRINGS.shop.title, () => panel?.dispose());
      modal.body.closest('.modal')?.classList.add('modal-wide');
      void lazy.shop().then(({ mountShopPanel }) => {
        panel = mountShopPanel(modal.body, {
          appearance: profile.appearance,
          xp: progress.state.xp,
          load: async () => {
            const result = await api.request<InventoryResponse>('GET', '/api/shop/inventory');
            return result.ok ? result.value : null;
          },
          buy: (itemId) => shopCall('/api/shop/buy', { itemId }),
          equip: (itemId, equip) => shopCall('/api/shop/equip', { itemId, equip }),
          onInventory: applyInventory,
        });
      });
    };

    // ---------- Công ty (Phase 6): phòng riêng có biển hiệu ----------
    let roomKind = 'office';
    const updateSign = (): void => {
      if (!roomKind.startsWith('company:')) {
        scene.setCompanySign(null);
        return;
      }
      const id = roomKind.slice('company:'.length);
      void api
        .request<CompanyPublic>('GET', `/api/company/info/${encodeURIComponent(id)}`)
        .then((r) => {
          if (!r.ok || roomKind !== `company:${id}`) return;
          const c = r.value;
          scene.setCompanySign({
            name: c.name,
            color: COMPANY_COLORS[c.color] ?? 0xff8a65,
            glyph: STRINGS.company.iconGlyph[c.icon] ?? '★',
            subtitle: `${STRINGS.company.industries[c.industry] ?? ''} · ${STRINGS.company.stages[c.stage] ?? ''}`,
          });
        });
    };
    const openCompany = (): void => {
      track(store, 'company_open');
      const modal = officeActivities.openPanel(STRINGS.company.title);
      modal.body.closest('.modal')?.classList.add('modal-wide');
      void lazy.company().then(({ mountCompanyPanel }) => {
        mountCompanyPanel(modal.body, {
          get: async <T>(path: string) => {
            const r = await api.request<T>('GET', path);
            return r.ok ? r.value : null;
          },
          post: async <T>(path: string, body?: unknown): Promise<CallResult<T>> => {
            const r = await api.request<T>('POST', path, body ?? {});
            return r.ok ? { ok: true, value: r.value } : { ok: false, reason: r.reason ?? r.error };
          },
          enterRoom: (companyId) => {
            room.send({ type: 'switch_room', roomId: `company:${companyId}` });
            modal.close();
          },
          backToOffice: () => {
            room.send({ type: 'switch_room', roomId: 'office' });
            modal.close();
          },
          currentCompanyRoom: () => (roomKind.startsWith('company:') ? roomKind : null),
        });
      });
    };

    // ---------- Sự kiện phòng (Phase 5B) ----------
    let serverOffset = 0;
    let eventState: RoomEventView | null = null;
    const coffeeSpot = scene.getInteractables().find((item) => item.kind === 'coffee');
    const respondEvent = (): void => {
      const ev = eventState;
      if (!ev) return;
      if (ev.kind === 'coffee_out' && coffeeSpot) {
        const p = scene.getPlayerPosition();
        if (Math.hypot(p.x - coffeeSpot.approach.x, p.z - coffeeSpot.approach.z) > 2.4) {
          officeHudView.showToast(STRINGS.events.needCoffee);
          return;
        }
      }
      room.send({ type: 'event_respond', id: ev.id });
      if (ev.kind === 'wifi_down') audio.play('keyboard');
    };
    const banner = mountRoomEventBanner(hudRoot, () => {
      respondEvent();
    });

    // ---------- Xếp hạng, tường chung, bản đồ toà nhà, thẻ khoe (Phase 5B) ----------
    const openWall = (): void => {
      track(store, 'wall_open');
      const modal = officeActivities.openPanel(STRINGS.wall.title);
      void lazy.wall().then(({ mountWallPanel }) => {
        mountWallPanel(modal.body, {
          list: async () => {
            const r = await api.request<{ posts: WallPost[] }>('GET', '/api/wall');
            return r.ok ? r.value.posts : null;
          },
          post: async (text) => {
            const r = await api.request<{ posts: WallPost[] }>('POST', '/api/wall', { text });
            return r.ok
              ? { ok: true, posts: r.value.posts }
              : { ok: false, reason: r.reason ?? r.error };
          },
          report: async (id) => {
            const r = await api.request<{ posts: WallPost[] }>(
              'POST',
              `/api/wall/${String(id)}/report`,
            );
            return r.ok ? r.value.posts : null;
          },
        });
      });
    };
    const openLeaderboard = (): void => {
      track(store, 'leaderboard_open');
      const modal = officeActivities.openPanel(STRINGS.board.title);
      void lazy.leaderboard().then(({ mountLeaderboardPanel }) => {
        mountLeaderboardPanel(modal.body, {
          load: async (period, department) => {
            const r = await api.request<LeaderboardResponse>(
              'GET',
              `/api/leaderboard?period=${period}&department=${department}`,
            );
            return r.ok ? r.value : null;
          },
          setHidden: async (hidden) =>
            (await api.request('PUT', '/api/me/privacy', { hideFromLeaderboard: hidden })).ok,
        });
      });
    };
    const openBuilding = (): void => {
      const modal = officeActivities.openPanel(STRINGS.building.title);
      void lazy.building().then(({ mountBuildingPanel }) => {
        mountBuildingPanel(modal.body, {
          load: async () => {
            const r = await api.request<BuildingResponse>('GET', '/api/building');
            return r.ok ? r.value : null;
          },
          go: (roomId) => {
            room.send({ type: 'switch_room', roomId });
            modal.close();
          },
          label: (info) => (info.kind === 'office' ? STRINGS.building.office : info.name),
        });
      });
    };
    const openBrag = (): void => {
      track(store, 'brag_open');
      const modal = officeActivities.openPanel(STRINGS.brag.title);
      const img = el('img', { className: 'brag-preview', attrs: { alt: STRINGS.brag.title } });
      const share = el('button', {
        className: 'button button-primary',
        text: STRINGS.brag.share,
        attrs: { type: 'button' },
      });
      const download = el('button', {
        className: 'button button-soft',
        text: STRINGS.brag.download,
        attrs: { type: 'button' },
      });
      modal.body.append(
        img,
        el('div', { className: 'activity-actions', children: [download, share] }),
      );
      const state = progress.state;
      void lazy.brag().then(({ drawBragCard, shareOrDownload }) =>
        drawBragCard({
          appearance: profile.appearance,
          equipped,
          level: progress.level,
          title: titleName(progress.title, state.branch),
          streak: state.checkIn.streak,
          stats: state.daily.day === progress.today ? state.daily.stats : undefined,
          day: progress.today ?? '',
        }).then((canvas) => {
          img.src = canvas.toDataURL('image/png');
          const name = `di-lam-online-${progress.today ?? 'hom-nay'}.png`;
          share.addEventListener('click', () => {
            void shareOrDownload(canvas, name);
          });
          download.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = img.src;
            a.download = name;
            a.click();
          });
          Object.assign(window, { __lastBrag: canvas });
        }),
      );
    };
    const openHub = (): void => {
      const modal = officeActivities.openPanel(STRINGS.hub.title);
      const h = STRINGS.hub;
      const entries: [string, () => void][] = [
        [h.leaderboard, openLeaderboard],
        [h.wall, openWall],
        [h.building, openBuilding],
        [h.brag, openBrag],
        [h.company, openCompany],
      ];
      modal.body.append(
        el('div', {
          className: 'choice-cards',
          children: entries.map(([label, open]) => {
            const b = el('button', {
              className: 'choice-card',
              attrs: { type: 'button' },
              children: [el('strong', { text: label })],
            });
            b.addEventListener('click', () => {
              modal.close();
              open();
            });
            return b;
          }),
        }),
      );
    };

    // ---------- Lịch theo ngày: nhạc, ánh sáng, lời thoại ----------
    let moodDay: string | null = null;
    let moodTimer: number | undefined;
    const applyMood = (): void => {
      const today = progress.today;
      if (!today || today === moodDay) return;
      moodDay = today;
      const mood = dayMood(today);
      scene.setMood(mood);
      audio.setMood(mood);
      const greeting = STRINGS.moods.greeting[mood];
      if (greeting) officeHudView.showToast(greeting);
      const lines = STRINGS.moods.npcLines[mood] ?? [];
      window.clearInterval(moodTimer);
      if (lines.length > 0) {
        moodTimer = window.setInterval(() => {
          const npcs = scene.getNpcStatuses();
          const npc = createNpcRoster()[Math.floor(Math.random() * npcs.length)];
          const line = lines[Math.floor(Math.random() * lines.length)];
          if (npc && line) scene.npcSay(npc.id, line, 5);
        }, 75_000);
      }
    };
    const offMood = progress.onChange(() => {
      applyMood();
    });

    const openSocial = (): void => {
      const modal = officeActivities.openPanel(STRINGS.social.open);
      mountSocialPanel(modal.body, {
        players: () => scene.remotes.list(),
        onEmote: (emote) => {
          room.send({ type: 'emote', emote });
          officeHudView.showToast(STRINGS.social.emoteNames[emote] ?? '');
          modal.close();
        },
        onQuickChat: (index) => {
          room.send({ type: 'quick_chat', index });
          officeHudView.showToast(QUICK_CHATS[index] ?? '');
          modal.close();
        },
        onToggleHidden: (code, hide) => {
          if (hide) hidden.add(code);
          else hidden.delete(code);
          saveHidden(store, hidden);
          scene.remotes.setHidden(hidden);
        },
      });
    };

    const openProfile = (tab: ProfileTab = 'card'): void => {
      let panel: { dispose(): void } | null = null;
      const modal = officeActivities.openPanel(STRINGS.progress.profileTitle, () =>
        panel?.dispose(),
      );
      panel = mountProfilePanel(modal.body, {
        name: profile.name,
        playerId,
        progress,
        initialTab: tab,
        account: {
          recover: async (code) => {
            const result = await recoverAccount(api, store, code);
            if (result.ok) window.location.reload();
            return result.ok;
          },
          newRecoveryCode: async () => {
            const result = await api.request<{ recoveryCode: string }>('POST', '/api/me/recovery');
            return result.ok ? result.value.recoveryCode : null;
          },
          analyticsEnabled: () => analyticsEnabled(store, navigator.doNotTrack),
          setAnalytics: (enabled) => {
            setAnalyticsEnabled(store, enabled);
          },
          deleteAccount: async () => {
            const result = await api.deleteAccount();
            if (!result.ok) return false;
            saveToken(store, null);
            room.stop();
            return true;
          },
        },
      });
    };
    // Lỡ đóng màn chọn phòng ban / nhánh: lần vào văn phòng sau hỏi lại.
    if (progress.needsDepartment() || progress.needsBranch()) askChoices(promotionDeps);

    // Công cụ dev chỉ có khi chạy dev (bản build không tải module này).
    let devPanel: { dispose(): void } | null = null;
    if (import.meta.env.DEV) {
      void lazy.dev().then(({ mountDevPanel }) => {
        devPanel = mountDevPanel(hudRoot, {
          call: async (path, body) => (await api.request('POST', path, body)).ok,
          today: () => progress.today,
          toast: (text) => {
            officeHudView.showToast(text);
          },
        });
      });
    }

    // Tài khoản mới: hiện mã khôi phục MỘT lần.
    if (session.recoveryCode) {
      const code = session.recoveryCode;
      session.recoveryCode = null;
      showRecoveryCode(code);
    }

    // Cảnh ngoài cửa kính đổi theo giờ thật: kiểm tra mỗi phút.
    const periodTimer = window.setInterval(() => {
      scene.setPeriod(currentPeriod());
    }, 60_000);

    const coach = loadCoachDone(store)
      ? null
      : showCoachMarks(hudRoot, {
          touch: coarsePointer,
          onDone: () => {
            saveCoachDone(store);
          },
        });

    const officeHudRef = hud;
    teardown = () => {
      window.clearInterval(periodTimer);
      window.clearInterval(stateTimer);
      window.clearInterval(moodTimer);
      offMood();
      banner.dispose();
      room.stop();
      progress.setSender(null);
      scene.remotes.clear();
      toastReject = () => undefined;
      offProgress();
      devPanel?.dispose();
      officeActivities.dispose();
      activities = null;
      coach?.dispose();
      officeHud = null;
      office = null;
      officeHudRef.dispose();
      engine.setController(null);
    };
  };

  // Nhân vật trên server; tài khoản mới mà máy có nhân vật cũ (Phase 1-3) thì đưa lên server.
  const local = loadProfile(store);
  if (session.me.character) {
    saveProfile(store, session.me.character);
    showOffice(session.me.character, startNotice);
  } else if (local) {
    void api.saveCharacter(local).then((saved) => {
      if (saved.ok) showOffice(saved.value.character ?? local, startNotice);
      else showCreator(local, STRINGS.net.nameRejected);
    });
  } else {
    showCreator(
      { name: randomVietnameseName(), appearance: { ...DEFAULT_APPEARANCE } },
      storageNotice,
    );
  }

  // ?debug: hiện fps/draw call và mở cổng cho kịch bản kiểm thử tự động (đo PERF.md).
  if (debug) {
    Object.assign(window, {
      __dilam: {
        stats: () => engine.getStats(),
        setQuality: (mode: Parameters<Engine['setQualityMode']>[0]) => {
          engine.setQualityMode(mode);
        },
        playerPosition: () => office?.getPlayerPosition() ?? null,
        orbit: () => office?.getOrbit() ?? null,
        project: (x: number, z: number) => office?.projectFloorPoint(x, z) ?? null,
        projectPoint: (x: number, y: number, z: number) => office?.projectPoint(x, y, z) ?? null,
        memory: () => ({ ...engine.renderer.info.memory }),
        interactables: () =>
          office?.getInteractables().map((item) => ({
            id: item.id,
            kind: item.kind,
            approach: item.approach,
            pick: item.pick,
          })) ?? [],
        interact: (id: string) => office?.requestInteractionById(id) ?? false,
        lastInteraction: () => lastInteraction,
        seated: () => office?.getSeatedId() ?? null,
        npcs: () => office?.getNpcStatuses() ?? [],
        audio: () => audio.stats(),
        events: () => bus.history(),
        progress: () => progress.state,
        today: () => progress.today,
        remotes: () => office?.remotes.list() ?? [],
        playerId: () => playerId,
        setPeriod: (period: DayPeriod) => {
          office?.setPeriod(period);
        },
      },
    });
  }

  import.meta.hot?.dispose(() => {
    teardown?.();
    engine.dispose();
    audio.dispose();
  });
}

start();
