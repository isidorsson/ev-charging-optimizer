import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { fetchPrices } from "./prices.js";
import { fetchCarbon } from "./carbon.js";

export interface LiveTick {
  type: "tick";
  ts: string;
  region: string;
  pricePerKwh: number;
  currency: string;
  intensityGCo2PerKwh: number;
  carbonIndex: "very low" | "low" | "moderate" | "high" | "very high";
  nextHourPricePerKwh: number | null;
  nextHourIntensity: number | null;
}

const TICK_INTERVAL_MS = 5_000;
const PING_INTERVAL_MS = 30_000;
const SUPPORTED_REGIONS = new Set(["SE1", "SE2", "SE3", "SE4"]);
const MAX_PAYLOAD_BYTES = 1024;
const MAX_CONNS_PER_IP = 5;
const MAX_TOTAL_CONNS = 500;

const ALLOWED_ORIGINS: ReadonlyArray<RegExp | string> = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  "https://isidorsson.com",
  /^https:\/\/[a-z0-9-]+\.isidorsson\.com$/,
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/,
];

interface ClientMeta {
  region: string;
  alive: boolean;
  ip: string;
}

const clients = new Map<WebSocket, ClientMeta>();
const tickByRegion = new Map<string, LiveTick>();
const connsByIp = new Map<string, number>();

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin upgrade has no Origin
  return ALLOWED_ORIGINS.some((rule) =>
    typeof rule === "string" ? rule === origin : rule.test(origin),
  );
}

function carbonIndexFor(g: number): LiveTick["carbonIndex"] {
  if (g < 100) return "very low";
  if (g < 200) return "low";
  if (g < 300) return "moderate";
  if (g < 400) return "high";
  return "very high";
}

function findCurrentSlot<T extends { startsAt: string; endsAt: string }>(
  slots: T[],
): T | null {
  const now = Date.now();
  return (
    slots.find(
      (s) =>
        new Date(s.startsAt).getTime() <= now &&
        new Date(s.endsAt).getTime() > now,
    ) ?? slots[0] ?? null
  );
}

async function computeTick(region: string): Promise<LiveTick | null> {
  const [prices, carbon] = await Promise.all([
    fetchPrices(region, 3),
    fetchCarbon(3),
  ]);

  const currentPrice = findCurrentSlot(prices);
  const currentCarbon = findCurrentSlot(carbon);
  if (!currentPrice || !currentCarbon) return null;

  const nextPrice = prices[1] ?? null;
  const nextCarbon = carbon[1] ?? null;

  return {
    type: "tick",
    ts: new Date().toISOString(),
    region,
    pricePerKwh: currentPrice.pricePerKwh,
    currency: currentPrice.currency,
    intensityGCo2PerKwh: currentCarbon.intensityGCo2PerKwh,
    carbonIndex: carbonIndexFor(currentCarbon.intensityGCo2PerKwh),
    nextHourPricePerKwh: nextPrice?.pricePerKwh ?? null,
    nextHourIntensity: nextCarbon?.intensityGCo2PerKwh ?? null,
  };
}

function activeRegions(): Set<string> {
  const set = new Set<string>();
  for (const meta of clients.values()) set.add(meta.region);
  return set;
}

async function refreshTicks(): Promise<void> {
  const regions = activeRegions();
  await Promise.all(
    [...regions].map(async (region) => {
      try {
        const tick = await computeTick(region);
        if (tick) tickByRegion.set(region, tick);
      } catch (err) {
        console.error(`live-tick: refresh failed for ${region}`, err);
      }
    }),
  );
}

function broadcast(): void {
  for (const [ws, meta] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const tick = tickByRegion.get(meta.region);
    if (!tick) continue;
    ws.send(JSON.stringify(tick));
  }
}

function regionFromRequest(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", "http://x");
  const r = url.searchParams.get("region")?.toUpperCase() ?? "SE3";
  return SUPPORTED_REGIONS.has(r) ? r : "SE3";
}

export function attachLiveTick(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/api/live") {
      socket.destroy();
      return;
    }

    const origin = req.headers.origin;
    if (!isAllowedOrigin(typeof origin === "string" ? origin : undefined)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    if (clients.size >= MAX_TOTAL_CONNS) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    const ip = clientIp(req);
    const ipCount = connsByIp.get(ip) ?? 0;
    if (ipCount >= MAX_CONNS_PER_IP) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (ws, req) => {
    const region = regionFromRequest(req);
    const ip = clientIp(req);
    clients.set(ws, { region, alive: true, ip });
    connsByIp.set(ip, (connsByIp.get(ip) ?? 0) + 1);

    const cleanup = () => {
      clients.delete(ws);
      const remaining = (connsByIp.get(ip) ?? 1) - 1;
      if (remaining <= 0) connsByIp.delete(ip);
      else connsByIp.set(ip, remaining);
    };

    ws.on("pong", () => {
      const meta = clients.get(ws);
      if (meta) meta.alive = true;
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "subscribe" && typeof msg.region === "string") {
          const r = msg.region.toUpperCase();
          if (SUPPORTED_REGIONS.has(r)) {
            const meta = clients.get(ws);
            if (meta) meta.region = r;
            const cached = tickByRegion.get(r);
            if (cached) ws.send(JSON.stringify(cached));
          }
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("close", cleanup);
    ws.on("error", cleanup);

    let tick = tickByRegion.get(region);
    if (!tick) {
      try {
        const computed = await computeTick(region);
        if (computed) {
          tickByRegion.set(region, computed);
          tick = computed;
        }
      } catch (err) {
        console.error("live-tick: initial compute failed", err);
      }
    }
    if (tick && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(tick));
    }
  });

  const tickTimer = setInterval(async () => {
    if (clients.size === 0) return;
    await refreshTicks();
    broadcast();
  }, TICK_INTERVAL_MS);

  const pingTimer = setInterval(() => {
    for (const [ws, meta] of clients) {
      if (!meta.alive) {
        ws.terminate();
        const remaining = (connsByIp.get(meta.ip) ?? 1) - 1;
        if (remaining <= 0) connsByIp.delete(meta.ip);
        else connsByIp.set(meta.ip, remaining);
        clients.delete(ws);
        continue;
      }
      meta.alive = false;
      try {
        ws.ping();
      } catch {
        clients.delete(ws);
      }
    }
  }, PING_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(tickTimer);
    clearInterval(pingTimer);
  });

  return wss;
}

export function closeLiveTick(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve) => {
    for (const ws of clients.keys()) {
      try {
        ws.close(1001, "server shutting down");
      } catch {
        // ignore
      }
    }
    wss.close(() => resolve());
  });
}

export function liveTickStats() {
  return {
    clients: clients.size,
    regions: [...activeRegions()],
    cachedTicks: tickByRegion.size,
  };
}
