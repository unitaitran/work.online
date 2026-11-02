// Thống kê ẩn danh: gửi tên sự kiện (không id, không cookie). Người chơi tắt trong tab Tài khoản;
// trình duyệt bật Do Not Track thì mặc định tắt.
import type { AnalyticsEvent } from '@dilam/shared';
import type { KeyValueStore } from '../storage';

export const ANALYTICS_KEY = 'dilam.analytics.v1';

export function analyticsEnabled(store: KeyValueStore | null, doNotTrack: string | null): boolean {
  try {
    const saved = store?.getItem(ANALYTICS_KEY);
    if (saved === 'on') return true;
    if (saved === 'off') return false;
  } catch {
    // bỏ qua
  }
  return doNotTrack !== '1';
}

export function setAnalyticsEnabled(store: KeyValueStore | null, enabled: boolean): void {
  try {
    store?.setItem(ANALYTICS_KEY, enabled ? 'on' : 'off');
  } catch {
    // bỏ qua
  }
}

export function track(store: KeyValueStore | null, event: AnalyticsEvent): void {
  if (!analyticsEnabled(store, navigator.doNotTrack)) return;
  // keepalive: gửi được cả khi đang rời trang; credentials 'omit': không kèm cookie hay token.
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event }),
    credentials: 'omit',
    keepalive: true,
  }).catch(() => undefined);
}
