export interface PriceSlot {
  startsAt: string;
  endsAt: string;
  pricePerKwh: number;
  currency: string;
}

export interface CarbonSlot {
  startsAt: string;
  endsAt: string;
  intensityGCo2PerKwh: number;
}

export interface ForecastSlot {
  startsAt: string;
  endsAt: string;
  pricePerKwh: number;
  currency: string;
  intensityGCo2PerKwh: number;
}

export interface ScheduleSlot extends ForecastSlot {
  charging: boolean;
  energyKwh: number;
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

export interface OptimizeResponse {
  schedule: ScheduleSlot[];
  summary: {
    energyNeededKwh: number;
    chargingHours: number;
    totalCost: number;
    averagePricePerKwh: number;
    totalCarbonGrams: number;
    averageIntensity: number;
    cheapestWindowStart: string | null;
    currency: string;
    savingsVsNaive: number;
  };
}
