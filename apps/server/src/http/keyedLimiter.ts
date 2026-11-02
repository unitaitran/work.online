// Giới hạn tần suất theo khoá (IP, tài khoản): mỗi khoá một "xô token".
// Khoá lâu không dùng được dọn để bộ nhớ không phình.
export interface KeyedLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  /** Số khoá tối đa giữ trong bộ nhớ trước khi dọn. */
  maxKeys?: number;
}

export class KeyedLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly options: KeyedLimiterOptions,
    private readonly now: () => number = Date.now,
  ) {}

  /** Trừ `cost` lượt cho khoá; false nếu đã hết lượt. */
  consume(key: string, cost = 1): boolean {
    const now = this.now();
    const { capacity, refillPerSecond } = this.options;
    const bucket = this.buckets.get(key) ?? { tokens: capacity, at: now };
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + (Math.max(0, now - bucket.at) / 1000) * refillPerSecond,
    );
    bucket.at = now;
    const ok = bucket.tokens >= cost;
    if (ok) bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    if (this.buckets.size > (this.options.maxKeys ?? 50_000)) this.prune(now);
    return ok;
  }

  /** Bỏ các xô đã đầy lại (không còn cần nhớ). */
  private prune(now: number): void {
    const { capacity, refillPerSecond } = this.options;
    const fullAfterMs = (capacity / refillPerSecond) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.at >= fullAfterMs) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}
