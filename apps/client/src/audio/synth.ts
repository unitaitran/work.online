// Phần thuần của nhạc nền: sinh bài lofi từ một chuỗi (tên văn phòng).
// Cùng tên thì cùng giai điệu; mọi nốt đều thuộc thang ngũ cung trưởng.
import { hashString, seededRng } from '../npc/schedule';

/** Thang ngũ cung trưởng (khoảng cách bán cung so với nốt gốc). */
export const PENTATONIC_MAJOR = [0, 2, 4, 7, 9] as const;

/** Số bước (nốt móc đơn) mỗi ô nhịp và số ô nhịp của vòng lặp. */
export const STEPS_PER_BAR = 8;
export const BARS = 8;

export interface Song {
  bpm: number;
  /** Nốt gốc (MIDI). */
  root: number;
  /** Hợp âm từng ô nhịp (các nốt MIDI). */
  chords: number[][];
  /** Giai điệu theo bước; null = nghỉ. Độ dài BARS × STEPS_PER_BAR. */
  melody: (number | null)[];
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function isInPentatonic(midi: number, root: number): boolean {
  const offset = (((midi - root) % 12) + 12) % 12;
  return (PENTATONIC_MAJOR as readonly number[]).includes(offset);
}

/** Vòng hợp âm theo bậc (bán cung so với gốc): I–vi–IV–V và vài biến thể dịu tai. */
const PROGRESSIONS: readonly (readonly number[])[] = [
  [0, 9, 5, 7],
  [0, 7, 9, 5],
  [5, 0, 7, 9],
  [0, 5, 9, 7],
];

/** Bậc vi (9) và ii (2) là hợp âm thứ, còn lại trưởng. */
function chordNotes(root: number, degree: number): number[] {
  const minor = degree === 9 || degree === 2;
  const base = root - 12 + degree;
  return [base, base + (minor ? 3 : 4), base + 7, base + (minor ? 10 : 11)];
}

export function generateSong(seedText: string): Song {
  const rng = seededRng(hashString(seedText));
  const root = 55 + Math.floor(rng() * 7); // G3..C#4
  const bpm = 70 + Math.floor(rng() * 12);
  const progression = PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)] ?? [0, 9, 5, 7];

  // Các nốt ngũ cung trong hai quãng tám để giai điệu bước lên xuống.
  const ladder: number[] = [];
  for (let octave = 0; octave < 2; octave += 1) {
    for (const step of PENTATONIC_MAJOR) ladder.push(root + 12 * octave + step);
  }

  // Sinh 4 ô nhịp, rồi lặp lại với ô cuối biến tấu: nghe có "câu hỏi - trả lời".
  const phrase: (number | null)[] = [];
  let index = 4 + Math.floor(rng() * 3);
  for (let step = 0; step < 4 * STEPS_PER_BAR; step += 1) {
    const onBeat = step % 2 === 0;
    if (rng() < (onBeat ? 0.3 : 0.6)) {
      phrase.push(null);
      continue;
    }
    const move = Math.floor(rng() * 5) - 2; // -2..+2 bậc
    index = Math.min(ladder.length - 1, Math.max(0, index + move));
    phrase.push(ladder[index] ?? root);
  }
  const answer = phrase.slice(0, 3 * STEPS_PER_BAR);
  for (let step = 0; step < STEPS_PER_BAR; step += 1) {
    // Ô cuối kết về nốt gốc hoặc nốt năm cho tròn câu.
    answer.push(
      step === 0
        ? root + 12
        : step === 4
          ? root + 7
          : rng() < 0.5
            ? null
            : (ladder[Math.floor(rng() * ladder.length)] ?? root),
    );
  }

  const chords: number[][] = [];
  for (let bar = 0; bar < BARS; bar += 1) {
    chords.push(chordNotes(root, progression[bar % progression.length] ?? 0));
  }

  return { bpm, root, chords, melody: [...phrase, ...answer] };
}
