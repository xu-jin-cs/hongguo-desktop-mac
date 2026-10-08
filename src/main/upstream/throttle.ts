/**
 * 令牌桶节流器（PRD §10 合规自限 A07-E13）：任意两次上游请求发起间隔 >= minIntervalMs。
 * 串行化通过 Promise 链保证；并发调用排队依次放行。
 * sleep/now 可注入，便于单测断言节流间隔。
 */
export class Throttler {
  private last = Number.NEGATIVE_INFINITY;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number = 300,
    private readonly sleepFn: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
    private readonly nowFn: () => number = () => Date.now(),
  ) {}

  /** 获取一个令牌；返回的 Promise 在允许发起请求时 resolve。 */
  acquire(): Promise<void> {
    const task = this.chain.then(async () => {
      const elapsed = this.nowFn() - this.last;
      const wait = this.minIntervalMs - elapsed;
      if (wait > 0) await this.sleepFn(wait);
      this.last = this.nowFn();
    });
    // 链上吞错，保证后续令牌不被前序异常卡死
    this.chain = task.catch(() => undefined);
    return task;
  }
}
