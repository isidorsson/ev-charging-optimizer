import { Injectable, inject } from "@angular/core";
import { ApiService } from "./api.service";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

@Injectable({ providedIn: "root" })
export class NotificationsService {
  private readonly api = inject(ApiService);

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }

  async scheduleWindowAlert(args: {
    fireAt: string;
    title: string;
    body: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isSupported()) return { ok: false, reason: "unsupported" };

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    let key: string;
    try {
      key = (await this.api.getPushKey()).publicKey;
    } catch {
      return { ok: false, reason: "vapid_unavailable" };
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }

    await this.api.schedulePush({
      subscription: sub.toJSON(),
      fireAt: args.fireAt,
      title: args.title,
      body: args.body,
    });
    return { ok: true };
  }
}
