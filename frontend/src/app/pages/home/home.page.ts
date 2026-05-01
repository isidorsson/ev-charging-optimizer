import { Component, HostListener, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonRange,
  IonButton,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonButtons,
} from "@ionic/angular/standalone";
import {
  LucideSettings,
  LucideBanknote,
  LucideLeaf,
  LucideCircleAlert,
  LucideRefreshCw,
  LucideClock,
  LucideTrendingDown,
} from "@lucide/angular";
import { TranslatePipe } from "@ngx-translate/core";

import { ApiService, type OptimizeRequest } from "../../services/api.service";
import { ScheduleStoreService } from "../../services/schedule-store.service";
import { ForecastService } from "../../services/forecast.service";
import { FormStateService } from "../../services/form-state.service";
import { ToastService } from "../../services/toast.service";
import { DepartureTimePickerComponent } from "../../components/departure-time-picker/departure-time-picker.component";
import { PriceSparklineComponent } from "../../components/price-sparkline/price-sparkline.component";
import { LocalizedTimePipe } from "../../pipes/localized-time.pipe";

interface FormState {
  batteryKwh: number;
  currentSoc: number;
  targetSoc: number;
  maxChargeKw: number;
  departureTime: string;
  carbonWeight: number;
  region: string;
}

function defaultDeparture(): string {
  const d = new Date();
  d.setHours(d.getHours() + 8, 0, 0, 0);
  // datetime-local format: yyyy-MM-ddTHH:mm
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    LocalizedTimePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonLabel,
    IonInput,
    IonRange,
    IonButton,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonButtons,
    LucideSettings,
    LucideBanknote,
    LucideLeaf,
    LucideCircleAlert,
    LucideRefreshCw,
    LucideClock,
    LucideTrendingDown,
    DepartureTimePickerComponent,
    PriceSparklineComponent,
  ],
  templateUrl: "./home.page.html",
  styleUrl: "./home.page.scss",
})
export class HomePage {
  private readonly api = inject(ApiService);
  private readonly store = inject(ScheduleStoreService);
  private readonly forecastSvc = inject(ForecastService);
  private readonly formState = inject(FormStateService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  readonly form = signal<FormState>({
    ...this.formState.state(),
    departureTime: defaultDeparture(),
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly forecastSlots = this.forecastSvc.slots;
  readonly forecastLoading = this.forecastSvc.loading;
  readonly forecastError = this.forecastSvc.error;
  readonly forecastFetchedAt = this.forecastSvc.fetchedAt;

  constructor() {
    // Reactive: re-fetch when region changes.
    effect(() => {
      const region = this.form().region;
      void this.forecastSvc.load(region);
    });

    // Persist non-volatile form fields whenever they change.
    effect(() => {
      const f = this.form();
      this.formState.patch({
        batteryKwh: f.batteryKwh,
        currentSoc: f.currentSoc,
        targetSoc: f.targetSoc,
        maxChargeKw: f.maxChargeKw,
        carbonWeight: f.carbonWeight,
        region: f.region,
      });
    });
  }

  /* Live preview — what we're optimizing for, before submit. */
  readonly preview = computed(() => {
    const f = this.form();
    const deltaPct = Math.max(0, f.targetSoc - f.currentSoc);
    const energyKwh = (deltaPct / 100) * f.batteryKwh;
    const hoursAtMaxRate = f.maxChargeKw > 0 ? energyKwh / f.maxChargeKw : 0;
    const departureMs = new Date(f.departureTime).getTime();
    const windowHours = Math.max(0, (departureMs - Date.now()) / 3_600_000);
    const feasible = hoursAtMaxRate <= windowHours;
    return {
      energyKwh,
      hoursAtMaxRate,
      windowHours,
      feasible,
    };
  });

  readonly departureLabelKey = computed(() => {
    const ms = new Date(this.form().departureTime).getTime();
    if (Number.isNaN(ms)) return "home.eta.dash";
    const diffH = (ms - Date.now()) / 3_600_000;
    if (diffH < 0) return "home.eta.past";
    if (diffH < 1) return "home.eta.lessThanHour";
    if (diffH < 24) return "home.eta.hours";
    return "home.eta.days";
  });

  readonly departureCount = computed(() => {
    const ms = new Date(this.form().departureTime).getTime();
    if (Number.isNaN(ms)) return 0;
    const diffH = (ms - Date.now()) / 3_600_000;
    if (diffH < 24) return Math.round(diffH);
    return Math.round(diffH / 24);
  });

  /** Live, deterministic preview of the optimization, computed client-side
   *  from the cached forecast. Mirrors backend scoring. */
  readonly liveEstimate = computed(() => {
    const slots = this.forecastSlots();
    const f = this.form();
    if (slots.length === 0) return null;

    const energyKwh = Math.max(0, ((f.targetSoc - f.currentSoc) / 100) * f.batteryKwh);
    if (energyKwh <= 0 || f.maxChargeKw <= 0) return null;

    const hoursNeededFloat = energyKwh / f.maxChargeKw;
    const fullHours = Math.floor(hoursNeededFloat);
    const partialEnergy = (hoursNeededFloat - fullHours) * f.maxChargeKw;

    const prices = slots.map((s) => s.pricePerKwh);
    const carbons = slots.map((s) => s.intensityGCo2PerKwh);
    const norm = (v: number, lo: number, hi: number) =>
      hi === lo ? 0 : (v - lo) / (hi - lo);
    const pMin = Math.min(...prices);
    const pMax = Math.max(...prices);
    const cMin = Math.min(...carbons);
    const cMax = Math.max(...carbons);

    const ranked = slots
      .map((slot, i) => ({
        i,
        slot,
        score:
          (1 - f.carbonWeight) * norm(slot.pricePerKwh, pMin, pMax) +
          f.carbonWeight * norm(slot.intensityGCo2PerKwh, cMin, cMax),
      }))
      .sort((a, b) => a.score - b.score);

    let totalCost = 0;
    let totalCarbon = 0;
    const chosen: { idx: number; slot: typeof slots[number]; energy: number }[] = [];
    for (let i = 0; i < Math.min(fullHours, ranked.length); i++) {
      const e = f.maxChargeKw;
      totalCost += ranked[i].slot.pricePerKwh * e;
      totalCarbon += ranked[i].slot.intensityGCo2PerKwh * e;
      chosen.push({ idx: ranked[i].i, slot: ranked[i].slot, energy: e });
    }
    if (partialEnergy > 0.001 && ranked[fullHours]) {
      totalCost += ranked[fullHours].slot.pricePerKwh * partialEnergy;
      totalCarbon += ranked[fullHours].slot.intensityGCo2PerKwh * partialEnergy;
      chosen.push({
        idx: ranked[fullHours].i,
        slot: ranked[fullHours].slot,
        energy: partialEnergy,
      });
    }

    // Naive: charge starting from the soonest slot now.
    let remaining = energyKwh;
    let naiveCost = 0;
    for (const s of slots) {
      if (remaining <= 0) break;
      const take = Math.min(f.maxChargeKw, remaining);
      naiveCost += s.pricePerKwh * take;
      remaining -= take;
    }
    const savingsPct = naiveCost > 0 ? Math.max(0, (naiveCost - totalCost) / naiveCost) : 0;

    chosen.sort((a, b) => a.idx - b.idx);
    const cheapestStart = chosen[0]?.slot.startsAt ?? null;
    const cheapestEnd = chosen[chosen.length - 1]?.slot.endsAt ?? null;
    const avgPrice = energyKwh > 0 ? totalCost / energyKwh : 0;
    const currency = slots[0]?.currency ?? "SEK";
    const hoursCount = Math.ceil(hoursNeededFloat);

    return {
      totalCost,
      totalCarbon,
      naiveCost,
      savingsPct,
      cheapestStart,
      cheapestEnd,
      avgPrice,
      currency,
      hoursCount,
    };
  });

  /** How many bars to highlight in the sparkline. */
  readonly highlightHours = computed(() => {
    const f = this.form();
    const energyKwh = Math.max(0, ((f.targetSoc - f.currentSoc) / 100) * f.batteryKwh);
    if (energyKwh <= 0 || f.maxChargeKw <= 0) return 0;
    return Math.ceil(energyKwh / f.maxChargeKw);
  });

  readonly weightLabelKey = computed(() => {
    const w = this.form().carbonWeight;
    if (w < 0.2) return "home.weight.costFirst";
    if (w < 0.45) return "home.weight.mostlyCost";
    if (w < 0.55) return "home.weight.balanced";
    if (w < 0.8) return "home.weight.mostlyClean";
    return "home.weight.greenest";
  });

  patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  goToSettings(): void {
    this.router.navigate(["/settings"]);
  }

  refreshForecast(): void {
    void this.forecastSvc.load(this.form().region, true);
    this.toasts.info("Forecast refreshed");
  }

  @HostListener("document:keydown", ["$event"])
  handleKey(ev: KeyboardEvent): void {
    // Skip when user is typing in an input.
    const target = ev.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    if (ev.key === "r" || ev.key === "R") {
      ev.preventDefault();
      this.refreshForecast();
    } else if (ev.key === "Enter" && !this.loading()) {
      ev.preventDefault();
      void this.submit();
    }
  }

  async submit(): Promise<void> {
    this.error.set(null);
    const f = this.form();
    if (f.targetSoc <= f.currentSoc) {
      this.error.set("home.errors.targetBelowCurrent");
      return;
    }
    if (new Date(f.departureTime).getTime() <= Date.now()) {
      this.error.set("home.errors.departurePast");
      return;
    }
    const request: OptimizeRequest = {
      batteryKwh: f.batteryKwh,
      currentSoc: f.currentSoc,
      targetSoc: f.targetSoc,
      maxChargeKw: f.maxChargeKw,
      departureTime: new Date(f.departureTime).toISOString(),
      carbonWeight: f.carbonWeight,
      region: f.region,
    };
    this.loading.set(true);
    try {
      const result = await this.api.optimize(request);
      this.store.set(result, request);
      this.router.navigate(["/schedule"]);
    } catch (err) {
      console.error(err);
      this.error.set("home.errors.optimizeFailed");
      this.toasts.error("Could not compute schedule. Try again.");
    } finally {
      this.loading.set(false);
    }
  }
}
