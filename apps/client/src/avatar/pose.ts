// Tư thế nhân vật tính bằng hàm thuần: chỉ xoay/dịch các bộ phận, không dùng xương.
// Quy ước: nhân vật nhìn về +Z; xoay X âm ở vai/hông = đưa tay/chân ra phía trước.
import { lerp } from '../engine/mathUtils';

export const POSES = ['stand', 'walk', 'sit', 'type'] as const;
export type PoseName = (typeof POSES)[number];

export interface PoseState {
  /** Dịch cả người theo trục Y (nhún khi đi, hạ khi ngồi). */
  rootY: number;
  /** Nghiêng thân trước/sau. */
  bodyPitch: number;
  headPitch: number;
  headRoll: number;
  armLeftX: number;
  armRightX: number;
  /** Dang tay ra hai bên (trái dương, phải âm). */
  armLeftZ: number;
  armRightZ: number;
  legLeftX: number;
  legRightX: number;
}

const POSE_KEYS = [
  'rootY',
  'bodyPitch',
  'headPitch',
  'headRoll',
  'armLeftX',
  'armRightX',
  'armLeftZ',
  'armRightZ',
  'legLeftX',
  'legRightX',
] as const satisfies readonly (keyof PoseState)[];

const WALK_FREQUENCY = 9;
const TYPE_FREQUENCY = 20;

/** Tư thế tại thời điểm `t` (giây) của động tác. */
export function computePose(pose: PoseName, t: number): PoseState {
  switch (pose) {
    case 'stand': {
      const breathe = Math.sin(t * 2.2);
      return {
        rootY: breathe * 0.006,
        bodyPitch: 0,
        headPitch: breathe * 0.02,
        headRoll: Math.sin(t * 0.7) * 0.04,
        armLeftX: breathe * 0.04,
        armRightX: -breathe * 0.04,
        armLeftZ: 0.12,
        armRightZ: -0.12,
        legLeftX: 0,
        legRightX: 0,
      };
    }
    case 'walk': {
      const swing = Math.sin(t * WALK_FREQUENCY);
      return {
        rootY: Math.abs(Math.cos(t * WALK_FREQUENCY)) * 0.035,
        bodyPitch: 0.06,
        headPitch: -0.03,
        headRoll: swing * 0.03,
        armLeftX: swing * 0.6,
        armRightX: -swing * 0.6,
        armLeftZ: 0.1,
        armRightZ: -0.1,
        legLeftX: -swing * 0.55,
        legRightX: swing * 0.55,
      };
    }
    case 'sit':
      return {
        rootY: -0.03,
        bodyPitch: -0.04,
        headPitch: Math.sin(t * 1.5) * 0.03,
        headRoll: Math.sin(t * 0.6) * 0.05,
        armLeftX: -0.45,
        armRightX: -0.45,
        armLeftZ: 0.08,
        armRightZ: -0.08,
        legLeftX: -1.35,
        legRightX: -1.35,
      };
    case 'type': {
      const tap = Math.sin(t * TYPE_FREQUENCY);
      return {
        rootY: -0.03,
        bodyPitch: 0.08,
        // Nhìn thẳng vào màn hình ngang tầm mắt (chỉ hơi cúi).
        headPitch: 0.04,
        headRoll: 0,
        armLeftX: -1.25 + tap * 0.1,
        armRightX: -1.25 - tap * 0.1,
        armLeftZ: -0.12,
        armRightZ: 0.12,
        legLeftX: -1.35,
        legRightX: -1.35,
      };
    }
  }
}

/** Trộn hai tư thế (k = 0 → a, k = 1 → b). */
export function blendPose(a: PoseState, b: PoseState, k: number): PoseState {
  const out = { ...a };
  for (const key of POSE_KEYS) out[key] = lerp(a[key], b[key], k);
  return out;
}

export function isSeated(pose: PoseName): boolean {
  return pose === 'sit' || pose === 'type';
}
