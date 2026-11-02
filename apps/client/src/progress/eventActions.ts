// Đổi sự kiện hoạt động (bus) thành hành động gửi server. Chỉ gửi dữ kiện thô (số phím, mục tiêu),
// KHÔNG gửi XP hay thời lượng: server tự đo giờ (đã nhận lúc bắt đầu) và tự tính điểm.
// Những hành động cần kết quả ngay (chấm công) hoặc báo lúc bắt đầu (tập trung, họp, pha cà phê)
// được hoạt động gửi trực tiếp, nên không có ở đây.
import type { Action, ActivityEvent } from '@dilam/shared';

export function actionForEvent(event: ActivityEvent): Action | null {
  switch (event.type) {
    case 'focus-typing':
      return {
        kind: 'focus_end',
        presses: event.detail.presses,
        scoredKeys: event.detail.scoredKeys,
        lines: event.detail.lines,
      };
    case 'kpi-fortune':
      return { kind: 'fortune' };
    case 'task-flip':
      return { kind: 'task_flip', taskId: event.detail.taskId, completed: event.detail.completed };
    case 'coffee-gift':
      return { kind: 'coffee_gift', npcId: event.detail.npcId };
    case 'coffee-drink':
      return { kind: 'coffee_drink' };
    case 'chore':
      return { kind: 'chore', target: event.detail.target };
    case 'print':
      return { kind: 'print' };
    case 'meeting':
      return { kind: 'meeting_end' };
    case 'vent':
      return { kind: 'vent', length: event.detail.length, anonymous: event.detail.anonymous };
    case 'checkin':
    case 'coffee-brew':
    case 'room-event':
    case 'company-promotion':
    case 'work-tick':
      return null;
  }
}
