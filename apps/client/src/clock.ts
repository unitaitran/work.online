// Đồng hồ trò chơi. Bản chạy dev cho phép "tua ngày" (cộng thêm độ lệch) để thử chuỗi chấm công
// và kỳ đánh giá; bản build không có độ lệch (import.meta.env.DEV = false).
import { dayKey } from '@dilam/shared';

const OFFSET_KEY = 'dilam.dev.timeOffset';
let offsetMs = 0;

if (import.meta.env.DEV) {
  try {
    offsetMs = Number(localStorage.getItem(OFFSET_KEY) ?? 0) || 0;
  } catch {
    offsetMs = 0;
  }
}

export const clock = {
  now(): number {
    return Date.now() + offsetMs;
  },
  date(): Date {
    return new Date(clock.now());
  },
  /** Ngày lịch hiện tại theo múi giờ của máy. */
  today(): string {
    return dayKey(clock.date());
  },
  offsetMs(): number {
    return offsetMs;
  },
  /** Chỉ có tác dụng khi chạy dev. */
  setOffset(ms: number): void {
    if (!import.meta.env.DEV) return;
    offsetMs = ms;
    try {
      localStorage.setItem(OFFSET_KEY, String(ms));
    } catch {
      // bỏ qua
    }
  },
};
