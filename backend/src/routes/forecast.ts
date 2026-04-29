import { Router, type Request, type Response } from "express";
import { buildForecast } from "../services/optimizer.js";

export const forecastRouter = Router();

forecastRouter.get("/forecast", async (req: Request, res: Response) => {
  const region = typeof req.query.region === "string" ? req.query.region : "SE3";
  const hours = Math.min(
    48,
    Math.max(1, Number(req.query.hours ?? 24) || 24),
  );
  try {
    const forecast = await buildForecast(region, hours);
    res.json({ region, hours, forecast });
  } catch (err) {
    console.error("forecast failed", err);
    res.status(500).json({ error: "forecast_failed" });
  }
});
