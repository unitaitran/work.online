import { ZERO_INPUT, type InputVector } from '../world/movement';

/** Vùng chết ở giữa cần gạt (tỉ lệ theo bán kính). */
export const JOYSTICK_DEAD_ZONE = 0.15;

/**
 * Đổi độ lệch núm (pixel màn hình, y hướng xuống) thành hướng đi (y hướng lên = tiến).
 * Kết quả có độ dài 0..1, vùng chết được trừ ra để đẩy nhẹ vẫn đi chậm mượt.
 */
export function joystickVector(
  dx: number,
  dy: number,
  radius: number,
  deadZone = JOYSTICK_DEAD_ZONE,
): InputVector {
  if (radius <= 0) return ZERO_INPUT;
  const length = Math.hypot(dx, dy) / radius;
  if (length <= deadZone) return ZERO_INPUT;
  const strength = Math.min(1, (length - deadZone) / (1 - deadZone));
  const scale = strength / length / radius;
  return { x: dx * scale, y: -dy * scale };
}

/** Cần gạt ảo cho màn cảm ứng. Tự hiện khi máy có màn cảm ứng hoặc khi người chơi chạm lần đầu. */
export class VirtualJoystick {
  readonly element: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private radius = 1;
  private current: InputVector = ZERO_INPUT;
  private readonly coarseQuery = window.matchMedia('(pointer: coarse)');

  private readonly onDown = (event: PointerEvent): void => {
    if (this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.element.setPointerCapture(event.pointerId);
    const rect = this.element.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this.radius = rect.width * 0.4;
    this.update(event);
    event.preventDefault();
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.update(event);
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.current = ZERO_INPUT;
    this.knob.style.transform = '';
  };

  private readonly onAnyTouch = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') this.setVisible(true);
  };

  private readonly onMediaChange = (): void => {
    if (this.coarseQuery.matches) this.setVisible(true);
  };

  constructor(parent: HTMLElement, label: string) {
    this.element = document.createElement('div');
    this.element.className = 'joystick';
    this.element.setAttribute('role', 'application');
    this.element.setAttribute('aria-label', label);
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.element.append(this.knob);
    parent.append(this.element);

    this.setVisible(this.coarseQuery.matches);
    this.element.addEventListener('pointerdown', this.onDown);
    this.element.addEventListener('pointermove', this.onMove);
    this.element.addEventListener('pointerup', this.onUp);
    this.element.addEventListener('pointercancel', this.onUp);
    window.addEventListener('pointerdown', this.onAnyTouch, { capture: true });
    this.coarseQuery.addEventListener('change', this.onMediaChange);
  }

  vector(): InputVector {
    return this.current;
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onAnyTouch, { capture: true });
    this.coarseQuery.removeEventListener('change', this.onMediaChange);
    this.element.remove();
  }

  private update(event: PointerEvent): void {
    const dx = event.clientX - this.centerX;
    const dy = event.clientY - this.centerY;
    this.current = joystickVector(dx, dy, this.radius);
    // Núm chạy tối đa tới mép vòng tròn.
    const length = Math.hypot(dx, dy);
    const k = length > this.radius ? this.radius / length : 1;
    this.knob.style.transform = `translate(${String(dx * k)}px, ${String(dy * k)}px)`;
  }
}
