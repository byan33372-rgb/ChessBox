/**
 * 三国杀·自由混战 —— 确定性随机（mulberry32）。
 * 生产由房间层注入 crypto 级种子；测试注入固定种子保证可复现。
 * 状态（seed/counter）随对局序列化，恢复后继续，不重洗牌堆。
 */
export class SgRng {
  seed: number;
  counter: number;

  constructor(seed: number, counter = 0) {
    this.seed = seed >>> 0;
    this.counter = counter >>> 0;
  }

  /** [0,1) */
  next(): number {
    let t = (this.seed + 0x6d2b79f5 * ++this.counter) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }
}
