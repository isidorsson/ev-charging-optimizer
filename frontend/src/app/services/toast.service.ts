import { Injectable, signal } from "@angular/core";

export type ToastTone = "info" | "success" | "warn" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  ttlMs: number;
  createdAt: number;
}

@Injectable({ providedIn: "root" })
export class ToastService {
  private nextId = 1;
  readonly items = signal<Toast[]>([]);

  show(message: string, tone: ToastTone = "info", ttlMs = 4000): number {
    const id = this.nextId++;
    const toast: Toast = { id, tone, message, ttlMs, createdAt: Date.now() };
    this.items.update((xs) => [...xs, toast]);
    if (ttlMs > 0) {
      setTimeout(() => this.dismiss(id), ttlMs);
    }
    return id;
  }

  info(msg: string, ttlMs?: number) {
    return this.show(msg, "info", ttlMs);
  }
  success(msg: string, ttlMs?: number) {
    return this.show(msg, "success", ttlMs);
  }
  warn(msg: string, ttlMs?: number) {
    return this.show(msg, "warn", ttlMs);
  }
  error(msg: string, ttlMs?: number) {
    return this.show(msg, "error", ttlMs ?? 6000);
  }

  dismiss(id: number): void {
    this.items.update((xs) => xs.filter((t) => t.id !== id));
  }

  clear(): void {
    this.items.set([]);
  }
}
