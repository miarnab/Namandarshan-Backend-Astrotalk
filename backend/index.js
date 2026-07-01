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
dotenv.config({ path: "../.env" });

const app = express();
const port = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, "../../client/dist");

app.use(cors({ origin: true }));
app.use(express.json());
app.use(morgan("dev"));

app.locals.mongoReady = await connectDB();

// if (app.locals.mongoReady) {
//   const [astrologerCleanup, userCleanup, bookingCleanup] = await Promise.all([
//     Astrologer.deleteMany({ id: { $in: knownSeedData.astrologerIds } }),
//     User.deleteMany({ email: { $in: knownSeedData.userEmails } }),
//     Consultation.deleteMany({ bookingId: { $in: knownSeedData.bookingIds } })
//   ]);
//   const removedCount =
//     astrologerCleanup.deletedCount + userCleanup.deletedCount + bookingCleanup.deletedCount;

//   if (removedCount > 0) {
//     console.log(`Removed ${removedCount} old seeded record${removedCount === 1 ? "" : "s"}.`);
//   }
// }

app.post("/api/auth/signin", signIn);
app.use("/api", catalogRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/panels", panelRoutes);
app.use("/api/payments", paymentRoutes);
// app.use("/api/tools", toolRoutes);

// app.get("/", (_req, res) => {
//   res.json({
//     message: "API server is running",
//     health: "/api/health",
//     basePath: "/api"
//   });
// });

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

app.listen(port, () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});