import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PriceSlot, CarbonSlot } from "../types.js";

vi.mock("./prices.js", () => ({
  fetchPrices: vi.fn(),
  priceCacheStats: () => ({ size: 0, inflight: 0, errors: 0 }),
}));
vi.mock("./carbon.js", () => ({
  fetchCarbon: vi.fn(),
  carbonCacheStats: () => ({ size: 0, inflight: 0, errors: 0 }),
}));

import { optimize } from "./optimizer.js";
import { fetchPrices } from "./prices.js";
import { fetchCarbon } from "./carbon.js";

const mockedFetchPrices = vi.mocked(fetchPrices);
const mockedFetchCarbon = vi.mocked(fetchCarbon);

function buildPrices(values: number[], hourStart: number): PriceSlot[] {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  return values.map((v, i) => {
    const start = new Date(base.getTime() + (hourStart + i) * 3600 * 1000);
    const end = new Date(start.getTime() + 3600 * 1000);
    return {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      pricePerKwh: v,
      currency: "SEK",
    };
  });
}

function buildCarbon(values: number[], hourStart: number): CarbonSlot[] {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  return values.map((v, i) => {
    const start = new Date(base.getTime() + (hourStart + i) * 3600 * 1000);
    const end = new Date(start.getTime() + 3600 * 1000);
    return {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      intensityGCo2PerKwh: v,
    };
  });
}

describe("optimizer", () => {
  beforeEach(() => {
    mockedFetchPrices.mockReset();
    mockedFetchCarbon.mockReset();
  });

  it("picks the cheapest hours when carbonWeight = 0", async () => {
    mockedFetchPrices.mockResolvedValue(buildPrices([2.0, 0.5, 1.5, 0.3, 1.0, 2.5, 0.8, 1.2], 0));
    mockedFetchCarbon.mockResolvedValue(buildCarbon([200, 200, 200, 200, 200, 200, 200, 200], 0));

    const result = await optimize({
      batteryKwh: 50,
      currentSoc: 50,
      targetSoc: 70, // need 10 kWh
      maxChargeKw: 5, // 2 hours of charging needed
      departureTime: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      carbonWeight: 0,
      region: "SE3",
    });

    const charging = result.schedule.filter((s) => s.charging);
    expect(charging).toHaveLength(2);
    const prices = charging.map((s) => s.pricePerKwh).sort((a, b) => a - b);
    expect(prices).toEqual([0.3, 0.5]);
  });

  it("picks the greenest hours when carbonWeight = 1", async () => {
    mockedFetchPrices.mockResolvedValue(buildPrices([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], 0));
    mockedFetchCarbon.mockResolvedValue(buildCarbon([300, 280, 100, 250, 50, 290, 150, 200], 0));

    const result = await optimize({
      batteryKwh: 50,
      currentSoc: 60,
      targetSoc: 80, // 10 kWh
      maxChargeKw: 5,
      departureTime: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      carbonWeight: 1,
      region: "SE3",
    });

    const charging = result.schedule.filter((s) => s.charging);
    expect(charging).toHaveLength(2);
    const intensities = charging.map((s) => s.intensityGCo2PerKwh).sort((a, b) => a - b);
    expect(intensities).toEqual([50, 100]);
  });

  it("computes savingsVsNaive ≥ 0 — never worse than naive", async () => {
    mockedFetchPrices.mockResolvedValue(buildPrices([3.0, 2.5, 0.5, 0.4, 0.8, 1.0, 2.0, 2.2], 0));
    mockedFetchCarbon.mockResolvedValue(buildCarbon([200, 200, 200, 200, 200, 200, 200, 200], 0));

    const result = await optimize({
      batteryKwh: 60,
      currentSoc: 30,
      targetSoc: 70,
      maxChargeKw: 8,
      departureTime: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      carbonWeight: 0,
      region: "SE3",
    });

    expect(result.summary.savingsVsNaive).toBeGreaterThan(0);
    expect(result.summary.totalCost).toBeGreaterThan(0);
  });

  it("returns empty charging when energy needed is zero", async () => {
    mockedFetchPrices.mockResolvedValue(buildPrices([1.0, 1.0, 1.0, 1.0], 0));
    mockedFetchCarbon.mockResolvedValue(buildCarbon([200, 200, 200, 200], 0));

    const result = await optimize({
      batteryKwh: 50,
      currentSoc: 80,
      targetSoc: 80,
      maxChargeKw: 11,
      departureTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      carbonWeight: 0.3,
      region: "SE3",
    });

    expect(result.summary.energyNeededKwh).toBe(0);
    expect(result.schedule.every((s) => !s.charging)).toBe(true);
    expect(result.summary.totalCost).toBe(0);
  });

  it("schedules a partial-hour charge when energy isn't a whole multiple", async () => {
    mockedFetchPrices.mockResolvedValue(buildPrices([1.0, 0.2, 0.3, 1.5], 0));
    mockedFetchCarbon.mockResolvedValue(buildCarbon([200, 200, 200, 200], 0));

    // 50 * (60-50)/100 = 5 kWh; at 4 kW that's 1.25 hours → 1 full + 0.25 partial
    const result = await optimize({
      batteryKwh: 50,
      currentSoc: 50,
      targetSoc: 60,
      maxChargeKw: 4,
      departureTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      carbonWeight: 0,
      region: "SE3",
    });

    const charging = result.schedule.filter((s) => s.charging);
    expect(charging).toHaveLength(2);
    const energies = charging.map((s) => s.energyKwh).sort((a, b) => a - b);
    expect(energies[0]).toBeCloseTo(1.0, 5); // partial: 0.25h * 4kW
    expect(energies[1]).toBe(4); // full hour at max
    const total = energies.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(5, 5);
  });

  it("totalCost equals sum of price * energy for every charging slot", async () => {
    mockedFetchPrices.mockResolvedValue(buildPrices([0.4, 1.0, 0.6, 1.2, 0.3, 0.5], 0));
    mockedFetchCarbon.mockResolvedValue(buildCarbon([180, 220, 150, 300, 100, 240], 0));

    const result = await optimize({
      batteryKwh: 80,
      currentSoc: 40,
      targetSoc: 65,
      maxChargeKw: 10,
      departureTime: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
      carbonWeight: 0.3,
      region: "SE3",
    });

    const charging = result.schedule.filter((s) => s.charging);
    const recomputed = charging.reduce(
      (acc, s) => acc + s.pricePerKwh * s.energyKwh,
      0,
    );
    expect(result.summary.totalCost).toBeCloseTo(recomputed, 6);
  });
});
