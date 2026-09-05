import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes.js";
import governanceRouter from "./routes/governance.routes.js";
import approvalRouter from "./routes/approval.routes.js";
import auditRouter from "./routes/audit.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "dealflow360-backend",
  });
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/governance", governanceRouter);
app.use("/api/approvals", approvalRouter);
app.use("/api/audit-logs", auditRouter);

// Global centralized error handler
app.use(errorHandler);

export default app;
