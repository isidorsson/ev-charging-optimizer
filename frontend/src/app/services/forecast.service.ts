import { Injectable, computed, inject, signal } from "@angular/core";
import { ApiService, type ForecastSlot } from "./api.service";
import { ToastService } from "./toast.service";

interface CacheEntry {
  region: string;
  fetchedAt: number;
  slots: ForecastSlot[];
}

const TTL_MS = 10 * 60 * 1000;

@Injectable({ providedIn: "root" })
export class ForecastService {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  private readonly cache = new Map<string, CacheEntry>();
  private readonly entry = signal<CacheEntry | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly slots = computed<ForecastSlot[]>(() => this.entry()?.slots ?? []);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly fetchedAt = computed<number | null>(() => this.entry()?.fetchedAt ?? null);

  readonly isStale = computed(() => {
    const e = this.entry();
    if (!e) return true;
    return Date.now() - e.fetchedAt > TTL_MS;
  });

  async load(region: string, force = false): Promise<void> {
    const cached = this.cache.get(region);
    const fresh = cached && Date.now() - cached.fetchedAt < TTL_MS;

    if (cached) this.entry.set(cached);
    if (fresh && !force) return;

    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const res = await this.api.getForecast(region, 24);
      const next: CacheEntry = {
        region,
        fetchedAt: Date.now(),
        slots: res.forecast,
      };
      this.cache.set(region, next);
      this.entry.set(next);
    } catch (err) {
      console.error("forecast load failed", err);
      this.errorState.set("forecast.load_failed");
      // Surface only on first failure (no cached fallback to fall back to).
      if (!cached) {
        this.toasts.warn("Live forecast unavailable. Using mock data.");
      }
    } finally {
      this.loadingState.set(false);
    }
  }
}
