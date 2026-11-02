import './style.css';
import { GAME_NAME } from '@dilam/shared';
import { createSpinningCube, type SpinningCubeScene } from './engine/spinningCube';
import { buildWsUrl } from './net/wsUrl';
import { STRINGS } from './strings';
import { mountHud } from './ui/hud';

function requireElement<T extends Element>(selector: string, type: abstract new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing ${selector} in index.html`);
  return element;
}

document.title = GAME_NAME;

const hud = mountHud(requireElement('#hud', HTMLElement), {
  title: GAME_NAME,
  wsUrl: buildWsUrl(window.location),
});

let scene: SpinningCubeScene | undefined;
try {
  scene = createSpinningCube(requireElement('#scene', HTMLCanvasElement));
} catch (error) {
  console.error(error);
  hud.showError(STRINGS.errors.webglUnavailable);
}

// Khi Vite thay nóng module này, dọn cảnh cũ để không rò rỉ tài nguyên GPU.
import.meta.hot?.dispose(() => {
  scene?.dispose();
});
