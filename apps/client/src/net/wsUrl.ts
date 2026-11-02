import { WS_PATH } from '@dilam/shared';

/** Dựng địa chỉ WebSocket cùng origin với trang (http -> ws, https -> wss). */
export function buildWsUrl(location: Pick<Location, 'protocol' | 'host'>, path = WS_PATH): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${path}`;
}
