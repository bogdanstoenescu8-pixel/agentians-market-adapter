interface Entry<T> {
  value: T;
  expires: number;
}

/**
 * Minimal in-memory TTL cache.
 *
 * A ttl of <= 0 disables caching entirely (every get misses), which is handy
 * for tests and for callers that want always-fresh data.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    if (this.ttlMs <= 0) return undefined;
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expires) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.ttlMs <= 0) return;
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}
