import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes.js";
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

// Global centralized error handler
app.use(errorHandler);

export default app;
