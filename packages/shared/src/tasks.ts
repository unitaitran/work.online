// Bảng task: lật bài xem việc nhỏ, nhận việc muốn làm (tối đa vài việc một lúc), làm xong quay
// lại bảng xác nhận để nhận XP. Bài chia ngẫu nhiên riêng cho từng người (người này lật không ảnh
// hưởng người khác); server giữ danh sách việc đã nhận và kiểm tra thời gian làm tối thiểu.

/** Số việc nhỏ (nội dung nằm ở client, data/micro-tasks.ts). */
export const MICRO_TASK_COUNT = 30;
/** Số lá chia mỗi lượt. */
export const TASK_DEAL_COUNT = 4;
/** Giữ tối đa chừng này việc đã nhận cùng lúc. */
export const TASKS_HELD_MAX = 3;
/** Nhận việc rồi phải đi làm ít nhất chừng này mới xác nhận xong được (ms). */
export const TASK_MIN_MS = 60_000;

export interface HeldTask {
  taskId: number;
  acceptedAt: number;
}

/** Còn bao lâu (ms) mới xác nhận được việc này. */
export function taskWaitMs(task: HeldTask, now: number): number {
  return Math.max(0, task.acceptedAt + TASK_MIN_MS - now);
}
