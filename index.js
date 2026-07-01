import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import morgan from "morgan";
import { connectDB } from "./config/db.js";
// import { knownSeedData } from "./data/seed.js";
import Astrologer from "./models/Astrologer.js";
import Consultation from "./models/Consultation.js";
import User from "./models/User.js";
import authRoutes, { signIn } from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import consultationRoutes from "./routes/consultations.js";
import panelRoutes from "./routes/panels.js";
import paymentRoutes from "./routes/payments.js";
// import toolRoutes from "./routes/tools.js";

dotenv.config();
dotenv.config({ path: "./.env" });

const app = express();
const readCliValue = (name) => {
  const longFlag = `--${name}`;
  const inlineFlag = `${longFlag}=`;
  const inlineValue = process.argv.find((arg) => arg.startsWith(inlineFlag));

  if (inlineValue) return inlineValue.slice(inlineFlag.length);

  const flagIndex = process.argv.indexOf(longFlag);
  if (flagIndex >= 0) return process.argv[flagIndex + 1];

  return "";
};
const port = readCliValue("port") || process.env.PORT || 5000;
const host = readCliValue("host") || process.env.HOST || "127.0.0.1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

app.use(cors({ origin: true }));
app.use(express.json());
app.use(morgan("dev"));

app.locals.mongoReady = await connectDB();

app.post("/api/auth/signin", signIn);
app.use("/api", catalogRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/panels", panelRoutes);
app.use("/api/payments", paymentRoutes);
// app.use("/api/tools", toolRoutes);

const apiInfo = {
  message: "Namandarshan Astrotalk API server is running",
  health: "/api/health",
  basePath: "/api",
  endpoints: {
    catalog: ["/api/stats", "/api/astrologers", "/api/filters"],
    auth: ["/api/auth/register", "/api/auth/signin", "/api/auth/profile"],
    panels: ["/api/panels/user", "/api/panels/admin", "/api/panels/astrologer"],
    consultations: ["/api/consultations", "/api/consultations/:bookingId/session"],
    payments: ["/api/payments/wallet/recharge", "/api/payments/verify"]
  }
};

app.get("/", (_req, res) => {
  res.json(apiInfo);
});

app.get("/api", (_req, res) => {
  res.json(apiInfo);
});

if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    message: error.message || "Unexpected server error"
  });
});

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
