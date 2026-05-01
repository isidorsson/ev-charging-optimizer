import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

declare module "express-serve-static-core" {
  interface Request {
    id: string;
    startedAt: number;
  }
}

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming =
    typeof req.headers["x-request-id"] === "string"
      ? req.headers["x-request-id"]
      : null;
  req.id = incoming || randomUUID();
  req.startedAt = Date.now();
  res.setHeader("x-request-id", req.id);
  next();
}

interface LogPayload {
  level: "info" | "warn" | "error";
  msg: string;
  [k: string]: unknown;
}

function emit(payload: LogPayload): void {
  // Structured JSON line — pipe to anywhere (Loki, CloudWatch, stdout).
  // Keep deps zero — pino-grade output without the dep cost.
  const line = JSON.stringify({ ts: new Date().toISOString(), ...payload });
  if (payload.level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function accessLog(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on("finish", () => {
    emit({
      level: res.statusCode >= 500 ? "error" : "info",
      msg: "http",
      reqId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - req.startedAt,
      ip: req.ip,
    });
  });
  next();
}

export function logger(reqId: string | undefined = undefined) {
  return {
    info: (msg: string, ctx: Record<string, unknown> = {}) =>
      emit({ level: "info", msg, reqId, ...ctx }),
    warn: (msg: string, ctx: Record<string, unknown> = {}) =>
      emit({ level: "warn", msg, reqId, ...ctx }),
    error: (msg: string, ctx: Record<string, unknown> = {}) =>
      emit({ level: "error", msg, reqId, ...ctx }),
  };
}
