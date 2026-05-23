type CacheValue<T> = { value: T; expiresAt: number };

/**
 * Small in-memory TTL cache for short-lived auth checks.
 * Per-service local cache (not shared across instances).
 */
export class MemoryCache {
  private store = new Map<string, CacheValue<unknown>>();

  set<T>(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  del(key: string) {
    this.store.delete(key);
  }
}

export const cache = new MemoryCache();
