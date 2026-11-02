import { describe, expect, it } from 'vitest';
import { buildWsUrl } from './wsUrl';

describe('buildWsUrl', () => {
  it('http -> ws, giữ host và cổng', () => {
    expect(buildWsUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws',
    );
  });

  it('https -> wss', () => {
    expect(buildWsUrl({ protocol: 'https:', host: 'dilam.example' })).toBe(
      'wss://dilam.example/ws',
    );
  });

  it('cho phép đổi đường dẫn', () => {
    expect(buildWsUrl({ protocol: 'http:', host: 'a:1' }, '/khac')).toBe('ws://a:1/khac');
  });
});
