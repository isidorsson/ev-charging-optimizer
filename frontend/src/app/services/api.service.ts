import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";

export interface ScheduleSlot {
  startsAt: string;
  endsAt: string;
  pricePerKwh: number;
  currency: string;
  intensityGCo2PerKwh: number;
  charging: boolean;
  energyKwh: number;
}

export interface OptimizeSummary {
  energyNeededKwh: number;
  chargingHours: number;
  totalCost: number;
  averagePricePerKwh: number;
  totalCarbonGrams: number;
  averageIntensity: number;
  cheapestWindowStart: string | null;
  currency: string;
  savingsVsNaive: number;
}

export interface OptimizeResponse {
  schedule: ScheduleSlot[];
  summary: OptimizeSummary;
}

export interface OptimizeRequest {
  batteryKwh: number;
  currentSoc: number;
  targetSoc: number;
  maxChargeKw: number;
  departureTime: string;
  carbonWeight: number;
  region?: string;
}

@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly http = inject(HttpClient);

  optimize(req: OptimizeRequest): Promise<OptimizeResponse> {
    return firstValueFrom(
      this.http.post<OptimizeResponse>("/api/optimize", req),
    );
  }

  getPushKey(): Promise<{ publicKey: string }> {
    return firstValueFrom(
      this.http.get<{ publicKey: string }>("/api/push/key"),
    );
  }

  schedulePush(payload: {
    subscription: PushSubscriptionJSON;
    fireAt: string;
    title: string;
    body: string;
  }): Promise<{ scheduled: boolean }> {
    return firstValueFrom(
      this.http.post<{ scheduled: boolean }>("/api/push/schedule", payload),
    );
  }
}
