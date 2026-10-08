/**
 * 元数据内存缓存（PRD §10：首页/详情元数据 TTL 10min）。
 * 只存纯 JSON 可序列化结构（不存任何带生命周期的对象）。
 * now 可注入便于单测。
 */
export class TtlCache {
  private readonly map = new Map<string, { expireAt: number; value: unknown }>();

  constructor(
    private readonly ttlMs: number = 10 * 60 * 1000,
    private readonly nowFn: () => number = () => Date.now(),
  ) {}

  get<T>(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expireAt <= this.nowFn()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set(key: string, value: unknown): void {
    this.map.set(key, { expireAt: this.nowFn() + this.ttlMs, value });
  }

  clear(): void {
    this.map.clear();
  }
}
