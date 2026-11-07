// Tư thế nhân vật tính bằng hàm thuần: chỉ xoay/dịch các bộ phận, không dùng xương.
// Quy ước: nhân vật nhìn về +Z; xoay X âm ở vai/hông = đưa tay/chân ra phía trước.
import { lerp } from '../engine/mathUtils';

export const POSES = ['stand', 'walk', 'sit', 'type', 'lie'] as const;
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
  /** 0 = đứng/ngồi, 1 = nằm ngửa (cả người ngả ra sau quanh gót chân). */
  lie: number;
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
  'lie',
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
        lie: 0,
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
        lie: 0,
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
        lie: 0,
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
        lie: 0,
      };
    }
    case 'lie': {
      // Nằm ngửa ngay ngắn: đầu thẳng tựa trên gối, hai tay thả lỏng nhẹ cạnh thân, chân duỗi thẳng sát nệm.
      const breathe = Math.sin(t * 1.4);
      return {
        rootY: 0,
        bodyPitch: 0,
        headPitch: 0.08 + breathe * 0.01,
        headRoll: 0,
        armLeftX: -0.08,
        armRightX: -0.08,
        armLeftZ: 0.1,
        armRightZ: -0.1,
        legLeftX: -0.05,
        legRightX: -0.05,
        lie: 1,
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
  return pose === 'sit' || pose === 'type' || pose === 'lie';
}

// ---------------------------------------------------------------------------
// Động tác biểu cảm (phủ lên tư thế đang có, khoảng 2,5 giây)
// ---------------------------------------------------------------------------

export const EMOTE_SECONDS = 2.6;

/**
 * Phủ động tác biểu cảm lên tư thế `base` tại thời điểm `t` (giây từ lúc bắt đầu).
 * Đang ngồi thì không nhảy, chân giữ nguyên.
 */
export function applyEmote(base: PoseState, emote: string, t: number, seated: boolean): PoseState {
  const p = { ...base };
  const s = Math.sin;
  switch (emote) {
    case 'wave':
      // Giơ tay phải lên cao và vẫy.
      p.armRightZ = -2.5;
      p.armRightX = s(t * 11) * 0.35;
      p.headRoll = 0.08;
      break;
    case 'clap':
      // Hai tay ra trước, vỗ vào nhau.
      p.armLeftX = -1.3;
      p.armRightX = -1.3;
      p.armLeftZ = -0.05 - Math.abs(s(t * 13)) * 0.3;
      p.armRightZ = 0.05 + Math.abs(s(t * 13)) * 0.3;
      break;
    case 'laugh':
      // Ngửa đầu, rung người.
      p.headPitch = -0.3 + s(t * 14) * 0.05;
      p.bodyPitch = -0.08;
      p.armLeftX = -0.7;
      p.armRightX = -0.7;
      p.armLeftZ = -0.2;
      p.armRightZ = 0.2;
      p.rootY = base.rootY + (seated ? 0 : Math.abs(s(t * 14)) * 0.02);
      break;
    case 'heart':
      // Hai tay vòng lên đầu thành hình trái tim.
      p.armLeftZ = 2.65;
      p.armRightZ = -2.65;
      p.armLeftX = -0.25;
      p.armRightX = -0.25;
      p.headRoll = s(t * 3) * 0.12;
      break;
    case 'think':
      // Tay chống cằm, nghiêng đầu.
      p.armRightX = -2.2;
      p.armRightZ = 0.45;
      p.headRoll = 0.18;
      p.headPitch = 0.08 + s(t * 2) * 0.03;
      break;
    case 'sleepy':
      // Gục gù buồn ngủ.
      p.headPitch = 0.35 + s(t * 2.4) * 0.12;
      p.headRoll = 0.15;
      p.bodyPitch = base.bodyPitch + 0.08;
      p.armLeftX = 0.05;
      p.armRightX = 0.05;
      break;
    case 'coffee':
      // Nâng ly lên nhấp một ngụm.
      p.armRightX = -2.3 + Math.max(0, s(t * 2.5)) * 0.25;
      p.armRightZ = 0.35;
      p.headPitch = -0.12 * Math.max(0, s(t * 2.5));
      break;
    case 'cheer':
      // Hai tay giơ cao, nhảy lên (đang ngồi thì chỉ giơ tay).
      p.armLeftZ = 2.8;
      p.armRightZ = -2.8;
      p.armLeftX = s(t * 9) * 0.2;
      p.armRightX = -s(t * 9) * 0.2;
      if (!seated) {
        const hop = Math.max(0, s(t * 7));
        p.rootY = base.rootY + hop * 0.14;
        p.legLeftX = -hop * 0.3;
        p.legRightX = -hop * 0.3;
      }
      break;
    default:
      break;
  }
  return p;
}
