/** Ngưỡng phân biệt "chạm/bấm" với "kéo". */
export const TAP_MAX_MOVE_PX = 8;
export const TAP_MAX_DURATION_MS = 450;

export function isTap(movedPx: number, durationMs: number): boolean {
  return movedPx <= TAP_MAX_MOVE_PX && durationMs <= TAP_MAX_DURATION_MS;
}

/** Hệ số zoom từ một lần cuộn chuột (deltaY dương = cuộn xuống = lùi ra xa). */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(Math.max(-200, Math.min(200, pixels)) * 0.0015);
}

export interface PointerHandlers {
  onTap?(clientX: number, clientY: number): void;
  onDrag?(dxPixels: number, dyPixels: number): void;
  /** factor < 1 là phóng to. */
  onZoom?(factor: number): void;
}

interface TrackedPointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
}

/**
 * Chuột và cảm ứng trên canvas: chạm/bấm = onTap, kéo một ngón/chuột = onDrag,
 * chụm hai ngón hoặc cuộn chuột = onZoom.
 */
export class PointerControls {
  private readonly pointers = new Map<number, TrackedPointer>();
  private dragging = false;
  /** Đã từng có hai ngón trong cử chỉ này: không tính là chạm nữa. */
  private multiTouch = false;
  private pinchDistance = 0;

  private readonly onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;
    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
    });
    if (this.pointers.size >= 2) {
      this.multiTouch = true;
      this.pinchDistance = this.currentPinchDistance();
    }
  };

  private readonly onMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.pointers.size >= 2) {
      const distance = this.currentPinchDistance();
      if (this.pinchDistance > 0 && distance > 0) {
        this.handlers.onZoom?.(this.pinchDistance / distance);
      }
      this.pinchDistance = distance;
      return;
    }
    if (this.multiTouch) return;

    const moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (!this.dragging && moved > TAP_MAX_MOVE_PX) this.dragging = true;
    if (this.dragging) this.handlers.onDrag?.(dx, dy);
  };

  private readonly onUp = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    this.pointers.delete(event.pointerId);

    const isPrimaryClick = event.pointerType !== 'mouse' || event.button === 0;
    const moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (
      event.type === 'pointerup' &&
      isPrimaryClick &&
      !this.dragging &&
      !this.multiTouch &&
      isTap(moved, performance.now() - pointer.startTime)
    ) {
      this.handlers.onTap?.(event.clientX, event.clientY);
    }

    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.multiTouch = false;
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.handlers.onZoom) return;
    event.preventDefault();
    this.handlers.onZoom(wheelZoomFactor(event.deltaY, event.deltaMode));
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: PointerHandlers,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onUp);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    this.pointers.clear();
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
