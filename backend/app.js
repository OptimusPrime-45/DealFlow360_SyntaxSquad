import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes.js";
import customerRouter from "./routes/customer.routes.js";
import tierRouter from "./routes/tier.routes.js";
import catalogRouter from "./routes/catalog.routes.js";
import quotationRouter from "./routes/quotation.routes.js";
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

// Mount modular routes
app.use("/api/auth", authRouter);
app.use("/api/customers", customerRouter);
app.use("/api/customer-tiers", tierRouter);
app.use("/api/quotations", quotationRouter);
app.use("/api", catalogRouter);

// Global centralized error handler
app.use(errorHandler);

export default app;
