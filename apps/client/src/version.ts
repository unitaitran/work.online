// Phiên bản bản build và kiểm tra bản mới (PWA): giao thức đổi thì bắt buộc tải lại,
// chỉ đổi bản build thì gợi ý tải lại.
import { PROTOCOL_VERSION } from '@dilam/shared';

declare const __BUILD_ID__: string;

/** Mã bản build (gắn lúc build; khi dev là "dev"). */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

export type VersionStatus = 'ok' | 'update' | 'required';

/** So với thông tin server: giao thức khác → bắt buộc; bản build khác → nên tải lại. */
export function compareVersion(server: {
  protocolVersion: number;
  buildId?: string | null;
}): VersionStatus {
  if (server.protocolVersion !== PROTOCOL_VERSION) return 'required';
  if (server.buildId && BUILD_ID !== 'dev' && server.buildId !== BUILD_ID) return 'update';
  return 'ok';
}

/** Đăng ký service worker (chỉ bản build, chỉ khi trình duyệt hỗ trợ). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
