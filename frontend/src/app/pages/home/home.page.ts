import { Component, computed, inject, signal } from "@angular/core";
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
} from "@lucide/angular";
import { TranslatePipe } from "@ngx-translate/core";

import { ApiService, type OptimizeRequest } from "../../services/api.service";
import { ScheduleStoreService } from "../../services/schedule-store.service";
import { DepartureTimePickerComponent } from "../../components/departure-time-picker/departure-time-picker.component";

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
    DepartureTimePickerComponent,
  ],
  templateUrl: "./home.page.html",
  styleUrl: "./home.page.scss",
})
export class HomePage {
  private readonly api = inject(ApiService);
  private readonly store = inject(ScheduleStoreService);
  private readonly router = inject(Router);

  readonly form = signal<FormState>({
    batteryKwh: 75,
    currentSoc: 30,
    targetSoc: 80,
    maxChargeKw: 11,
    departureTime: defaultDeparture(),
    carbonWeight: 0.3,
    region: "SE3",
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

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
    } finally {
      this.loading.set(false);
    }
  }
}
