export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
/** 'auto' = bắt đầu theo thiết bị và tự hạ mức khi fps thấp kéo dài. */
export type QualityMode = 'auto' | QualityLevel;
export const QUALITY_MODES: readonly QualityMode[] = ['auto', ...QUALITY_LEVELS];

export interface QualityPreset {
  /** Giới hạn devicePixelRatio (độ phân giải vẽ). */
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Số hạt bụi lơ lửng trong phòng (hiệu ứng trang trí). */
  particles: number;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: { pixelRatioCap: 1, shadows: false, shadowMapSize: 512, particles: 0 },
  medium: { pixelRatioCap: 1.5, shadows: true, shadowMapSize: 1024, particles: 40 },
  high: { pixelRatioCap: 2, shadows: true, shadowMapSize: 2048, particles: 120 },
};

export function isQualityMode(value: unknown): value is QualityMode {
  return typeof value === 'string' && (QUALITY_MODES as readonly string[]).includes(value);
}

export function lowerQuality(level: QualityLevel): QualityLevel | null {
  const index = QUALITY_LEVELS.indexOf(level);
  return index > 0 ? (QUALITY_LEVELS[index - 1] ?? null) : null;
}

/** Mức khởi đầu cho chế độ tự động: màn cảm ứng (thường là điện thoại) bắt đầu ở mức vừa. */
export function initialAutoLevel(coarsePointer: boolean): QualityLevel {
  return coarsePointer ? 'medium' : 'high';
}

// ---------------------------------------------------------------------------
// Tự hạ chất lượng khi fps thấp kéo dài
// ---------------------------------------------------------------------------

export const GOVERNOR_SETTINGS = {
  /** Mục tiêu tối thiểu theo AGENTS.md: 30 fps. */
  minFps: 30,
  /** fps phải thấp liên tục chừng này giây mới hạ mức. */
  sustainSeconds: 4,
  /** Sau khi đổi mức, chờ chừng này giây cho ổn định rồi mới đo tiếp. */
  graceSeconds: 3,
  /** Khung hình dài hơn mức này là giật đơn lẻ (tải shader, chuyển tab): bỏ qua. */
  maxFrameSeconds: 0.5,
  /** Hệ số làm mượt trung bình thời gian khung hình. */
  smoothing: 0.1,
};

export type GovernorSettings = typeof GOVERNOR_SETTINGS;

export interface GovernorState {
  avgFrameSeconds: number | null;
  lowForSeconds: number;
  graceSeconds: number;
}

export function createGovernorState(settings: GovernorSettings = GOVERNOR_SETTINGS): GovernorState {
  return { avgFrameSeconds: null, lowForSeconds: 0, graceSeconds: settings.graceSeconds };
}

export function updateGovernor(
  state: GovernorState,
  frameSeconds: number,
  settings: GovernorSettings = GOVERNOR_SETTINGS,
): { state: GovernorState; downgrade: boolean } {
  if (frameSeconds <= 0 || frameSeconds > settings.maxFrameSeconds) {
    return { state, downgrade: false };
  }
  const avg =
    state.avgFrameSeconds === null
      ? frameSeconds
      : state.avgFrameSeconds + (frameSeconds - state.avgFrameSeconds) * settings.smoothing;

  if (state.graceSeconds > 0) {
    return {
      state: {
        avgFrameSeconds: avg,
        lowForSeconds: 0,
        graceSeconds: Math.max(0, state.graceSeconds - frameSeconds),
      },
      downgrade: false,
    };
  }

  const lowForSeconds = 1 / avg < settings.minFps ? state.lowForSeconds + frameSeconds : 0;
  if (lowForSeconds >= settings.sustainSeconds) {
    return { state: createGovernorState(settings), downgrade: true };
  }
  return { state: { avgFrameSeconds: avg, lowForSeconds, graceSeconds: 0 }, downgrade: false };
}
