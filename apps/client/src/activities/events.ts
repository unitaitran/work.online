// Bus sự kiện chung cho các hoạt động. Mỗi hoạt động phát {type, startedAt, durationMs, detail}.
// Phase 3: ProgressService nghe bus để tính XP bằng luật trong @dilam/shared; nhật ký
// (bộ nhớ + localStorage) để trang debug xem.
import type { KeyValueStore } from '../storage';

import {
  ACTIVITY_EVENT_TYPES,
  activityEventSchema,
  makeEvent,
  type ActivityEvent,
  type ActivityEventDetails,
  type ActivityEventType,
} from '@dilam/shared';

export { ACTIVITY_EVENT_TYPES, makeEvent };
export type { ActivityEvent, ActivityEventDetails, ActivityEventType };

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
      const parsed = activityEventSchema.safeParse(item);
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
