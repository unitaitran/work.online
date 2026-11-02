import { describe, expect, it } from 'vitest';
import { BRAG_HEIGHT, BRAG_WIDTH, bragTiles } from './bragCard';

describe('thẻ khoe thành tích', () => {
  it('kích thước 1080×1350', () => {
    expect([BRAG_WIDTH, BRAG_HEIGHT]).toEqual([1080, 1350]);
  });

  it('bốn ô số liệu tiếng Việt, định dạng số kiểu Việt Nam', () => {
    const tiles = bragTiles({ keys: 12345, coffees: 2, meetings: 1, dodged: 3 });
    expect(tiles.map((t) => t.label)).toEqual([
      'phím đã gõ',
      'ly cà phê',
      'cuộc họp',
      'lần né sếp',
    ]);
    expect(tiles[0]?.value).toBe('12.345');
    expect(bragTiles(undefined).every((t) => t.value === '0')).toBe(true);
  });
});
