import { describe, expect, it } from 'vitest';
import { GAME_NAME } from './constants';
import { MAX_ECHO_TEXT_LENGTH, parseClientMessage, parseServerMessage } from './protocol';

describe('GAME_NAME', () => {
  it('là tên game tiếng Việt', () => {
    expect(GAME_NAME).toBe('Đi làm Online');
  });
});

describe('parseClientMessage', () => {
  it('nhận tin echo hợp lệ và cắt khoảng trắng thừa', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'echo', text: '  Chào sếp  ' }))).toEqual({
      ok: true,
      value: { type: 'echo', text: 'Chào sếp' },
    });
  });

  it('nhận đúng độ dài tối đa', () => {
    const text = 'a'.repeat(MAX_ECHO_TEXT_LENGTH);
    expect(parseClientMessage(JSON.stringify({ type: 'echo', text })).ok).toBe(true);
  });

  it.each([
    ['không phải JSON', 'xin chào'],
    ['JSON không phải object', '42'],
    ['null', 'null'],
    ['thiếu type', JSON.stringify({ text: 'hi' })],
    ['type lạ', JSON.stringify({ type: 'xp', amount: 9999 })],
    ['text rỗng', JSON.stringify({ type: 'echo', text: '   ' })],
    ['text sai kiểu', JSON.stringify({ type: 'echo', text: 123 })],
    ['text quá dài', JSON.stringify({ type: 'echo', text: 'a'.repeat(MAX_ECHO_TEXT_LENGTH + 1) })],
    ['có trường thừa', JSON.stringify({ type: 'echo', text: 'hi', xp: 1000 })],
  ])('từ chối: %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toEqual({ ok: false });
  });
});

describe('parseServerMessage', () => {
  it('nhận tin echo của server', () => {
    const raw = JSON.stringify({ type: 'echo', text: 'hi', serverTime: 1_700_000_000_000 });
    expect(parseServerMessage(raw)).toEqual({
      ok: true,
      value: { type: 'echo', text: 'hi', serverTime: 1_700_000_000_000 },
    });
  });

  it('nhận tin lỗi có mã hợp lệ', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'error', code: 'rate_limited' }))).toEqual({
      ok: true,
      value: { type: 'error', code: 'rate_limited' },
    });
  });

  it.each([
    ['mã lỗi lạ', JSON.stringify({ type: 'error', code: 'boom' })],
    ['giờ server âm', JSON.stringify({ type: 'echo', text: 'hi', serverTime: -1 })],
    [
      'giờ server không phải số nguyên',
      JSON.stringify({ type: 'echo', text: 'hi', serverTime: 1.5 }),
    ],
    ['JSON hỏng', '{"type":'],
  ])('từ chối: %s', (_label, raw) => {
    expect(parseServerMessage(raw)).toEqual({ ok: false });
  });
});
