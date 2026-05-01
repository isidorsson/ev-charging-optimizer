import { Router, type Request, type Response } from "express";
import { priceCacheStats } from "../services/prices.js";
import { carbonCacheStats } from "../services/carbon.js";
import { liveTickStats } from "../services/live-tick.js";

export const metaRouter = Router();

const STARTED_AT = Date.now();
const VERSION = process.env.npm_package_version ?? "1.0.0";
const COMMIT = (process.env.GIT_COMMIT ?? "dev").slice(0, 7);

metaRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    uptimeS: Math.round((Date.now() - STARTED_AT) / 1000),
  });
});

metaRouter.get("/version", (_req: Request, res: Response) => {
  res.json({
    version: VERSION,
    commit: COMMIT,
    node: process.version,
    startedAt: new Date(STARTED_AT).toISOString(),
  });
});

metaRouter.get("/metrics", (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  res.json({
    uptimeS: Math.round((Date.now() - STARTED_AT) / 1000),
    memory: {
      rssMb: +(mem.rss / 1_048_576).toFixed(1),
      heapUsedMb: +(mem.heapUsed / 1_048_576).toFixed(1),
      heapTotalMb: +(mem.heapTotal / 1_048_576).toFixed(1),
    },
    cache: {
      prices: priceCacheStats(),
      carbon: carbonCacheStats(),
    },
    live: liveTickStats(),
  });
});
