import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { optimize } from "../services/optimizer.js";

const optimizeSchema = z.object({
  batteryKwh: z.number().positive().max(300),
  currentSoc: z.number().min(0).max(100),
  targetSoc: z.number().min(0).max(100),
  maxChargeKw: z.number().positive().max(350),
  departureTime: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "departureTime must be a valid ISO timestamp",
  }),
  carbonWeight: z.number().min(0).max(1).default(0.3),
  region: z.string().optional(),
});

export const optimizeRouter = Router();

optimizeRouter.post("/optimize", async (req: Request, res: Response) => {
  const parsed = optimizeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_request",
      issues: parsed.error.flatten(),
    });
  }
  const data = parsed.data;
  if (data.targetSoc <= data.currentSoc) {
    return res.status(400).json({
      error: "invalid_request",
      message: "targetSoc must exceed currentSoc",
    });
  }
  if (new Date(data.departureTime).getTime() <= Date.now()) {
    return res.status(400).json({
      error: "invalid_request",
      message: "departureTime must be in the future",
    });
  }

  try {
    const result = await optimize(data);
    res.json(result);
  } catch (err) {
    console.error("optimize failed", err);
    res.status(500).json({ error: "optimizer_failed" });
  }
});
