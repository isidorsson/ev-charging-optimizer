import { Router, type Request, type Response } from "express";
import webpush from "web-push";

const PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const CONTACT = process.env.VAPID_CONTACT ?? "mailto:demo@example.com";

if (PUBLIC && PRIVATE) {
  webpush.setVapidDetails(CONTACT, PUBLIC, PRIVATE);
}

interface StoredSubscription {
  subscription: webpush.PushSubscription;
  fireAt: number;
  payload: { title: string; body: string };
  timer: NodeJS.Timeout;
}

const pending = new Map<string, StoredSubscription>();

export const pushRouter = Router();

pushRouter.get("/push/key", (_req, res) => {
  if (!PUBLIC) {
    return res.status(503).json({ error: "vapid_not_configured" });
  }
  res.json({ publicKey: PUBLIC });
});

pushRouter.post("/push/schedule", async (req: Request, res: Response) => {
  if (!PUBLIC || !PRIVATE) {
    return res.status(503).json({ error: "vapid_not_configured" });
  }
  const { subscription, fireAt, title, body } = req.body ?? {};
  if (!subscription?.endpoint || !fireAt) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const delay = new Date(fireAt).getTime() - Date.now();
  if (delay <= 0 || delay > 48 * 3600 * 1000) {
    return res.status(400).json({ error: "fireAt_out_of_range" });
  }

  const id = subscription.endpoint;
  pending.get(id)?.timer && clearTimeout(pending.get(id)!.timer);

  const payload = {
    title: title ?? "Cheap charging window",
    body: body ?? "Your optimal EV charging window has started.",
  };
  const timer = setTimeout(async () => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (err) {
      console.error("push send failed", err);
    } finally {
      pending.delete(id);
    }
  }, delay);

  pending.set(id, { subscription, fireAt: new Date(fireAt).getTime(), payload, timer });
  res.json({ scheduled: true, fireAt });
});
