// Lịch sinh hoạt của NPC đồng nghiệp: máy trạng thái đơn giản, dữ liệu thuần.
import type { Rng } from '../avatar/names';

export type NpcActivity = 'work' | 'coffee' | 'meeting' | 'stroll';
export const NPC_ACTIVITIES: readonly NpcActivity[] = ['work', 'coffee', 'meeting', 'stroll'];

/** Sau khi làm việc thì đi đâu (trọng số). Các hoạt động khác xong đều quay về làm việc. */
const AFTER_WORK: readonly (readonly [NpcActivity, number])[] = [
  ['coffee', 0.4],
  ['meeting', 0.3],
  ['stroll', 0.3],
];

/** Thời gian ở lại mỗi hoạt động (giây). */
export const ACTIVITY_SECONDS: Readonly<Record<NpcActivity, readonly [number, number]>> = {
  work: [25, 45],
  coffee: [6, 10],
  meeting: [20, 35],
  stroll: [4, 8],
};

export function nextActivity(current: NpcActivity, rng: Rng): NpcActivity {
  if (current !== 'work') return 'work';
  let roll = rng();
  for (const [activity, weight] of AFTER_WORK) {
    if (roll < weight) return activity;
    roll -= weight;
  }
  return 'stroll';
}

export function activityDuration(activity: NpcActivity, rng: Rng): number {
  const [min, max] = ACTIVITY_SECONDS[activity];
  return min + rng() * (max - min);
}

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32): cùng hạt giống thì cùng dãy số. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Băm chuỗi thành số 32 bit (FNV-1a). */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
