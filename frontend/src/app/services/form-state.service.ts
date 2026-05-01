import { Injectable, effect, signal } from "@angular/core";

export interface PersistedFormState {
  batteryKwh: number;
  currentSoc: number;
  targetSoc: number;
  maxChargeKw: number;
  carbonWeight: number;
  region: string;
  // departureTime intentionally NOT persisted — yesterday's value is meaningless.
}

const STORAGE_KEY = "evopt.form.v1";

const DEFAULTS: PersistedFormState = {
  batteryKwh: 75,
  currentSoc: 30,
  targetSoc: 80,
  maxChargeKw: 11,
  carbonWeight: 0.3,
  region: "SE3",
};

function isValid(v: unknown): v is PersistedFormState {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["batteryKwh"] === "number" &&
    typeof o["currentSoc"] === "number" &&
    typeof o["targetSoc"] === "number" &&
    typeof o["maxChargeKw"] === "number" &&
    typeof o["carbonWeight"] === "number" &&
    typeof o["region"] === "string"
  );
}

function load(): PersistedFormState {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? { ...DEFAULTS, ...parsed } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

@Injectable({ providedIn: "root" })
export class FormStateService {
  readonly state = signal<PersistedFormState>(load());

  constructor() {
    effect(() => {
      const snap = this.state();
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      } catch {
        /* quota / private mode — ignore */
      }
    });
  }

  patch(partial: Partial<PersistedFormState>): void {
    this.state.update((s) => ({ ...s, ...partial }));
  }

  reset(): void {
    this.state.set(DEFAULTS);
  }
}
