import type { PriceSlot } from "../types.js";

const SUPPORTED_REGIONS = ["SE1", "SE2", "SE3", "SE4"] as const;
type Region = (typeof SUPPORTED_REGIONS)[number];

function isRegion(value: string): value is Region {
  return (SUPPORTED_REGIONS as readonly string[]).includes(value);
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function urlFor(date: Date, region: Region): string {
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  return `https://www.elprisetjustnu.se/api/v1/prices/${y}/${m}-${d}_${region}.json`;
}

interface UpstreamSlot {
  SEK_per_kWh: number;
  EUR_per_kWh: number;
  EXR: number;
  time_start: string;
  time_end: string;
}

async function fetchDay(date: Date, region: Region): Promise<PriceSlot[]> {
  const res = await fetch(urlFor(date, region), {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`prices upstream ${res.status}`);
  const raw = (await res.json()) as UpstreamSlot[];
  return raw.map((s) => ({
    startsAt: s.time_start,
    endsAt: s.time_end,
    pricePerKwh: s.SEK_per_kWh,
    currency: "SEK",
  }));
}

export async function fetchPrices(
  region: string,
  hoursAhead: number,
): Promise<PriceSlot[]> {
  const reg: Region = isRegion(region) ? region : "SE3";
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);

  try {
    const todayPrices = await fetchDay(today, reg);
    let combined = todayPrices;
    if (hoursAhead > 12) {
      try {
        const tomorrowPrices = await fetchDay(tomorrow, reg);
        combined = [...todayPrices, ...tomorrowPrices];
      } catch {
        // tomorrow's prices publish ~13:00 CET — silently fall through
      }
    }
    if (combined.length === 0) throw new Error("empty upstream");
    const hourly = bucketToHourly(combined);
    return filterFuture(hourly, hoursAhead);
  } catch {
    return mockPrices(hoursAhead);
  }
}

/**
 * Nord Pool now publishes 15-minute slots; carbon intensity is half-hourly.
 * Average sub-hourly slots into hourly bins so the optimizer operates on a
 * uniform time grid and energy accounting stays correct.
 */
function bucketToHourly(slots: PriceSlot[]): PriceSlot[] {
  const buckets = new Map<
    string,
    { sum: number; count: number; currency: string; start: string }
  >();
  for (const s of slots) {
    const start = new Date(s.startsAt);
    start.setMinutes(0, 0, 0);
    const key = start.toISOString();
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sum += s.pricePerKwh;
      bucket.count += 1;
    } else {
      buckets.set(key, {
        sum: s.pricePerKwh,
        count: 1,
        currency: s.currency,
        start: key,
      });
    }
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => {
      const startDate = new Date(b.start);
      const endDate = new Date(startDate.getTime() + 3600 * 1000);
      return {
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        pricePerKwh: b.sum / b.count,
        currency: b.currency,
      };
    });
}

function filterFuture(slots: PriceSlot[], hoursAhead: number): PriceSlot[] {
  const now = Date.now();
  const cutoff = now + hoursAhead * 3600 * 1000;
  return slots
    .filter((s) => new Date(s.endsAt).getTime() > now)
    .filter((s) => new Date(s.startsAt).getTime() < cutoff)
    .slice(0, hoursAhead);
}

function mockPrices(hoursAhead: number): PriceSlot[] {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const slots: PriceSlot[] = [];
  for (let i = 0; i < hoursAhead; i++) {
    const start = new Date(now.getTime() + i * 3600 * 1000);
    const end = new Date(start.getTime() + 3600 * 1000);
    const hourOfDay = start.getHours();
    const dailyShape =
      0.6 +
      0.5 * Math.sin(((hourOfDay - 8) * Math.PI) / 12) +
      (hourOfDay >= 17 && hourOfDay <= 20 ? 0.6 : 0);
    const noise = (Math.sin(i * 13.37) + 1) * 0.15;
    slots.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      pricePerKwh: Math.max(0.05, dailyShape * 1.4 + noise),
      currency: "SEK",
    });
  }
  return slots;
}
