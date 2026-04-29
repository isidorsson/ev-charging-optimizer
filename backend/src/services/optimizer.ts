import { fetchPrices } from "./prices.js";
import { fetchCarbon } from "./carbon.js";
import type {
  ForecastSlot,
  OptimizeRequest,
  OptimizeResponse,
  ScheduleSlot,
} from "../types.js";

export async function buildForecast(
  region: string,
  hoursAhead: number,
): Promise<ForecastSlot[]> {
  const [prices, carbon] = await Promise.all([
    fetchPrices(region, hoursAhead),
    fetchCarbon(hoursAhead),
  ]);

  const carbonByHour = new Map<string, number>();
  for (const c of carbon) {
    carbonByHour.set(c.startsAt.slice(0, 13), c.intensityGCo2PerKwh);
  }

  return prices.map((p) => {
    const key = p.startsAt.slice(0, 13);
    const intensity = carbonByHour.get(key);
    return {
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      pricePerKwh: p.pricePerKwh,
      currency: p.currency,
      intensityGCo2PerKwh:
        intensity ?? averageIntensity(carbon) ?? 200,
    };
  });
}

function averageIntensity(slots: { intensityGCo2PerKwh: number }[]): number | null {
  if (slots.length === 0) return null;
  return slots.reduce((acc, s) => acc + s.intensityGCo2PerKwh, 0) / slots.length;
}

function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map((v) => (v - min) / (max - min));
}

/**
 * Score combines normalized price and carbon. Lower = better.
 * carbonWeight 0 → pure cost; 1 → pure carbon; 0.5 → balanced.
 */
function scoreSlots(slots: ForecastSlot[], carbonWeight: number): number[] {
  const normPrice = normalize(slots.map((s) => s.pricePerKwh));
  const normCarbon = normalize(slots.map((s) => s.intensityGCo2PerKwh));
  return slots.map(
    (_, i) => (1 - carbonWeight) * normPrice[i] + carbonWeight * normCarbon[i],
  );
}

export async function optimize(
  req: OptimizeRequest,
): Promise<OptimizeResponse> {
  const energyNeededKwh = Math.max(
    0,
    ((req.targetSoc - req.currentSoc) / 100) * req.batteryKwh,
  );

  const now = new Date();
  const departure = new Date(req.departureTime);
  const msUntilDeparture = departure.getTime() - now.getTime();
  const hoursAhead = Math.max(
    1,
    Math.min(48, Math.ceil(msUntilDeparture / 3600 / 1000)),
  );

  const forecast = await buildForecast(req.region ?? "SE3", hoursAhead);

  if (energyNeededKwh === 0 || forecast.length === 0) {
    return emptyResponse(forecast, energyNeededKwh);
  }

  const hoursNeededFloat = energyNeededKwh / req.maxChargeKw;
  const fullHoursNeeded = Math.floor(hoursNeededFloat);
  const partialHourEnergy =
    (hoursNeededFloat - fullHoursNeeded) * req.maxChargeKw;

  const scores = scoreSlots(forecast, req.carbonWeight);
  const ranked = forecast
    .map((slot, idx) => ({ idx, slot, score: scores[idx] }))
    .sort((a, b) => a.score - b.score);

  const fullSet = new Set(ranked.slice(0, fullHoursNeeded).map((r) => r.idx));
  const partialIdx =
    partialHourEnergy > 0.001
      ? ranked[fullHoursNeeded]?.idx ?? null
      : null;

  const schedule: ScheduleSlot[] = forecast.map((slot, idx) => {
    if (fullSet.has(idx)) {
      return { ...slot, charging: true, energyKwh: req.maxChargeKw };
    }
    if (idx === partialIdx) {
      return { ...slot, charging: true, energyKwh: partialHourEnergy };
    }
    return { ...slot, charging: false, energyKwh: 0 };
  });

  return buildSummary(schedule, forecast, req, energyNeededKwh);
}

function emptyResponse(
  forecast: ForecastSlot[],
  energyNeededKwh: number,
): OptimizeResponse {
  const schedule: ScheduleSlot[] = forecast.map((slot) => ({
    ...slot,
    charging: false,
    energyKwh: 0,
  }));
  return {
    schedule,
    summary: {
      energyNeededKwh,
      chargingHours: 0,
      totalCost: 0,
      averagePricePerKwh: 0,
      totalCarbonGrams: 0,
      averageIntensity: 0,
      cheapestWindowStart: null,
      currency: forecast[0]?.currency ?? "SEK",
      savingsVsNaive: 0,
    },
  };
}

function buildSummary(
  schedule: ScheduleSlot[],
  forecast: ForecastSlot[],
  req: OptimizeRequest,
  energyNeededKwh: number,
): OptimizeResponse {
  const charging = schedule.filter((s) => s.charging);
  const totalCost = charging.reduce(
    (acc, s) => acc + s.pricePerKwh * s.energyKwh,
    0,
  );
  const totalCarbonGrams = charging.reduce(
    (acc, s) => acc + s.intensityGCo2PerKwh * s.energyKwh,
    0,
  );
  const averagePricePerKwh = energyNeededKwh > 0 ? totalCost / energyNeededKwh : 0;
  const averageIntensity =
    energyNeededKwh > 0 ? totalCarbonGrams / energyNeededKwh : 0;

  const naiveCost = computeNaiveCost(forecast, req, energyNeededKwh);
  const savingsVsNaive =
    naiveCost > 0 ? Math.max(0, (naiveCost - totalCost) / naiveCost) : 0;

  return {
    schedule,
    summary: {
      energyNeededKwh,
      chargingHours: charging.reduce((acc, s) => acc + s.energyKwh / req.maxChargeKw, 0),
      totalCost,
      averagePricePerKwh,
      totalCarbonGrams,
      averageIntensity,
      cheapestWindowStart: charging[0]?.startsAt ?? null,
      currency: forecast[0]?.currency ?? "SEK",
      savingsVsNaive,
    },
  };
}

function computeNaiveCost(
  forecast: ForecastSlot[],
  req: OptimizeRequest,
  energyNeededKwh: number,
): number {
  let remaining = energyNeededKwh;
  let cost = 0;
  for (const slot of forecast) {
    if (remaining <= 0) break;
    const take = Math.min(req.maxChargeKw, remaining);
    cost += slot.pricePerKwh * take;
    remaining -= take;
  }
  return cost;
}
