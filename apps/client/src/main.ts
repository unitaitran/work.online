import './style.css';
import { GAME_NAME } from '@dilam/shared';
import {
  activeMission,
  BALANCE,
  goalAmount,
  levelProgress,
  titleName,
  type ProgressState,
} from '@dilam/shared';
import { ActivityBus } from './activities/events';
import { OfficeActivities } from './activities/officeActivities';
import { loadOrCreatePlayerId } from './activities/playerId';
import { AudioEngine, type SoundName } from './audio/audioEngine';
import { DEFAULT_APPEARANCE, type Profile } from './avatar/appearance';
import { randomVietnameseName } from './avatar/names';
import { Engine } from './engine/engine';
import { initialAutoLevel } from './engine/quality';
import { clock } from './clock';
import { ProgressService } from './progress/progressService';
import { LocalProgressStore } from './progress/progressStore';
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
import { mountDevPanel } from './ui/devPanel';
import { mountOfficeHud, type OfficeHud } from './ui/officeHud';
import { mountProfilePanel, type ProfileTab } from './ui/profilePanel';
import { askChoices, startReview, type ReviewFlowDeps } from './ui/reviewFlow';
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

const params = new URLSearchParams(window.location.search);
/** ?time=morning|afternoon|night: ép buổi trong ngày (để thử, chụp ảnh). */
const forcedPeriod = params.get('time');
const currentPeriod = (): DayPeriod =>
  isDayPeriod(forcedPeriod) ? forcedPeriod : periodOfDay(new Date());

const store = openLocalStorage();
const storageNotice = store ? null : STRINGS.storage.blocked;
/** Bus sự kiện hoạt động (Phase 2B): ghi lại để trang events.html xem và phase sau gửi server. */
const bus = new ActivityBus(store);
const playerId = loadOrCreatePlayerId(store);
// Tiến độ (Phase 3: tính ở client bằng luật trong @dilam/shared; Phase 4 chuyển lên server).
const progress = await ProgressService.create(new LocalProgressStore(store), playerId, clock);
bus.on((event) => {
  progress.handle(event);
});

// Âm thanh dùng chung cho cả trang; chỉ bật sau lần chạm/bấm phím đầu tiên (chính sách autoplay).
const audio = new AudioEngine(loadAudioSettings(store), OFFICE_FLOOR.name);
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

function start(): void {
  let officeHud: OfficeHud | null = null;
  let engine: Engine;
  try {
    engine = new Engine(canvas, {
      mode: loadQualityMode(store),
      autoStartLevel: initialAutoLevel(coarsePointer),
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
        const saved = saveProfile(store, finished);
        showOffice(finished, saved ? null : (storageNotice ?? STRINGS.storage.saveFailed));
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
      floorName: OFFICE_FLOOR.name,
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
      onOpenProfile: (tab) => {
        openProfile(tab ?? 'card');
      },
    });
    officeHud = hud;
    const officeActivities = new OfficeActivities({
      root: hudRoot,
      store,
      bus,
      playerId,
      playerName: profile.name,
      floorName: OFFICE_FLOOR.name,
      progress: {
        checkIn: () => progress.state.checkIn,
        lastResult: () => progress.lastResult,
      },
      scene,
      hud,
      play: (sound) => {
        audio.play(sound);
      },
    });
    activities = officeActivities;
    const officeHudView = hud;

    // ---------- Tiến độ: thanh XP, lên cấp, việc sếp giao, kỳ đánh giá ----------
    const refreshProgress = (state: ProgressState = progress.state): void => {
      const p = levelProgress(state.xp);
      officeHudView.setProgress({
        level: p.level,
        title: titleName(state.title, state.branch),
        ratio: p.ratio,
        into: p.into,
        needed: p.needed,
        isMax: p.isMax,
        reviewDue: progress.reviewStatus().due,
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
    const offProgress = progress.onChange((state, change) => {
      refreshProgress(state);
      if (change.kind === 'event') {
        const { result } = change;
        if (result.granted > 0)
          officeHudView.showXpGain(result.granted, result.granted < result.base);
        if (result.completedMission) {
          audio.play('ting');
          officeHudView.showToast(STRINGS.progress.mission.done(BALANCE.mission));
        }
        if (result.levelAfter > result.levelBefore) {
          audio.play('levelup');
          officeHudView.showToast(STRINGS.progress.levelUp(result.levelAfter));
        }
      } else if (change.kind === 'missionAssigned') {
        audio.play('ting');
        officeHudView.showToast(change.mission.text);
      }
    });
    refreshProgress();
    const missionTimer = window.setInterval(() => {
      progress.tickMissions();
      refreshProgress();
    }, 3000);

    const reviewDeps: ReviewFlowDeps = {
      root: hudRoot,
      openPanel: (title, onClose) => officeActivities.openPanel(title, onClose),
      play: (sound) => {
        audio.play(sound);
      },
      progress,
    };
    const openProfile = (tab: ProfileTab): void => {
      let panel: { dispose(): void } | null = null;
      const modal = officeActivities.openPanel(STRINGS.progress.profileTitle, () =>
        panel?.dispose(),
      );
      panel = mountProfilePanel(modal.body, {
        name: profile.name,
        playerId,
        progress,
        initialTab: tab,
        onStartReview: () => {
          modal.close();
          startReview(reviewDeps);
        },
      });
    };
    // Lỡ đóng màn chọn phòng ban / nhánh: lần vào văn phòng sau hỏi lại.
    if (progress.needsDepartment() || progress.needsBranch()) askChoices(reviewDeps);

    const devPanel = import.meta.env.DEV
      ? mountDevPanel(hudRoot, {
          emit: (event) => {
            bus.emit(event);
          },
          forceMission: () => {
            progress.forceMissionNow();
          },
          onTimeChange: () => {
            refreshProgress();
          },
        })
      : null;

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
      window.clearInterval(missionTimer);
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

  const saved = loadProfile(store);
  if (saved) showOffice(saved, null);
  else
    showCreator(
      { name: randomVietnameseName(), appearance: { ...DEFAULT_APPEARANCE } },
      storageNotice,
    );

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
        review: () => progress.reviewStatus(),
        today: () => clock.today(),
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
