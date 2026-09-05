// backend/app.js

import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import fulfillmentRoutes from "./routes/fulfillment.routes.js";
import subscriptionsRoutes from "./routes/subscriptions.routes.js";
import authRouter from "./routes/auth.routes.js";
import customerRouter from "./routes/customer.routes.js";
import tierRouter from "./routes/tier.routes.js";
import catalogRouter from "./routes/catalog.routes.js";
import quotationRouter from "./routes/quotation.routes.js";
import governanceRouter from "./routes/governance.routes.js";
import approvalRouter from "./routes/approval.routes.js";
import auditRouter from "./routes/audit.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

// Allow frontend requests.
app.use(cors());

// Parse JSON request bodies.
app.use(express.json());

// Health check.
app.get(
  "/api/health",
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "DealFlow360 backend is running"
    });
  }
);

// Authentication routes.
app.use(
  "/api/auth",
  authRoutes
);

// T3 - Order confirmation.
app.use(
  "/api/orders",
  ordersRoutes
);

// T3 - Fulfillment.
app.use(
  "/api/fulfillment",
  fulfillmentRoutes
);

// T3 - Subscription and billing.
app.use(
  "/api/subscriptions",
  subscriptionsRoutes
);

// Mount modular routes
app.use("/api/auth", authRouter);
app.use("/api/customers", customerRouter);
app.use("/api/customer-tiers", tierRouter);
app.use("/api/quotations", quotationRouter);
app.use("/api", catalogRouter);
// Handle unknown routes.
app.use(
  (req, res) => {
    return res.status(404).json({
      success: false,
      message: "Route not found"
    });
  }
);
// Routes
app.use("/api/auth", authRouter);
app.use("/api/governance", governanceRouter);
app.use("/api/approvals", approvalRouter);
app.use("/api/audit-logs", auditRouter);

// Global error handler.
app.use(
  (error, req, res, next) => {
    console.error(error);

    return res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Internal server error"
    });
  }
);

export default app;