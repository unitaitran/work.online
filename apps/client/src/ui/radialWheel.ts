import type { Emote } from '@dilam/shared';
import { el } from './dom';

export interface RadialItem {
  emote: Emote;
  label: string;
  emoji: string;
  angleDeg: number; // Góc trung tâm tính theo độ (-90 là đỉnh trên cùng)
}

export const RADIAL_ITEMS: readonly RadialItem[] = [
  { emote: 'wave', label: 'Chào', emoji: '👋', angleDeg: -90 },
  { emote: 'coffee', label: 'Cà phê', emoji: '☕', angleDeg: -45 },
  { emote: 'cheer', label: 'Ăn mừng', emoji: '🎉', angleDeg: 0 },
  { emote: 'clap', label: 'Vỗ tay', emoji: '👏', angleDeg: 45 },
  { emote: 'sleepy', label: 'Buồn ngủ', emoji: '💤', angleDeg: 90 },
  { emote: 'think', label: 'Suy nghĩ', emoji: '🤔', angleDeg: 135 },
  { emote: 'laugh', label: 'Cười lớn', emoji: '😂', angleDeg: 180 },
  { emote: 'heart', label: 'Bắn tim', emoji: '❤️', angleDeg: -135 },
];

export interface RadialWheelOptions {
  onSelectEmote(emote: Emote): void;
  onSendChat(text: string): void;
  onClose(): void;
  showToast(message: string): void;
}

const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_CHATS_PER_WINDOW = 5;

export class RadialWheel {
  private readonly overlay: HTMLElement;
  private readonly wheel: HTMLElement;
  private readonly centerInput: HTMLInputElement;
  private readonly sectorEls: HTMLElement[] = [];
  private readonly chatTimestamps: number[] = [];
  private activeSectorIndex: number | null = null;
  private isOpen = false;

  constructor(private readonly o: RadialWheelOptions) {
    this.centerInput = el('input', {
      className: 'radial-chat-input',
      attrs: {
        type: 'text',
        placeholder: '💬 Nhập tin nhắn... (Enter)',
        maxlength: '100',
      },
    });

    const centerZone = el('div', {
      className: 'radial-center-zone',
      children: [
        el('div', {
          className: 'radial-center-tip',
          text: 'Giữ chuột ở giữa để chat (tối đa 5 tin/phút)',
        }),
        this.centerInput,
      ],
    });

    this.wheel = el('div', { className: 'radial-wheel-circle' });

    // Tạo 8 lát cắt biểu cảm
    RADIAL_ITEMS.forEach((item, index) => {
      const radius = 135; // px từ tâm
      const rad = (item.angleDeg * Math.PI) / 180;
      const x = Math.round(Math.cos(rad) * radius);
      const y = Math.round(Math.sin(rad) * radius);

      const sector = el('button', {
        className: 'radial-sector-btn',
        attrs: { type: 'button', 'data-index': String(index) },
        children: [
          el('span', { className: 'radial-sector-emoji', text: item.emoji }),
          el('span', { className: 'radial-sector-label', text: item.label }),
        ],
      });

      sector.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      this.sectorEls.push(sector);
      this.wheel.append(sector);
    });

    this.wheel.append(centerZone);

    this.overlay = el('div', {
      className: 'radial-wheel-overlay',
      children: [this.wheel],
    });

    this.bindEvents();
  }

  private bindEvents(): void {
    // Di chuột để chọn góc
    this.overlay.addEventListener('pointermove', (e) => {
      if (!this.isOpen) return;
      const rect = this.wheel.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);

      // Vùng chết trung tâm (bán kính < 65px): để chat
      if (dist < 65) {
        this.highlightSector(null);
        return;
      }

      // Tính góc theo độ (-180..180)
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI;

      // Tìm sector gần nhất
      let bestIdx = 0;
      let minDiff = 360;
      RADIAL_ITEMS.forEach((item, idx) => {
        let diff = Math.abs(deg - item.angleDeg);
        if (diff > 180) diff = 360 - diff;
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = idx;
        }
      });

      this.highlightSector(bestIdx);
    });

    // Thả chuột / click để kích hoạt
    this.overlay.addEventListener('click', (e) => {
      // Nếu click vào ô nhập liệu thì không đóng
      if (e.target === this.centerInput) return;

      if (this.activeSectorIndex !== null) {
        const item = RADIAL_ITEMS[this.activeSectorIndex];
        if (item) {
          this.o.onSelectEmote(item.emote);
          this.close();
        }
      } else {
        // Click ngoài vòng tròn thì đóng
        const rect = this.wheel.getBoundingClientRect();
        const dist = Math.hypot(
          e.clientX - (rect.left + rect.width / 2),
          e.clientY - (rect.top + rect.height / 2),
        );
        if (dist > 190) {
          this.close();
        }
      }
    });

    // Gửi chat khi nhấn Enter ở tâm
    this.centerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitChat();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    // Phím Escape đóng wheel
    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.close();
      }
    });
  }

  private submitChat(): void {
    const text = this.centerInput.value.trim();
    if (!text) return;

    const now = Date.now();
    // Lọc các tin trong vòng 60 giây qua
    while (
      this.chatTimestamps.length > 0 &&
      now - (this.chatTimestamps[0] ?? 0) > CHAT_RATE_LIMIT_WINDOW_MS
    ) {
      this.chatTimestamps.shift();
    }

    if (this.chatTimestamps.length >= MAX_CHATS_PER_WINDOW) {
      this.o.showToast('⚠️ Bạn nhắn hơi nhanh rồi! Tối đa 5 tin/phút để tránh spam.');
      return;
    }

    this.chatTimestamps.push(now);
    this.o.onSendChat(text);
    this.centerInput.value = '';
    this.close();
  }

  private highlightSector(index: number | null): void {
    if (this.activeSectorIndex === index) return;
    this.activeSectorIndex = index;

    this.sectorEls.forEach((el, idx) => {
      if (idx === index) {
        el.classList.add('radial-sector-active');
      } else {
        el.classList.remove('radial-sector-active');
      }
    });
  }

  mount(parent: HTMLElement): void {
    parent.append(this.overlay);
    this.overlay.hidden = true;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.hidden = false;
    this.highlightSector(null);
    this.centerInput.value = '';
    // Focus ô chat nếu người chơi không di chuột ra ngoài
    window.setTimeout(() => {
      this.centerInput.focus();
    }, 50);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.hidden = true;
    this.highlightSector(null);
    this.centerInput.blur();
    this.o.onClose();
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  get visible(): boolean {
    return this.isOpen;
  }

  dispose(): void {
    this.overlay.remove();
  }
}
