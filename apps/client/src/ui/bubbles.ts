import { el } from './dom';

/**
 * Bong bóng trạng thái trên đầu NPC. Dùng DOM thay vì sprite 3D:
 * chữ tiếng Việt sắc nét, không tốn draw call, trình đọc màn hình đọc được.
 */
export class BubbleLayer {
  private readonly root: HTMLDivElement;
  private readonly bubbles = new Map<string, { element: HTMLDivElement; text: HTMLSpanElement }>();

  constructor(parent: HTMLElement) {
    this.root = el('div', { className: 'bubble-layer', attrs: { 'aria-live': 'off' } });
    parent.append(this.root);
  }

  ensure(id: string, name: string): void {
    if (this.bubbles.has(id)) return;
    const text = el('span', { className: 'npc-bubble-text' });
    const element = el('div', {
      className: 'npc-bubble',
      children: [el('strong', { className: 'npc-bubble-name', text: name }), text],
    });
    element.hidden = true;
    this.root.append(element);
    this.bubbles.set(id, { element, text });
  }

  /** x, y: pixel màn hình của điểm trên đầu; null = ẩn (sau camera / quá xa). */
  update(id: string, screen: { x: number; y: number } | null, status: string): void {
    const bubble = this.bubbles.get(id);
    if (!bubble) return;
    if (!screen) {
      bubble.element.hidden = true;
      return;
    }
    bubble.element.hidden = false;
    if (bubble.text.textContent !== status) bubble.text.textContent = status;
    bubble.element.style.transform = `translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  dispose(): void {
    this.root.remove();
    this.bubbles.clear();
  }
}
