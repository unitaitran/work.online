import { describe, expect, it } from 'vitest';
import { BARS, generateSong, isInPentatonic, midiToHz, STEPS_PER_BAR } from './synth';

describe('midiToHz', () => {
  it('La 4 = 440 Hz, lên một quãng tám thì gấp đôi', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
  });
});

describe('generateSong', () => {
  const song = generateSong('Văn phòng Mây Hồng · Tầng 7');

  it('cùng tên văn phòng thì cùng bài', () => {
    expect(generateSong('Văn phòng Mây Hồng · Tầng 7')).toEqual(song);
  });

  it('khác tên thì khác giai điệu', () => {
    expect(generateSong('Văn phòng Gió Lộng · Tầng 3').melody).not.toEqual(song.melody);
  });

  it('đủ độ dài, nhịp độ chậm kiểu lofi', () => {
    expect(song.melody).toHaveLength(BARS * STEPS_PER_BAR);
    expect(song.chords).toHaveLength(BARS);
    expect(song.bpm).toBeGreaterThanOrEqual(70);
    expect(song.bpm).toBeLessThan(90);
  });

  it('mọi nốt giai điệu thuộc thang ngũ cung, có cả nốt và lặng', () => {
    const notes = song.melody.filter((n): n is number => n !== null);
    expect(notes.length).toBeGreaterThan(10);
    expect(notes.length).toBeLessThan(song.melody.length);
    for (const note of notes) expect(isInPentatonic(note, song.root)).toBe(true);
  });

  it('nhiều tên khác nhau đều cho bài hợp lệ', () => {
    for (const name of ['A', 'Tầng 1', 'Phòng HR', '😀', '']) {
      const s = generateSong(name);
      for (const note of s.melody)
        if (note !== null) expect(isInPentatonic(note, s.root)).toBe(true);
    }
  });
});
