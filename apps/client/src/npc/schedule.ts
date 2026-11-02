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

// Dùng chung với server.
export { hashString, seededRng } from '@dilam/shared';
