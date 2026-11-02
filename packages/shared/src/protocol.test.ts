import { describe, expect, it } from 'vitest';
import { GAME_NAME } from './constants';
import { parseClientMessage, parseServerMessage, poseAt, poseIndex, QUICK_CHATS } from './protocol';

describe('GAME_NAME', () => {
  it('là tên game tiếng Việt', () => {
    expect(GAME_NAME).toBe('Đi làm Online');
  });
});

describe('parseClientMessage', () => {
  it('nhận tin hợp lệ', () => {
    const state = { type: 'state', x: 1.5, z: -2, facing: 3.1, pose: 'walk' };
    expect(parseClientMessage(JSON.stringify(state))).toEqual({ ok: true, value: state });
    expect(parseClientMessage('{"type":"emote","emote":"wave"}').ok).toBe(true);
    expect(parseClientMessage('{"type":"quick_chat","index":0}').ok).toBe(true);
    expect(
      parseClientMessage(JSON.stringify({ type: 'quick_chat', index: QUICK_CHATS.length - 1 })).ok,
    ).toBe(true);
    expect(parseClientMessage('{"type":"ping","t":5}').ok).toBe(true);
  });

  it.each([
    ['không phải JSON', 'xin chào'],
    ['JSON không phải object', '42'],
    ['null', 'null'],
    ['thiếu type', JSON.stringify({ x: 1 })],
    ['type lạ', JSON.stringify({ type: 'xp', amount: 9999 })],
    ['chat tự do', JSON.stringify({ type: 'quick_chat', text: 'xin chào' })],
    ['câu nhanh ngoài danh sách', JSON.stringify({ type: 'quick_chat', index: 999 })],
    ['emote lạ', JSON.stringify({ type: 'emote', emote: 'dance' })],
    ['toạ độ NaN', '{"type":"state","x":null,"z":0,"facing":0,"pose":"walk"}'],
    ['toạ độ quá xa', JSON.stringify({ type: 'state', x: 1e9, z: 0, facing: 0, pose: 'walk' })],
    ['thừa trường', JSON.stringify({ type: 'state', x: 0, z: 0, facing: 0, pose: 'walk', xp: 5 })],
  ])('từ chối: %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toEqual({ ok: false });
  });
});

describe('parseServerMessage', () => {
  it('đọc tin có type, từ chối rác', () => {
    expect(parseServerMessage('{"type":"player_leave","sid":3}')).toEqual({
      ok: true,
      value: { type: 'player_leave', sid: 3 },
    });
    expect(parseServerMessage('rác')).toEqual({ ok: false });
    expect(parseServerMessage('{"x":1}')).toEqual({ ok: false });
  });

  it('tư thế <-> chỉ số', () => {
    expect(poseAt(poseIndex('type'))).toBe('type');
    expect(poseAt(99)).toBe('stand');
  });
});
