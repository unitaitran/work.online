/** Bước mô phỏng cố định: 60 lần mỗi giây dù màn hình chạy 30, 60 hay 144 fps. */
export const FIXED_STEP = 1 / 60;
/** Tối đa số bước mô phỏng trong một khung hình, tránh "vòng xoáy chết" khi máy quá chậm. */
export const MAX_STEPS_PER_FRAME = 5;
/** Khung hình dài hơn mức này (giật, chuyển tab) bị cắt bớt. */
export const MAX_FRAME_SECONDS = 0.25;

export interface StepResult {
  steps: number;
  accumulator: number;
  /** Phần lẻ còn lại (0..1) để nội suy hình ảnh giữa hai bước. */
  alpha: number;
}

export function advanceFixedStep(
  accumulator: number,
  frameSeconds: number,
  step = FIXED_STEP,
  maxSteps = MAX_STEPS_PER_FRAME,
): StepResult {
  let acc = accumulator + Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
  let steps = 0;
  while (acc >= step && steps < maxSteps) {
    acc -= step;
    steps += 1;
  }
  // Máy không theo kịp: bỏ phần nợ thay vì dồn sang khung sau.
  if (acc >= step) acc %= step;
  return { steps, accumulator: acc, alpha: acc / step };
}
