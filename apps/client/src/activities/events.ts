// Bus sự kiện chung cho các hoạt động. Mỗi hoạt động phát {type, startedAt, durationMs, detail}.
// Phase 2B chưa tính XP: sự kiện chỉ được ghi lại (bộ nhớ + localStorage) để trang debug xem
// và để phase sau gửi lên server.
import { z } from 'zod';
import type { KeyValueStore } from '../storage';

/** Chi tiết của từng loại sự kiện. */
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

export type ActivityListener = (event: ActivityEvent) => void;

export const EVENT_LOG_KEY = 'dilam.events.v1';
/** Chỉ giữ chừng này sự kiện gần nhất trên máy. */
export const EVENT_LOG_LIMIT = 300;

export class ActivityBus {
  private readonly listeners = new Set<ActivityListener>();
  private readonly log: ActivityEvent[];

  constructor(private readonly store: KeyValueStore | null = null) {
    this.log = loadEventLog(store);
  }

  on(listener: ActivityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ActivityEvent): void {
    this.log.push(event);
    if (this.log.length > EVENT_LOG_LIMIT) this.log.splice(0, this.log.length - EVENT_LOG_LIMIT);
    saveEventLog(this.store, this.log);
    for (const listener of this.listeners) listener(event);
  }

  history(): readonly ActivityEvent[] {
    return this.log;
  }
}

/** Tiện ích tạo sự kiện có kiểu chặt. */
export function makeEvent<K extends ActivityEventType>(
  type: K,
  startedAt: number,
  durationMs: number,
  detail: ActivityEventDetails[K],
): Extract<ActivityEvent, { type: K }> {
  return { type, startedAt, durationMs: Math.max(0, Math.round(durationMs)), detail } as Extract<
    ActivityEvent,
    { type: K }
  >;
}

const storedEventSchema = z.object({
  type: z.enum(ACTIVITY_EVENT_TYPES as [ActivityEventType, ...ActivityEventType[]]),
  startedAt: z.number(),
  durationMs: z.number().nonnegative(),
  detail: z.record(z.string(), z.unknown()),
});

/** Đọc nhật ký đã lưu; bản ghi hỏng bị bỏ qua. */
export function loadEventLog(store: KeyValueStore | null): ActivityEvent[] {
  if (!store) return [];
  try {
    const raw = store.getItem(EVENT_LOG_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const events: ActivityEvent[] = [];
    for (const item of data) {
      const parsed = storedEventSchema.safeParse(item);
      if (parsed.success) events.push(parsed.data as ActivityEvent);
    }
    return events.slice(-EVENT_LOG_LIMIT);
  } catch {
    return [];
  }
}

function saveEventLog(store: KeyValueStore | null, events: readonly ActivityEvent[]): void {
  if (!store) return;
  try {
    store.setItem(EVENT_LOG_KEY, JSON.stringify(events));
  } catch {
    // Hết chỗ hoặc bị chặn: nhật ký chỉ còn trong bộ nhớ.
  }
}

export function clearEventLog(store: KeyValueStore | null): void {
  try {
    store?.removeItem(EVENT_LOG_KEY);
  } catch {
    // bỏ qua
  }
}
