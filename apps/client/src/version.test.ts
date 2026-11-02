import { PROTOCOL_VERSION } from '@dilam/shared';
import { describe, expect, it } from 'vitest';
import { compareVersion } from './version';

describe('kiểm tra phiên bản', () => {
  it('giao thức khác thì bắt buộc tải lại; cùng giao thức thì ổn', () => {
    expect(compareVersion({ protocolVersion: PROTOCOL_VERSION + 1 })).toBe('required');
    expect(compareVersion({ protocolVersion: PROTOCOL_VERSION, buildId: null })).toBe('ok');
    // Khi chạy test (dev) không so bản build.
    expect(compareVersion({ protocolVersion: PROTOCOL_VERSION, buildId: 'abc' })).toBe('ok');
  });
});
