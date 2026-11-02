import './style.css';
import { GAME_NAME } from '@dilam/shared';
import { AudioEngine, type SoundName } from './audio/audioEngine';
import { DEFAULT_APPEARANCE, type Profile } from './avatar/appearance';
import { randomVietnameseName } from './avatar/names';
import { Engine } from './engine/engine';
import { initialAutoLevel } from './engine/quality';
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
import { mountOfficeHud, type OfficeHud } from './ui/officeHud';
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
  coffee: 'coffee',
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
    const onEvent = (event: OfficeEvent): void => {
      if (event.type === 'seatTaken') {
        hud?.showToast(STRINGS.interact.seatTaken(event.name));
        return;
      }
      const { kind } = event.item;
      const sound = INTERACT_SOUNDS[kind];
      if (sound) audio.play(sound);
      hud?.showToast(
        kind === 'window'
          ? STRINGS.interact.window[currentPeriod()]
          : STRINGS.interact.results[kind],
      );
      lastInteraction = event.item.id;
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
    });
    officeHud = hud;

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
