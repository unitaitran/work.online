// Kiểu sự kiện hoạt động dùng chung: client phát, luật XP (và server ở Phase 4) tiêu thụ.
import { z } from 'zod';

export interface ActivityEventDetails {
  checkin: { day: string; streak: number; total: number };
  'focus-typing': {
    plannedMs: number;
    presses: number;
    scoredKeys: number;
    lines: number;
    completed: boolean;
  };
  'kpi-fortune': { day: string; fortuneId: number; repeat: boolean };
  'task-flip': { taskId: number; completed: boolean };
  vent: { length: number; anonymous: boolean };
  'coffee-brew': { brewMs: number };
  'coffee-gift': { npcId: string };
  'coffee-drink': Record<string, never>;
  /** Công quả: tưới cây, lau bàn... `target` là id vật. */
  chore: { target: string };
  /** Ngồi họp ở phòng họp, durationMs = thời gian ngồi. */
  meeting: { seatId: string };
  /** In tài liệu ở máy in. */
  print: Record<string, never>;
  /** Tham gia một sự kiện phòng (sếp đi ngang, mất wifi...) thành công. */
  'room-event': { kind: string };
  /** Uống một cốc trà sữa khi được rủ (tự trả xu, được XP bù lại). */
  'milk-tea': Record<string, never>;
  /** Chủ công ty xét thăng chức (giới hạn một lần mỗi ngày). */
  'company-promotion': { role: number };
  /** Một phút trọn đang ngồi máy / trong phiên tập trung / ngồi họp (server đo). */
  'work-tick': { kind: 'desk' | 'focus' | 'meeting'; minutes: number };
}

export type ActivityEventType = keyof ActivityEventDetails;

export const ACTIVITY_EVENT_TYPES: readonly ActivityEventType[] = [
  'checkin',
  'focus-typing',
  'kpi-fortune',
  'task-flip',
  'vent',
  'coffee-brew',
  'coffee-gift',
  'coffee-drink',
  'chore',
  'meeting',
  'print',
  'room-event',
  'milk-tea',
  'company-promotion',
  'work-tick',
];

export type ActivityEvent = {
  [K in ActivityEventType]: {
    type: K;
    /** Thời điểm bắt đầu (ms từ epoch, UTC). */
    startedAt: number;
    durationMs: number;
    detail: ActivityEventDetails[K];
  };
}[ActivityEventType];

export function makeEvent<K extends ActivityEventType>(
  type: K,
  startedAt: number,
  durationMs: number,
  detail: ActivityEventDetails[K],
): Extract<ActivityEvent, { type: K }> {
  return {
    type,
    startedAt,
    durationMs: Math.max(0, Math.round(durationMs)),
    detail,
  } as Extract<ActivityEvent, { type: K }>;
}

/** Kiểm tra lỏng (đủ cho nhật ký); server Phase 4 sẽ kiểm tra chặt từng loại. */
export const activityEventSchema = z.object({
  type: z.enum(ACTIVITY_EVENT_TYPES as [ActivityEventType, ...ActivityEventType[]]),
  startedAt: z.number(),
  durationMs: z.number().nonnegative(),
  detail: z.record(z.string(), z.unknown()),
});
