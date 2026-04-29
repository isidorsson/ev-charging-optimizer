import { Injectable, signal } from "@angular/core";
import type { OptimizeRequest, OptimizeResponse } from "./api.service";

@Injectable({ providedIn: "root" })
export class ScheduleStoreService {
  readonly latest = signal<OptimizeResponse | null>(null);
  readonly inputs = signal<OptimizeRequest | null>(null);

  set(result: OptimizeResponse, inputs: OptimizeRequest): void {
    this.latest.set(result);
    this.inputs.set(inputs);
  }
}
