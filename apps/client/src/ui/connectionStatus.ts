import type { ConnectionTestResult } from '../net/connectionTest';
import { STRINGS } from '../strings';

export interface StatusView {
  text: string;
  tone: 'ok' | 'error';
}

/** Giờ dạng HH:MM:SS theo kiểu Việt Nam. `timeZone` để trống thì dùng giờ máy. */
export function formatClock(epochMs: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(epochMs);
}

/** Đổi kết quả thử kết nối thành câu hiển thị cho người chơi. */
export function describeConnectionResult(
  result: ConnectionTestResult,
  timeZone?: string,
): StatusView {
  const s = STRINGS.connection;
  if (result.ok) {
    return {
      tone: 'ok',
      text: s.success(result.text, formatClock(result.serverTime, timeZone), result.roundTripMs),
    };
  }
  switch (result.reason) {
    case 'connect_failed':
      return { tone: 'error', text: s.connectFailed };
    case 'timeout':
      return { tone: 'error', text: s.timeout };
    case 'bad_reply':
      return { tone: 'error', text: s.badReply };
    case 'server_error':
      return { tone: 'error', text: s.serverErrors[result.code] };
  }
}
