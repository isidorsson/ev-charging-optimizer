import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { buildForecast } from "../services/optimizer.js";
import { logger } from "../middleware/request-context.js";

export const forecastRouter = Router();

const querySchema = z.object({
  region: z.enum(["SE1", "SE2", "SE3", "SE4"]).default("SE3"),
  hours: z.coerce.number().int().min(1).max(48).default(24),
});

forecastRouter.get("/forecast", async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_request",
      issues: parsed.error.flatten(),
    });
  }
  const { region, hours } = parsed.data;
  const log = logger(req.id);
  try {
    const forecast = await buildForecast(region, hours);
    res.json({ region, hours, forecast });
  } catch (err) {
    log.error("forecast_failed", { err: String(err), region, hours });
    res.status(500).json({ error: "forecast_failed" });
  }
});
