import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonChip,
  IonLabel,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  notificationsOutline,
  arrowBackOutline,
  flashOutline,
  leafOutline,
  cashOutline,
  trendingDownOutline,
} from "ionicons/icons";
import { TranslatePipe } from "@ngx-translate/core";

import { ScheduleStoreService } from "../../services/schedule-store.service";
import { NotificationsService } from "../../services/notifications.service";
import type { ScheduleSlot } from "../../services/api.service";
import { LocalizedTimePipe } from "../../pipes/localized-time.pipe";

interface BarSlot extends ScheduleSlot {
  priceRel: number;
  carbonRel: number;
}

@Component({
  selector: "app-schedule",
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe,
    LocalizedTimePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonChip,
    IonLabel,
  ],
  templateUrl: "./schedule.page.html",
  styleUrl: "./schedule.page.scss",
})
export class SchedulePage {
  private readonly store = inject(ScheduleStoreService);
  private readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  readonly result = this.store.latest;
  readonly notifyState = signal<"idle" | "ok" | "denied" | "unsupported" | "error">("idle");
  readonly hoveredIndex = signal<number | null>(null);

  readonly bars = computed<BarSlot[]>(() => {
    const r = this.result();
    if (!r) return [];
    const prices = r.schedule.map((s) => s.pricePerKwh);
    const carbons = r.schedule.map((s) => s.intensityGCo2PerKwh);
    const pMin = Math.min(...prices);
    const pMax = Math.max(...prices);
    const cMin = Math.min(...carbons);
    const cMax = Math.max(...carbons);
    const norm = (v: number, lo: number, hi: number) =>
      hi === lo ? 0.5 : (v - lo) / (hi - lo);
    return r.schedule.map((s) => ({
      ...s,
      priceRel: norm(s.pricePerKwh, pMin, pMax),
      carbonRel: norm(s.intensityGCo2PerKwh, cMin, cMax),
    }));
  });

  constructor() {
    addIcons({
      notificationsOutline,
      arrowBackOutline,
      flashOutline,
      leafOutline,
      cashOutline,
      trendingDownOutline,
    });
  }

  goBack(): void {
    this.router.navigate(["/"]);
  }

  async enableAlert(): Promise<void> {
    const r = this.result();
    if (!r?.summary.cheapestWindowStart) return;
    this.notifyState.set("idle");
    try {
      const out = await this.notifications.scheduleWindowAlert({
        fireAt: r.summary.cheapestWindowStart,
        title: "⚡ Cheap charging window started",
        body: "Plug in now — your optimal slot just began.",
      });
      if (out.ok) this.notifyState.set("ok");
      else if (out.reason === "denied") this.notifyState.set("denied");
      else if (out.reason === "unsupported")
        this.notifyState.set("unsupported");
      else this.notifyState.set("error");
    } catch {
      this.notifyState.set("error");
    }
  }
}
