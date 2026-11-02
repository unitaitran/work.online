import { ZERO_INPUT, type InputVector } from '../world/movement';

const KEY_DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function isMovementKey(code: string): boolean {
  return code in KEY_DIRECTIONS;
}

/** Đổi tập phím đang giữ thành hướng đi (đi chéo vẫn có độ dài 1). */
export function keysToVector(pressed: ReadonlySet<string>): InputVector {
  let x = 0;
  let y = 0;
  for (const code of pressed) {
    const direction = KEY_DIRECTIONS[code];
    if (!direction) continue;
    x += direction[0];
    y += direction[1];
  }
  x = Math.sign(x);
  y = Math.sign(y);
  const length = Math.hypot(x, y);
  return length === 0 ? ZERO_INPUT : { x: x / length, y: y / length };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Theo dõi WASD / phím mũi tên. Bỏ qua khi đang gõ vào ô nhập. */
export class KeyboardInput {
  private readonly pressed = new Set<string>();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!isMovementKey(event.code) || isTypingTarget(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    this.pressed.add(event.code);
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
  };

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  vector(): InputVector {
    return keysToVector(this.pressed);
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.pressed.clear();
  }
}
