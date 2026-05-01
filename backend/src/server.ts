import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";

import { optimizeRouter } from "./routes/optimize.js";
import { forecastRouter } from "./routes/forecast.js";
import { pushRouter } from "./routes/push.js";
import { metaRouter } from "./routes/meta.js";
import { accessLog, requestContext } from "./middleware/request-context.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.resolve(__dirname, "../../frontend/www");

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: false, // Ionic inlines styles; relax for demo simplicity
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(requestContext);
app.use(accessLog);

app.use("/api", metaRouter);
app.use("/api", optimizeRouter);
app.use("/api", forecastRouter);
app.use("/api", pushRouter);

app.use(express.static(FRONTEND_DIR, { maxAge: "1h", index: "index.html" }));

// SPA fallback — anything outside /api/* serves the Ionic shell
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"), (err) => {
    if (err) res.status(404).send("Not found");
  });
});

app.listen(PORT, () => {
  console.log(`⚡ EV optimizer listening on :${PORT}`);
  console.log(`   serving frontend from ${FRONTEND_DIR}`);
});
