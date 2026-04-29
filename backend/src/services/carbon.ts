import type { CarbonSlot } from "../types.js";

interface UpstreamCarbon {
  data: {
    from: string;
    to: string;
    intensity: { forecast: number; actual: number | null; index: string };
  }[];
}

export async function fetchCarbon(hoursAhead: number): Promise<CarbonSlot[]> {
  try {
    const from = new Date().toISOString();
    const url = `https://api.carbonintensity.org.uk/intensity/${from}/fw48h`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`carbon upstream ${res.status}`);
    const json = (await res.json()) as UpstreamCarbon;

    const halfHourly = json.data.map((d) => ({
      startsAt: d.from,
      endsAt: d.to,
      intensityGCo2PerKwh: d.intensity.forecast,
    }));

    return collapseToHourly(halfHourly).slice(0, hoursAhead);
  } catch {
    return mockCarbon(hoursAhead);
  }
}

function collapseToHourly(slots: CarbonSlot[]): CarbonSlot[] {
  const buckets = new Map<string, { sum: number; count: number; end: string }>();
  for (const s of slots) {
    const key = s.startsAt.slice(0, 13);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sum += s.intensityGCo2PerKwh;
      bucket.count += 1;
      bucket.end = s.endsAt;
    } else {
      buckets.set(key, {
        sum: s.intensityGCo2PerKwh,
        count: 1,
        end: s.endsAt,
      });
    }
  }
  return Array.from(buckets.entries()).map(([key, v]) => ({
    startsAt: `${key}:00:00.000Z`,
    endsAt: v.end,
    intensityGCo2PerKwh: v.sum / v.count,
  }));
}

function mockCarbon(hoursAhead: number): CarbonSlot[] {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const slots: CarbonSlot[] = [];
  for (let i = 0; i < hoursAhead; i++) {
    const start = new Date(now.getTime() + i * 3600 * 1000);
    const end = new Date(start.getTime() + 3600 * 1000);
    const hourOfDay = start.getHours();
    // Solar dip around midday, fossil ramp evening
    const base = 220;
    const solarDip = -90 * Math.max(0, Math.sin(((hourOfDay - 6) * Math.PI) / 12));
    const eveningRamp = hourOfDay >= 17 && hourOfDay <= 21 ? 80 : 0;
    const noise = Math.cos(i * 7.91) * 25;
    slots.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      intensityGCo2PerKwh: Math.max(40, base + solarDip + eveningRamp + noise),
    });
  }
  return slots;
}
