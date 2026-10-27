/** 简单令牌桶限流（按 key，如 socketId / IP） */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();

  constructor(
    private capacity: number,
    private refillPerSec: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, last: now };
      this.buckets.set(key, b);
    }
    const elapsed = (now - b.last) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSec);
    b.last = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }

  /** 丢弃两分钟未活动的桶，防内存膨胀 */
  cleanup(): void {
    const now = Date.now();
    for (const [key, b] of this.buckets) {
      if (now - b.last > 120_000) this.buckets.delete(key);
    }
  }
}
