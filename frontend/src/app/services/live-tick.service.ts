import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";

export interface LiveTick {
  type: "tick";
  ts: string;
  region: string;
  pricePerKwh: number;
  currency: string;
  intensityGCo2PerKwh: number;
  carbonIndex: "very low" | "low" | "moderate" | "high" | "very high";
  nextHourPricePerKwh: number | null;
  nextHourIntensity: number | null;
}

export type LiveStatus = "idle" | "connecting" | "open" | "closed" | "error";

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;
const STALE_AFTER_MS = 20_000;

@Injectable({ providedIn: "root" })
export class LiveTickService {
  private readonly destroyRef = inject(DestroyRef);

  readonly tick = signal<LiveTick | null>(null);
  readonly status = signal<LiveStatus>("idle");
  readonly lastError = signal<string | null>(null);

  readonly isStale = computed(() => {
    const t = this.tick();
    if (!t) return false;
    return Date.now() - new Date(t.ts).getTime() > STALE_AFTER_MS;
  });

  readonly priceTrend = computed<"up" | "down" | "flat" | null>(() => {
    const t = this.tick();
    if (!t || t.nextHourPricePerKwh == null) return null;
    const delta = t.nextHourPricePerKwh - t.pricePerKwh;
    if (Math.abs(delta) < 0.005) return "flat";
    return delta > 0 ? "up" : "down";
  });

  private socket: WebSocket | null = null;
  private region = "SE3";
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.disconnect());

    if (typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState === "visible" && !this.isOpen()) {
          this.retries = 0;
          this.openSocket();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      this.destroyRef.onDestroy(() =>
        document.removeEventListener("visibilitychange", onVisibility),
      );
    }
  }

  connect(region: string): void {
    this.manuallyClosed = false;
    this.region = region;
    if (this.socket && this.isOpen()) {
      this.socket.send(JSON.stringify({ type: "subscribe", region }));
      return;
    }
    this.openSocket();
  }

  setRegion(region: string): void {
    if (region === this.region) return;
    this.region = region;
    if (this.isOpen() && this.socket) {
      this.socket.send(JSON.stringify({ type: "subscribe", region }));
    } else {
      this.openSocket();
    }
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close(1000, "client disconnect");
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.status.set("idle");
  }

  private isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private buildUrl(): string {
    const proto =
      typeof location !== "undefined" && location.protocol === "https:"
        ? "wss:"
        : "ws:";
    const host = typeof location !== "undefined" ? location.host : "localhost:3000";
    return `${proto}//${host}/api/live?region=${encodeURIComponent(this.region)}`;
  }

  private openSocket(): void {
    if (typeof WebSocket === "undefined") return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.status.set("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.buildUrl());
    } catch (err) {
      this.lastError.set(String(err));
      this.status.set("error");
      this.scheduleReconnect();
      return;
    }
    this.socket = ws;

    ws.addEventListener("open", () => {
      this.retries = 0;
      this.status.set("open");
      this.lastError.set(null);
    });

    ws.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(ev.data) as LiveTick;
        if (data?.type === "tick") this.tick.set(data);
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener("error", () => {
      this.status.set("error");
      this.lastError.set("websocket error");
    });

    ws.addEventListener("close", (ev) => {
      this.socket = null;
      this.status.set("closed");
      if (this.manuallyClosed) return;
      if (ev.code === 1008 || ev.code === 4403) {
        this.lastError.set("forbidden — origin not allowed");
        return;
      }
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed) return;
    const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** this.retries);
    const jitter = Math.random() * 0.3 * exp;
    const delay = exp + jitter;
    this.retries += 1;
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }
}
