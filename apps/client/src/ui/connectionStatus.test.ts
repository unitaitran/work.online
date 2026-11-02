import { describe, expect, it } from 'vitest';
import { STRINGS } from '../strings';
import { describeConnectionResult, formatClock } from './connectionStatus';

const TZ = 'Asia/Ho_Chi_Minh';
// 2026-11-02 07:05:09 UTC = 14:05:09 giờ Việt Nam.
const SERVER_TIME = Date.UTC(2026, 10, 2, 7, 5, 9);

describe('formatClock', () => {
  it('hiện giờ 24h dạng HH:MM:SS', () => {
    expect(formatClock(SERVER_TIME, TZ)).toBe('14:05:09');
  });
});

describe('describeConnectionResult', () => {
  it('thành công: hiện nội dung server trả về và giờ server', () => {
    const view = describeConnectionResult(
      { ok: true, text: 'Xin chào', serverTime: SERVER_TIME, roundTripMs: 12 },
      TZ,
    );
    expect(view.tone).toBe('ok');
    expect(view.text).toBe(STRINGS.connection.success('Xin chào', '14:05:09', 12));
  });

  it.each([
    [{ ok: false, reason: 'connect_failed' } as const, STRINGS.connection.connectFailed],
    [{ ok: false, reason: 'timeout' } as const, STRINGS.connection.timeout],
    [{ ok: false, reason: 'bad_reply' } as const, STRINGS.connection.badReply],
    [
      { ok: false, reason: 'server_error', code: 'rate_limited' } as const,
      STRINGS.connection.serverErrors.rate_limited,
    ],
  ])('thất bại %o', (result, expected) => {
    expect(describeConnectionResult(result)).toEqual({ tone: 'error', text: expected });
  });
});
