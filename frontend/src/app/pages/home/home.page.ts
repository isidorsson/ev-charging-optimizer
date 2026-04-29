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
  IonIcon,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  flashOutline,
  leafOutline,
  cashOutline,
  timeOutline,
  alertCircleOutline,
} from "ionicons/icons";

import { ApiService, type OptimizeRequest } from "../../services/api.service";
import { ScheduleStoreService } from "../../services/schedule-store.service";

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
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonLabel,
    IonInput,
    IonRange,
    IonButton,
    IonIcon,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonSpinner,
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

  readonly departureLabel = computed(() => {
    const ms = new Date(this.form().departureTime).getTime();
    if (Number.isNaN(ms)) return "—";
    const diffH = (ms - Date.now()) / 3_600_000;
    if (diffH < 0) return "in the past";
    if (diffH < 1) return "in under an hour";
    if (diffH < 24) return `in ~${Math.round(diffH)} h`;
    return `in ~${Math.round(diffH / 24)} d`;
  });

  constructor() {
    addIcons({
      flashOutline,
      leafOutline,
      cashOutline,
      timeOutline,
      alertCircleOutline,
    });
  }

  patch<K extends keyof FormState>(key: K, value: FormState[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  weightLabel(): string {
    const w = this.form().carbonWeight;
    if (w < 0.2) return "Cost first";
    if (w < 0.45) return "Mostly cost, lean clean";
    if (w < 0.55) return "Balanced";
    if (w < 0.8) return "Mostly clean, lean cost";
    return "Greenest hours only";
  }

  async submit(): Promise<void> {
    this.error.set(null);
    const f = this.form();
    if (f.targetSoc <= f.currentSoc) {
      this.error.set("Target charge must be above current charge.");
      return;
    }
    if (new Date(f.departureTime).getTime() <= Date.now()) {
      this.error.set("Departure must be in the future.");
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
      this.error.set("Could not compute schedule. Please try again.");
    } finally {
      this.loading.set(false);
    }
  }
}
