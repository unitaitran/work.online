import { describe, expect, it } from 'vitest';
import { applyDrag, applyZoom, CAMERA_LIMITS, SEATED_CAMERA_LIMITS } from './cameraMath';
import { advanceFixedStep, FIXED_STEP, MAX_STEPS_PER_FRAME } from './loop';
import { dampAngle, wrapAngle } from './mathUtils';
import {
  createGovernorState,
  GOVERNOR_SETTINGS,
  isQualityMode,
  lowerQuality,
  updateGovernor,
  type GovernorState,
} from './quality';

describe('advanceFixedStep', () => {
  it('60 fps: đúng một bước mỗi khung', () => {
    const r = advanceFixedStep(0, FIXED_STEP);
    expect(r.steps).toBe(1);
    expect(r.accumulator).toBeCloseTo(0);
  });

  it('30 fps: hai bước mỗi khung', () => {
    expect(advanceFixedStep(0, 1 / 30).steps).toBe(2);
  });

  it('144 fps: dồn phần lẻ, alpha tăng dần', () => {
    const r = advanceFixedStep(0, 1 / 144);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(60 / 144);
  });

  it('khung hình rất dài: giới hạn số bước và bỏ phần nợ', () => {
    const r = advanceFixedStep(0, 5);
    expect(r.steps).toBe(MAX_STEPS_PER_FRAME);
    expect(r.accumulator).toBeLessThan(FIXED_STEP);
  });

  it('thời gian âm (đồng hồ nhảy lùi) không làm hỏng', () => {
    expect(advanceFixedStep(0, -1)).toEqual({ steps: 0, accumulator: 0, alpha: 0 });
  });
});

describe('camera', () => {
  it('kẹp góc ngẩng và khoảng cách', () => {
    const start = { yaw: 0, pitch: 0.7, distance: 6 };
    expect(applyDrag(start, 0, 10_000).pitch).toBe(CAMERA_LIMITS.maxPitch);
    expect(applyDrag(start, 0, -10_000).pitch).toBe(CAMERA_LIMITS.minPitch);
    expect(applyZoom(start, 100).distance).toBe(CAMERA_LIMITS.maxDistance);
    expect(applyZoom(start, 0.01).distance).toBe(CAMERA_LIMITS.minDistance);
  });

  it('khi ngồi: lại gần và lùi xa được hơn lúc đi lại', () => {
    const seated = { yaw: 0, pitch: 0.8, distance: 2.3 };
    expect(applyZoom(seated, 0.01, SEATED_CAMERA_LIMITS).distance).toBe(
      SEATED_CAMERA_LIMITS.minDistance,
    );
    expect(applyZoom(seated, 100, SEATED_CAMERA_LIMITS).distance).toBe(
      SEATED_CAMERA_LIMITS.maxDistance,
    );
    expect(SEATED_CAMERA_LIMITS.minDistance).toBeLessThan(CAMERA_LIMITS.minDistance);
    expect(SEATED_CAMERA_LIMITS.maxDistance).toBeGreaterThan(CAMERA_LIMITS.maxDistance);
    // Kéo nhẹ khi ngồi không làm camera bật ra xa (giữ nguyên khoảng cách gần).
    expect(applyDrag(seated, 30, 0, SEATED_CAMERA_LIMITS).distance).toBe(2.3);
  });

  it('bỏ qua hệ số zoom không hợp lệ', () => {
    const start = { yaw: 0, pitch: 0.7, distance: 6 };
    expect(applyZoom(start, Number.NaN)).toBe(start);
    expect(applyZoom(start, 0)).toBe(start);
  });

  it('kéo ngang chỉ đổi yaw', () => {
    const r = applyDrag({ yaw: 0, pitch: 0.7, distance: 6 }, 100, 0);
    expect(r.yaw).toBeLessThan(0);
    expect(r.pitch).toBe(0.7);
  });
});

describe('góc', () => {
  it('wrapAngle về (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  it('dampAngle quay theo đường ngắn nhất qua ±π', () => {
    const next = dampAngle(3, -3, 10, 0.016);
    // Từ 3 rad tới -3 rad: đi qua π (tăng) chứ không lùi qua 0.
    expect(Math.abs(next)).toBeGreaterThan(3);
  });
});

describe('chất lượng', () => {
  it('hạ mức lần lượt cao → vừa → thấp → hết', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBeNull();
  });

  it('isQualityMode', () => {
    expect(isQualityMode('auto')).toBe(true);
    expect(isQualityMode('ultra')).toBe(false);
    expect(isQualityMode(3)).toBe(false);
  });

  function run(state: GovernorState, fps: number, seconds: number) {
    let s = state;
    let downgrades = 0;
    for (let t = 0; t < seconds; t += 1 / fps) {
      const r = updateGovernor(s, 1 / fps);
      s = r.state;
      if (r.downgrade) downgrades += 1;
    }
    return { state: s, downgrades };
  }

  it('fps ổn định thì không hạ mức', () => {
    expect(run(createGovernorState(), 60, 30).downgrades).toBe(0);
  });

  it('fps thấp kéo dài thì hạ mức một lần, rồi chờ ổn định', () => {
    const seconds = GOVERNOR_SETTINGS.graceSeconds + GOVERNOR_SETTINGS.sustainSeconds + 1;
    expect(run(createGovernorState(), 20, seconds).downgrades).toBe(1);
  });

  it('một lần giật đơn lẻ không làm hạ mức', () => {
    let { state } = run(createGovernorState(), 60, 5);
    for (let i = 0; i < 3; i += 1) state = updateGovernor(state, 2).state;
    expect(run(state, 60, 10).downgrades).toBe(0);
  });

  it('fps thấp ngắn (dưới ngưỡng thời gian) không hạ mức', () => {
    const warm = run(createGovernorState(), 60, GOVERNOR_SETTINGS.graceSeconds + 1).state;
    const dip = run(warm, 20, GOVERNOR_SETTINGS.sustainSeconds / 2);
    expect(dip.downgrades).toBe(0);
    expect(run(dip.state, 60, 10).downgrades).toBe(0);
  });
});

describe('chế độ máy yếu', () => {
  it('phát hiện theo số nhân, RAM, tiết kiệm dữ liệu', async () => {
    const { detectLowPower, initialAutoLevel } = await import('./quality');
    expect(detectLowPower({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(detectLowPower({ hardwareConcurrency: 4 })).toBe(true);
    expect(detectLowPower({ deviceMemory: 2 })).toBe(true);
    expect(detectLowPower({ saveData: true })).toBe(true);
    expect(detectLowPower({})).toBe(false);
    expect(initialAutoLevel(false, true)).toBe('low');
    expect(initialAutoLevel(true)).toBe('medium');
    expect(initialAutoLevel(false)).toBe('high');
  });
});
