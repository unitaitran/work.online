import './style.css';
import { GAME_NAME } from '@dilam/shared';
import { DEFAULT_APPEARANCE, type Profile } from './avatar/appearance';
import { randomVietnameseName } from './avatar/names';
import { Engine } from './engine/engine';
import { initialAutoLevel } from './engine/quality';
import { CreatorScene } from './scenes/creatorScene';
import { OfficeScene } from './scenes/officeScene';
import {
  loadProfile,
  loadQualityMode,
  openLocalStorage,
  saveProfile,
  saveQualityMode,
} from './storage';
import { STRINGS } from './strings';
import { mountCreatorPanel } from './ui/creatorPanel';
import { el } from './ui/dom';
import { mountOfficeHud, type OfficeHud } from './ui/officeHud';
import { TEST_ROOM } from './world/roomLayout';

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

const store = openLocalStorage();
const storageNotice = store ? null : STRINGS.storage.blocked;

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
    const scene = new OfficeScene({
      canvas,
      hudLayer: hudRoot,
      appearance: profile.appearance,
      layout: TEST_ROOM,
    });
    office = scene;
    engine.setController(scene);
    const hud = mountOfficeHud(hudRoot, {
      name: profile.name,
      mode: engine.qualityMode,
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
    });
    officeHud = hud;
    teardown = () => {
      officeHud = null;
      office = null;
      hud.dispose();
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
        memory: () => ({ ...engine.renderer.info.memory }),
      },
    });
  }

  import.meta.hot?.dispose(() => {
    teardown?.();
    engine.dispose();
  });
}

start();
