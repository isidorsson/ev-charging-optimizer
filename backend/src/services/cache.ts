/**
 * Tiny TTL cache with single-flight: if a fetch is already in flight for the
 * same key, callers await the same promise instead of triggering a stampede.
 * Negative-cache opt-in via `negativeTtlMs` so upstream errors don't get
 * hammered.
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

interface Options {
  ttlMs: number;
  negativeTtlMs?: number;
  maxEntries?: number;
}

export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly errors = new Map<string, { error: unknown; expiresAt: number }>();

  constructor(private readonly opts: Options) {}

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();

    const cached = this.store.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const errEntry = this.errors.get(key);
    if (errEntry && errEntry.expiresAt > now) throw errEntry.error;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = loader()
      .then((value) => {
        this.set(key, value);
        this.errors.delete(key);
        return value;
      })
      .catch((err) => {
        if (this.opts.negativeTtlMs) {
          this.errors.set(key, {
            error: err,
            expiresAt: Date.now() + this.opts.negativeTtlMs,
          });
        }
        throw err;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }

  set(key: string, value: T): void {
    if (this.opts.maxEntries && this.store.size >= this.opts.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.opts.ttlMs,
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
    this.errors.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
    this.errors.clear();
  }

  stats(): { size: number; inflight: number; errors: number } {
    return {
      size: this.store.size,
      inflight: this.inflight.size,
      errors: this.errors.size,
    };
  }
}
