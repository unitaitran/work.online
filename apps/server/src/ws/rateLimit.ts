export interface TokenBucketOptions {
  /** Số tin tối đa gửi dồn một lúc. */
  capacity: number;
  /** Số tin được hồi lại mỗi giây. */
  refillPerSecond: number;
}

export interface TokenBucket {
  /** Trả về true nếu còn lượt (và trừ một lượt), false nếu đang bị giới hạn. */
  tryConsume(): boolean;
}

/** Giới hạn tần suất kiểu "xô token": cho gửi dồn tối đa `capacity`, hồi dần theo thời gian. */
export function createTokenBucket(options: TokenBucketOptions, now: () => number): TokenBucket {
  const { capacity, refillPerSecond } = options;
  let tokens = capacity;
  let lastRefill = now();

  return {
    tryConsume() {
      const current = now();
      const elapsedSeconds = Math.max(0, current - lastRefill) / 1000;
      tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
      lastRefill = current;
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      return false;
    },
  };
}
